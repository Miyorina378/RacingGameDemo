import * as THREE from 'three';
import { TrackConfig, TrackNode, TrackScenery, TrackSpur } from '../config/TrackDatabase';
import { buildCenterline } from './centerline';
import { CURB_WIDTH, getSpurJunctions, resolveTrackNodes } from './trackNodes';
import {
  InstanceVariation,
  emissiveStrengthFor,
  gradeColor,
  getWindowTexture,
  makeBuildingGeometry,
  positionNoise,
  variationAt
} from './sceneryDecor';
import { TimeOfDay } from '../engine/types';
import {
  CellRect,
  Heightmap,
  TERRAIN_CELL_SIZE,
  cellToWorld,
  conformToRoad,
  worldToCell
} from './terrain';
import { GameEngine } from '../gameEngine';
import { Vehicle } from '../objects/Vehicle';
import {
  GRASS_LEAF_COLORS,
  createGrassBladeGeometry,
  createGrassBladeMaterial,
  grassPatchRadius
} from '../objects/Grass';
import { ParticleSystem } from '../objects/ParticleSystem';

/** How long a freshly placed patch of grass takes to come up. */
const GRASS_GROW_SECONDS = 0.75;

interface SpurBarrier {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  halfWidth: number;
  halfDepth: number;
  height: number;
}

interface SpurRoadInfo {
  dist: number;
  sideSign: 1 | -1;
  closestPt: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  halfWidth: number;
  haveCurb: boolean;
  curbWidth: number;
  haveGrass: boolean;
  grassWidth: number;
  fence: boolean;
  trackBoundary: number;
  onAsphalt: boolean;
  onCurb: boolean;
  onGrass: boolean;
  baseHeight: number;
  spurIndex: number;
}

export interface GameMode {
  init(): void;
  update(deltaTime: number): void;
  cleanup(): void;
  reset(): void;
  handleFuelTow(): void;
}

export abstract class BaseMode implements GameMode {
  protected engine: GameEngine;
  protected scene: THREE.Scene;
  protected vehicle: Vehicle;
  protected particles: ParticleSystem;
  protected environmentGroup: THREE.Group;
  protected keys: { [key: string]: boolean };

  protected gridHelper1?: THREE.GridHelper;
  protected gridHelper2?: THREE.GridHelper;
  protected sunMesh?: THREE.Mesh;

  protected roadSamplePoints: THREE.Vector3[] = [];
  protected roadSampleWidths: number[] = [];
  protected roadSampleBankings: number[] = [];
  protected roadSampleLeftCurbs: boolean[] = [];
  protected roadSampleRightCurbs: boolean[] = [];
  protected roadSampleLeftGrassWidths: number[] = [];
  protected roadSampleRightGrassWidths: number[] = [];
  protected roadSampleLeftFences: boolean[] = [];
  protected roadSampleRightFences: boolean[] = [];
  protected roadSampleLeftPoints: THREE.Vector3[] = [];
  protected roadSampleRightPoints: THREE.Vector3[] = [];
  protected roadSampleLeftScale: number[] = [];
  protected roadSampleRightScale: number[] = [];
  /**
   * Fractional position in node-index space at each road sample, so a point on the
   * ribbon can be traced back to the pair of nodes it lies between. The editor uses
   * it to drop a new node into the right place in the lap.
   */
  protected roadSampleNodeIndex: number[] = [];
  protected roadWidth: number = 14;
  protected curbWidth: number = CURB_WIDTH;
  /** Sculpted ground under the whole map. Empty means a flat world at y = 0. */
  public terrain = new Heightmap();
  protected terrainMesh: THREE.Mesh | null = null;
  private terrainCols = 0;
  private terrainRows = 0;
  private terrainMinCol = 0;
  private terrainMinRow = 0;
  protected curbHeight: number = 0.15;
  protected grassWidth: number = 5.0;
  protected haveGrass: boolean = false;
  protected haveFence: boolean = false;
  protected haveCurb: boolean = false;
  protected trackBoundary: number = 0;
  protected grassUniforms = { uTime: { value: 0 } };
  /**
   * Drivable surface of each blocked branch. Kept apart from roadSample* on purpose:
   * the racing line, the lap count and the wrong-way check must only ever know about
   * the circuit, but a car that turns off onto a branch still needs ground under it.
   */
  protected spurSurfaces: {
    samples: THREE.Vector3[];
    normals: THREE.Vector3[];
    tangents: THREE.Vector3[];
    /** Samples where the flare visually removes curb, grass, and fence. */
    openSamples: boolean[];
    /** Asphalt half-width can widen through a junction flare. */
    leftWidths: number[];
    rightWidths: number[];
    left: {
      haveCurb: boolean;
      curbWidth: number;
      grassWidth: number;
      fence: boolean;
    };
    right: {
      haveCurb: boolean;
      curbWidth: number;
      grassWidth: number;
      fence: boolean;
    };
    maxReach: number;
    blocked: boolean;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    barriers: SpurBarrier[];
  }[] = [];
  /** Patches still sprouting, ticked by updateGrass and dropped once grown. */
  private grassGrowth: { grow: { value: number }; mat: THREE.MeshStandardMaterial }[] = [];
  /**
   * Whether new grass sprouts in or is simply there. The editor wants to watch it
   * come up as it is painted; a race wants the grass already grown.
   */
  protected grassGrowsIn = false;
  /**
   * Patch positions that have already sprouted this session. Static because the
   * editor throws the whole mode away and rebuilds it on every edit, and grass that
   * already came up must not come up again each time.
   */
  private static sproutedGrass = new Set<string>();
  protected roadUniforms = { uTime: { value: 0 }, uTimeOfDayVal: { value: 1.0 } };

  // Settings for concrete block dimensions (used by Silverstone catch fence)
  protected concreteTopWidth: number = 0.3;
  protected concreteBaseWidth: number = 0.6;
  protected concreteHeight: number = 2.0;

  constructor(
    engine: GameEngine,
    scene: THREE.Scene,
    vehicle: Vehicle,
    particles: ParticleSystem,
    environmentGroup: THREE.Group,
    keys: { [key: string]: boolean }
  ) {
    this.engine = engine;
    this.scene = scene;
    this.vehicle = vehicle;
    this.particles = particles;
    this.environmentGroup = environmentGroup;
    this.keys = keys;

    // Assign ground height and boundary callbacks to the player vehicle
    this.vehicle.getGroundHeight = (x: number, z: number, yHint?: number) =>
      this.getGroundHeight(x, z, yHint);
    this.vehicle.getSlopeHeight = (x: number, z: number, yHint?: number) =>
      this.getSlopeHeight(x, z, yHint);
    this.vehicle.getTrackInfo = (x: number, z: number, yHint?: number) =>
      this.getTrackInfo(x, z, yHint);
    this.vehicle.getSpurInfo = (x: number, z: number, yHint?: number) =>
      this.getSpurInfo(x, z, yHint);
    this.vehicle.getSpurBarriers = () => this.getSpurBarriers();
    this.vehicle.onFenceCollision = (contactPt: THREE.Vector3) => {
      this.particles.emitSparks(2, contactPt, 0xffaa00);
    };

  }

  public abstract init(): void;
  public abstract update(deltaTime: number): void;
  public abstract cleanup(): void;
  public abstract reset(): void;

  public handleFuelTow(): void {
    this.vehicle.refuel(1);
    this.engine.resetCar();
    this.engine.callbacks.onGameStatus(
      'playing',
      'OUT OF FUEL — TOWED AND REFUELED.'
    );
  }


  protected createGridFloor() {
    // Ground Grid helper 1 - Larger size 800 with 160 divisions (cell size = 5)
    this.gridHelper1 = new THREE.GridHelper(800, 160, 0x00ffff, 0x1e1e4a);
    this.gridHelper1.position.set(0, 0, 0);
    
    // Add a solid ground plane below the grid to hide the sky background and receive shadows
    const groundGeom = new THREE.PlaneGeometry(1600, 1600);
    const groundMat = new THREE.MeshStandardMaterial({ 
      color: 0x0a0a14,
      roughness: 0.9,
      metalness: 0.1
    });
    const groundMesh = new THREE.Mesh(groundGeom, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.1;
    groundMesh.receiveShadow = true;
    this.gridHelper1.add(groundMesh);

    this.environmentGroup.add(this.gridHelper1);

    // Synthwave Sun
    const sunGeom = new THREE.SphereGeometry(40, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    sunGeom.rotateX(Math.PI / 2);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xff0088,
      transparent: true,
      opacity: 0.85,
    });
    this.sunMesh = new THREE.Mesh(sunGeom, sunMat);
    this.sunMesh.position.set(0, 5, -450);
    this.environmentGroup.add(this.sunMesh);
  }

  protected updateScrollingFloor() {
    if (this.gridHelper1) {
      const carPos = this.vehicle.pos;

      // Snap position of grid helper to multiples of cell size (5 units) on both X and Z axis
      const snappedX = Math.round(carPos.x / 5) * 5;
      const snappedZ = Math.round(carPos.z / 5) * 5;
      this.gridHelper1.position.set(snappedX, 0, snappedZ);

      // Reposition sun to always stay ahead of car
      if (this.sunMesh) {
        this.sunMesh.position.x = carPos.x;
        this.sunMesh.position.z = carPos.z - 450;
      }
    }
  }

  protected updateGrass(deltaTime: number) {
    this.grassUniforms.uTime.value += deltaTime;
    this.roadUniforms.uTime.value += deltaTime;
    if (this.engine && this.engine.sky) {
      this.roadUniforms.uTimeOfDayVal.value = this.engine.sky.getTimeOfDayVal();
    }

    // Sprout freshly placed grass. Entries drop out once fully grown, so this costs
    // nothing on a map whose grass has already come up.
    if (this.grassGrowth.length > 0) {
      const step = deltaTime / GRASS_GROW_SECONDS;
      this.grassGrowth = this.grassGrowth.filter((entry) => {
        entry.grow.value = Math.min(1, entry.grow.value + step);
        // The ground mat leads slightly, so blades rise out of green, not out of dirt.
        entry.mat.opacity = Math.min(1, entry.grow.value * 1.8);
        return entry.grow.value < 1;
      });
    }
  }

  protected clearEnvironment() {
    // The materials these point at are about to be thrown away with the scene.
    this.grassGrowth = [];
    this.spurSurfaces = [];
    while (this.environmentGroup.children.length > 0) {
      const obj = this.environmentGroup.children[0];
      this.environmentGroup.remove(obj);
    }
  }

  /**
   * Builds the sculpted ground under the track. Must run before the road, since
   * the road's verges and getGroundHeight both read from it.
   */
  protected createTerrain(config: TrackConfig, time: TimeOfDay = 'afternoon') {
    this.terrain = Heightmap.deserialize(config.terrain);

    // Size the grid to the track plus a margin, so a small course does not pay
    // for a huge mesh and a big one still has ground out to the horizon.
    let extent = 400;
    for (const point of config.path) {
      const pos = 'isVector3' in point ? (point as THREE.Vector3) : (point as TrackNode).pos;
      extent = Math.max(extent, Math.abs(pos.x), Math.abs(pos.z));
    }
    const halfSpan = THREE.MathUtils.clamp(extent + 300, 800, 1280);

    this.terrainMinCol = worldToCell(-halfSpan);
    this.terrainMinRow = worldToCell(-halfSpan);
    this.terrainCols = worldToCell(halfSpan) - this.terrainMinCol;
    this.terrainRows = worldToCell(halfSpan) - this.terrainMinRow;

    const cols = this.terrainCols + 1;
    const rows = this.terrainRows + 1;
    const positions = new Float32Array(cols * rows * 3);
    const normals = new Float32Array(cols * rows * 3);
    const indices: number[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = (row * cols + col) * 3;
        positions[i] = cellToWorld(this.terrainMinCol + col);
        positions[i + 1] = this.terrain.get(this.terrainMinCol + col, this.terrainMinRow + row);
        positions[i + 2] = cellToWorld(this.terrainMinRow + row);
      }
    }
    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < cols - 1; col++) {
        const a = row * cols + col;
        indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geom.setIndex(indices);

    const mat = new THREE.MeshStandardMaterial({
      color: gradeColor(0x5c7a4a, time),
      roughness: 0.95,
      metalness: 0
    });
    this.terrainMesh = new THREE.Mesh(geom, mat);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.name = 'terrain';
    this.environmentGroup.add(this.terrainMesh);

    this.refreshTerrainRegion();
  }

  /**
   * Rewrites vertex heights and normals for one patch of terrain. Brush strokes
   * pass the rect they touched so a stroke costs the brush area, not the map.
   */
  public refreshTerrainRegion(rect?: CellRect) {
    if (!this.terrainMesh) return;
    const geom = this.terrainMesh.geometry;
    const position = geom.getAttribute('position') as THREE.BufferAttribute;
    const normal = geom.getAttribute('normal') as THREE.BufferAttribute;
    const cols = this.terrainCols + 1;
    const rows = this.terrainRows + 1;

    // One vertex of padding, because a moved cell also tilts its neighbours.
    const minCol = Math.max(0, (rect ? rect.minCol - this.terrainMinCol : 0) - 1);
    const maxCol = Math.min(cols - 1, (rect ? rect.maxCol - this.terrainMinCol : cols - 1) + 1);
    const minRow = Math.max(0, (rect ? rect.minRow - this.terrainMinRow : 0) - 1);
    const maxRow = Math.min(rows - 1, (rect ? rect.maxRow - this.terrainMinRow : rows - 1) + 1);
    if (minCol > maxCol || minRow > maxRow) return;

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        position.setY(
          row * cols + col,
          this.terrain.get(this.terrainMinCol + col, this.terrainMinRow + row)
        );
      }
    }

    // A heightfield's normal is exact from the slope, so central differences beat
    // a full computeVertexNormals pass over the whole mesh.
    const heightAt = (col: number, row: number) =>
      this.terrain.get(this.terrainMinCol + col, this.terrainMinRow + row);
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const dx = heightAt(col + 1, row) - heightAt(col - 1, row);
        const dz = heightAt(col, row + 1) - heightAt(col, row - 1);
        const n = new THREE.Vector3(-dx, 2 * TERRAIN_CELL_SIZE, -dz).normalize();
        normal.setXYZ(row * cols + col, n.x, n.y, n.z);
      }
    }

    position.needsUpdate = true;
    normal.needsUpdate = true;
    geom.computeBoundingSphere();
  }

  /**
   * Cut and fill: carves a shelf at road height along the whole track and ramps
   * the sides back out to whatever the terrain was already doing. This is what
   * puts a hill under a road that climbs, instead of leaving it on a ribbon.
   */
  public conformTerrainToRoad(corridor = 26, embankment = 90) {
    if (this.roadSamplePoints.length === 0) return;

    conformToRoad(
      this.terrain,
      (x, z) => {
        const info = this.getTrackInfo(x, z);
        // getTrackInfo always returns its nearest sample, so reject anything
        // beyond reach here rather than dragging distant ground to road height.
        if (info.dist > corridor + embankment) return null;
        return { distance: info.dist, height: info.closestPt.y };
      },
      {
        corridor,
        embankment,
        bounds: {
          minCol: this.terrainMinCol,
          minRow: this.terrainMinRow,
          maxCol: this.terrainMinCol + this.terrainCols,
          maxRow: this.terrainMinRow + this.terrainRows
        }
      }
    );

    this.refreshTerrainRegion();
  }

  protected createRacetrackRoad(config: TrackConfig) {
    const pathPointsRaw = config.path;
    if (pathPointsRaw.length < 3) {
      // Too few nodes for a ribbon. Drop the old samples rather than leaving them:
      // in the editor a track can be taken back below three nodes, and stale samples
      // would keep answering getGroundHeight with the previous layout's surface.
      this.roadSamplePoints = [];
      this.roadSampleLeftPoints = [];
      this.roadSampleRightPoints = [];
      this.roadSampleNodeIndex = [];
      return;
    }

    this.haveFence = config.HaveFence;
    this.haveGrass = config.HaveGrass ?? false;
    this.grassWidth = config.GrassWidth ?? 5.0;
    this.haveCurb = config.HaveCrub ?? false;

    const pathNodes = resolveTrackNodes(config);

    let maxTrackBoundary = config.roadWidth / 2;
    pathNodes.forEach((node) => {
      maxTrackBoundary = Math.max(maxTrackBoundary, node.reach);
    });
    this.haveCurb = pathNodes.some((node) => node.leftCurb || node.rightCurb);
    this.haveGrass = pathNodes.some(
      (node) => node.leftGrassWidth > 0.05 || node.rightGrassWidth > 0.05
    );
    this.haveFence = pathNodes.some(
      (node) => node.leftFence || node.rightFence
    );

    this.roadWidth = config.roadWidth;
    this.trackBoundary = maxTrackBoundary;

    // Sync values to the player vehicle
    this.vehicle.haveFence = this.haveFence;
    this.vehicle.trackBoundary = this.trackBoundary;
    this.vehicle.isOnGrass = (x: number, z: number, yHint?: number) =>
      this.isPointOnGrass(x, z, yHint);

    // 1. Use actual node y height
    const roadPoints = pathNodes.map(p => new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z));

    // 2. Create the closed loop centreline. Nodes flagged sharp break the spline
    //    into straight runs joined by a fillet; without any, this is the same
    //    Catmull-Rom curve it has always been.
    const centerline = buildCenterline(roadPoints, pathNodes, {
      curveType: config.curveType,
      tension: config.tension,
      roadWidth: config.roadWidth
    });
    const curve = centerline.curve;

    // 3. Generate sample points along the curve based on track length to keep segment size uniform
    const trackLength = curve.getLength();
    const segmentLength = 4.0; // Uniform length of 4 units per block
    const totalSamplePoints = Math.max(100, Math.round(trackLength / segmentLength));
    const samplePoints = curve.getSpacedPoints(totalSamplePoints);
    this.roadSamplePoints = samplePoints;
    
    // Calculate interpolated width, banking, and side options for each sample point
    const sampleWidths: number[] = [];
    const sampleBankings: number[] = [];
    const sampleLeftCurbs: boolean[] = [];
    const sampleRightCurbs: boolean[] = [];
    const sampleLeftGrassWidths: number[] = [];
    const sampleRightGrassWidths: number[] = [];
    const sampleLeftFences: boolean[] = [];
    const sampleRightFences: boolean[] = [];
    const sampleNodeIndex: number[] = [];
    for (let i = 0; i < samplePoints.length; i++) {
        // Handle closed curve last point duplicating the first
        const u = i === samplePoints.length - 1 ? 1 : i / (samplePoints.length - 1);
        const exactIdx = centerline.nodeIndexAt(u); // Arc-length position in node-index space
        sampleNodeIndex.push(exactIdx);
        const idx0 = Math.floor(exactIdx) % roadPoints.length;
        const idx1 = (idx0 + 1) % roadPoints.length;
        const frac = exactIdx - Math.floor(exactIdx);
        const nearestNode = frac < 0.5 ? pathNodes[idx0] : pathNodes[idx1];
        
        const w0 = pathNodes[idx0].width;
        const w1 = pathNodes[idx1].width;
        sampleWidths.push(w0 + (w1 - w0) * frac);

        const b0 = pathNodes[idx0].banking ?? 0;
        const b1 = pathNodes[idx1].banking ?? 0;
        sampleBankings.push(b0 + (b1 - b0) * frac);

        sampleLeftCurbs.push(nearestNode.leftCurb);
        sampleRightCurbs.push(nearestNode.rightCurb);
        sampleLeftGrassWidths.push(
          pathNodes[idx0].leftGrassWidth +
            (pathNodes[idx1].leftGrassWidth - pathNodes[idx0].leftGrassWidth) *
              frac
        );
        sampleRightGrassWidths.push(
          pathNodes[idx0].rightGrassWidth +
            (pathNodes[idx1].rightGrassWidth -
              pathNodes[idx0].rightGrassWidth) *
              frac
        );
        sampleLeftFences.push(nearestNode.leftFence);
        sampleRightFences.push(nearestNode.rightFence);
    }

    // Cut the way out for any branch before anything is built from these arrays: the
    // curb, grass and fence meshes, the self-intersection scaling and getTrackInfo all
    // read them, so the opening is consistent everywhere at once.
    this.openSamplesForSpurs(config, samplePoints, {
      leftCurbs: sampleLeftCurbs,
      rightCurbs: sampleRightCurbs,
      leftGrass: sampleLeftGrassWidths,
      rightGrass: sampleRightGrassWidths,
      leftFences: sampleLeftFences,
      rightFences: sampleRightFences
    });

    this.roadSampleWidths = sampleWidths;
    this.roadSampleBankings = sampleBankings;
    this.roadSampleLeftCurbs = sampleLeftCurbs;
    this.roadSampleRightCurbs = sampleRightCurbs;
    this.roadSampleLeftGrassWidths = sampleLeftGrassWidths;
    this.roadSampleRightGrassWidths = sampleRightGrassWidths;
    this.roadSampleLeftFences = sampleLeftFences;
    this.roadSampleRightFences = sampleRightFences;
    this.roadSampleNodeIndex = sampleNodeIndex;

    const leftPoints: THREE.Vector3[] = [];
    const rightPoints: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];

    for (let i = 0; i < samplePoints.length; i++) {
      const pt = samplePoints[i];

      const tangent = new THREE.Vector3();
      if (i < samplePoints.length - 1) {
        tangent.subVectors(samplePoints[i + 1], pt);
      } else {
        tangent.subVectors(samplePoints[1], samplePoints[0]);
      }
      if (tangent.lengthSq() < 0.0001) {
        tangent.set(0, 0, -1);
      } else {
        tangent.normalize();
      }

      const normal = new THREE.Vector3(0, 1, 0).cross(tangent);
      if (normal.lengthSq() < 0.0001) {
        normal.set(1, 0, 0);
      } else {
        normal.normalize();
      }

      normals.push(normal);
    }

    // Compute left and right scale factors to prevent self-intersection at sharp corners
    const leftScale = new Array(samplePoints.length).fill(1.0);
    const rightScale = new Array(samplePoints.length).fill(1.0);
    
    const getWMax = (idx: number) => {
      const w = sampleWidths[idx] / 2;
      const left =
        w +
        (sampleLeftCurbs[idx] ? this.curbWidth : 0) +
        sampleLeftGrassWidths[idx];
      const right =
        w +
        (sampleRightCurbs[idx] ? this.curbWidth : 0) +
        sampleRightGrassWidths[idx];
      return Math.max(left, right);
    };

    const safety = 0.85;

    for (let i = 0; i < samplePoints.length; i++) {
      const next_i = (i + 1) % samplePoints.length;
      
      const P_i = samplePoints[i];
      const P_next = samplePoints[next_i];
      const N_i = normals[i];
      const N_next = normals[next_i];
      
      const dx = P_next.x - P_i.x;
      const dz = P_next.z - P_i.z;
      
      const det = N_next.x * N_i.z - N_i.x * N_next.z;
      if (Math.abs(det) > 1e-5) {
        const s = (dz * N_next.x - dx * N_next.z) / det;
        const t = (N_i.x * dz - dx * N_i.z) / det;
        
        if (s > 0 && t > 0) {
          const limit_i = s * safety;
          const limit_next = t * safety;
          
          const maxW_i = getWMax(i);
          const maxW_next = getWMax(next_i);
          
          if (maxW_i > limit_i) {
            leftScale[i] = Math.min(leftScale[i], limit_i / maxW_i);
          }
          if (maxW_next > limit_next) {
            leftScale[next_i] = Math.min(leftScale[next_i], limit_next / maxW_next);
          }
        } else if (s < 0 && t < 0) {
          const limit_i = -s * safety;
          const limit_next = -t * safety;
          
          const maxW_i = getWMax(i);
          const maxW_next = getWMax(next_i);
          
          if (maxW_i > limit_i) {
            rightScale[i] = Math.min(rightScale[i], limit_i / maxW_i);
          }
          if (maxW_next > limit_next) {
            rightScale[next_i] = Math.min(rightScale[next_i], limit_next / maxW_next);
          }
        }
      }
    }

    const remoteOverlapStep = Math.max(
      3,
      Math.floor(samplePoints.length / 700)
    );
    const neighborSkip = Math.max(20, Math.floor(samplePoints.length * 0.025));
    for (let i = 0; i < samplePoints.length; i += remoteOverlapStep) {
      for (
        let j = i + neighborSkip;
        j < samplePoints.length;
        j += remoteOverlapStep
      ) {
        const wrappedGap = Math.min(
          Math.abs(j - i),
          samplePoints.length - Math.abs(j - i)
        );
        if (wrappedGap < neighborSkip) continue;

        const dx = samplePoints[i].x - samplePoints[j].x;
        const dz = samplePoints[i].z - samplePoints[j].z;
        const distance = Math.hypot(dx, dz);
        const heightGap = Math.abs(samplePoints[i].y - samplePoints[j].y);
        if (heightGap > 5.5) continue;
        const reachI = getWMax(i);
        const reachJ = getWMax(j);
        const neededClearance = reachI + reachJ + 3.0;

        if (distance < neededClearance) {
          const scaleI = THREE.MathUtils.clamp(
            (distance * 0.47) / Math.max(reachI, 1),
            0.25,
            1
          );
          const scaleJ = THREE.MathUtils.clamp(
            (distance * 0.47) / Math.max(reachJ, 1),
            0.25,
            1
          );
          leftScale[i] = Math.min(leftScale[i], scaleI);
          rightScale[i] = Math.min(rightScale[i], scaleI);
          leftScale[j] = Math.min(leftScale[j], scaleJ);
          rightScale[j] = Math.min(rightScale[j], scaleJ);
        }
      }
    }

    // Smooth the scale factors to make the transition very smooth
    const smoothScale = (arr: number[]) => {
      const smoothed = [...arr];
      for (let pass = 0; pass < 2; pass++) {
        const temp = [...smoothed];
        for (let i = 0; i < temp.length; i++) {
          const prev = temp[(i - 1 + temp.length) % temp.length];
          const next = temp[(i + 1) % temp.length];
          smoothed[i] = 0.25 * prev + 0.5 * temp[i] + 0.25 * next;
        }
      }
      return smoothed;
    };
    this.roadSampleLeftScale = smoothScale(leftScale);
    this.roadSampleRightScale = smoothScale(rightScale);

    const roadPointAt = (
      idx: number,
      lateralOffset: number,
      yOffset: number = 0.05
    ) => {
      const pt = samplePoints[idx];
      const normal = normals[idx];
      const halfWidth = Math.max(sampleWidths[idx] / 2, 1);
      const bankingAngle =
        (sampleBankings[idx] ?? 0) * (Math.PI / 180);
      const bankScale = Math.min(1, 12 / halfWidth);
      const bankHeight =
        Math.sin(bankingAngle) *
        THREE.MathUtils.clamp(lateralOffset, -halfWidth, halfWidth) *
        bankScale;
      const y = Math.max(pt.y - 1.1, pt.y + yOffset + bankHeight);

      return new THREE.Vector3(pt.x, y, pt.z).addScaledVector(
        normal,
        lateralOffset
      );
    };

    // 4. Create flat road surface geometry using a custom 2D ribbon mesh
    const roadGeom = new THREE.BufferGeometry();
    const roadPosArray = new Float32Array(samplePoints.length * 2 * 3);
    const roadIndexArray: number[] = [];

    for (let i = 0; i < samplePoints.length; i++) {
      const w = sampleWidths[i] / 2;
      const lScale = this.roadSampleLeftScale[i];
      const rScale = this.roadSampleRightScale[i];

      // Save points for boundaries and lines
      const left = roadPointAt(i, w * lScale);
      const right = roadPointAt(i, -w * rScale);
      leftPoints.push(left);
      rightPoints.push(right);

      roadPosArray[i * 6] = left.x;
      roadPosArray[i * 6 + 1] = left.y;
      roadPosArray[i * 6 + 2] = left.z;

      roadPosArray[i * 6 + 3] = right.x;
      roadPosArray[i * 6 + 4] = right.y;
      roadPosArray[i * 6 + 5] = right.z;
    }

    this.roadSampleLeftPoints = leftPoints;
    this.roadSampleRightPoints = rightPoints;

    for (let i = 0; i < samplePoints.length - 1; i++) {
      const currLeft = 2 * i;
      const currRight = 2 * i + 1;
      const nextLeft = 2 * (i + 1);
      const nextRight = 2 * (i + 1) + 1;

      roadIndexArray.push(currLeft, currRight, nextLeft);
      roadIndexArray.push(currRight, nextRight, nextLeft);
    }

    roadGeom.setAttribute('position', new THREE.BufferAttribute(roadPosArray, 3));
    roadGeom.setIndex(roadIndexArray);
    roadGeom.computeVertexNormals();

    // Actual dark asphalt material
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1f1f23, // Realistic dark grey asphalt
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const roadUniforms = this.roadUniforms;
    roadMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = roadUniforms.uTime;
      shader.uniforms.uTimeOfDayVal = roadUniforms.uTimeOfDayVal;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;`
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uTimeOfDayVal;
         varying vec3 vWorldPos;

         float hash2D(vec2 p) {
           return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
         }

         float noise2D(vec2 p) {
           vec2 i = floor(p);
           vec2 f = fract(p);
           vec2 u = f * f * (3.0 - 2.0 * f);
           return mix(mix(hash2D(i + vec2(0.0,0.0)), hash2D(i + vec2(1.0,0.0)), u.x),
                      mix(hash2D(i + vec2(0.0,1.0)), hash2D(i + vec2(1.0,1.0)), u.x), u.y);
         }`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         float grain = noise2D(vWorldPos.xz * 12.0) * 0.15;
         float microGrain = noise2D(vWorldPos.xz * 120.0) * 0.08;
         roughnessFactor = clamp(roughnessFactor + grain + microGrain, 0.0, 1.0);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float nightWeight = smoothstep(0.4, 0.9, uTimeOfDayVal);
         if (nightWeight > 0.01) {
           vec2 gridPos = abs(fract(vWorldPos.xz * 0.15 - 0.5) - 0.5) / fwidth(vWorldPos.xz * 0.15);
           float gridLine = min(gridPos.x, gridPos.y);
           float gridVal = 1.0 - min(gridLine, 1.0);

           float pulseWave = sin(vWorldPos.z * 0.04 - uTime * 3.5) * 0.5 + 0.5;
           pulseWave = pow(pulseWave, 16.0);

           vec3 gridColor = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 0.6), sin(vWorldPos.z * 0.005) * 0.5 + 0.5);

           vec3 neonGlow = gridColor * gridVal * (0.35 + pulseWave * 1.5) * nightWeight;
           gl_FragColor.rgb += neonGlow;
         }`
      );
    };

    const roadMesh = new THREE.Mesh(roadGeom, roadMat);
    roadMesh.receiveShadow = true;
    this.environmentGroup.add(roadMesh);

    // 5. Create White Edge lines
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const leftLineGeom = new THREE.BufferGeometry();
    const leftLinePos = new Float32Array(samplePoints.length * 2 * 3);
    const leftLineIndex: number[] = [];

    const rightLineGeom = new THREE.BufferGeometry();
    const rightLinePos = new Float32Array(samplePoints.length * 2 * 3);
    const rightLineIndex: number[] = [];

    const lineWidth = 0.15;

    for (let i = 0; i < samplePoints.length; i++) {
      const w = sampleWidths[i] / 2;
      const lScale = this.roadSampleLeftScale[i];
      const rScale = this.roadSampleRightScale[i];

      // Left edge line
      const l1 = roadPointAt(i, (w - 0.4) * lScale, 0.058);
      const l2 = roadPointAt(i, (w - 0.4 - lineWidth) * lScale, 0.058);
      leftLinePos[i * 6] = l1.x;
      leftLinePos[i * 6 + 1] = l1.y;
      leftLinePos[i * 6 + 2] = l1.z;
      leftLinePos[i * 6 + 3] = l2.x;
      leftLinePos[i * 6 + 4] = l2.y;
      leftLinePos[i * 6 + 5] = l2.z;

      // Right edge line
      const r1 = roadPointAt(i, (-w + 0.4) * rScale, 0.058);
      const r2 = roadPointAt(i, (-w + 0.4 + lineWidth) * rScale, 0.058);
      rightLinePos[i * 6] = r1.x;
      rightLinePos[i * 6 + 1] = r1.y;
      rightLinePos[i * 6 + 2] = r1.z;
      rightLinePos[i * 6 + 3] = r2.x;
      rightLinePos[i * 6 + 4] = r2.y;
      rightLinePos[i * 6 + 5] = r2.z;
    }

    for (let i = 0; i < samplePoints.length - 1; i++) {
      const currL = 2 * i;
      const nextL = 2 * (i + 1);
      leftLineIndex.push(currL, currL + 1, nextL);
      leftLineIndex.push(currL + 1, nextL + 1, nextL);
      rightLineIndex.push(currL, currL + 1, nextL);
      rightLineIndex.push(currL + 1, nextL + 1, nextL);
    }

    leftLineGeom.setAttribute('position', new THREE.BufferAttribute(leftLinePos, 3));
    leftLineGeom.setIndex(leftLineIndex);
    leftLineGeom.computeVertexNormals();
    const leftLineMesh = new THREE.Mesh(leftLineGeom, lineMat);
    leftLineMesh.receiveShadow = true;
    this.environmentGroup.add(leftLineMesh);

    rightLineGeom.setAttribute('position', new THREE.BufferAttribute(rightLinePos, 3));
    rightLineGeom.setIndex(rightLineIndex);
    rightLineGeom.computeVertexNormals();
    const rightLineMesh = new THREE.Mesh(rightLineGeom, lineMat);
    rightLineMesh.receiveShadow = true;
    this.environmentGroup.add(rightLineMesh);

    // 6. Create Yellow Dashed Center Line
    const centerLineGeom = new THREE.BufferGeometry();
    const centerLinePos: number[] = [];
    const centerLineIndex: number[] = [];
    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      roughness: 0.6,
      side: THREE.DoubleSide
    });

    let centerVertIndex = 0;
    for (let i = 0; i < samplePoints.length - 1; i++) {
      // Draw dashes: 3 segments visible, 3 segments blank
      if (Math.floor(i / 4) % 2 === 0) {
        const ptCenter = new THREE.Vector3().addVectors(leftPoints[i], rightPoints[i]).multiplyScalar(0.5);
        const ptCenterNext = new THREE.Vector3().addVectors(leftPoints[i + 1], rightPoints[i + 1]).multiplyScalar(0.5);
        const normal = normals[i];
        const normalNext = normals[i + 1];

        // Elevate center line slightly to prevent z-fighting
        const c1 = new THREE.Vector3(ptCenter.x, ptCenter.y + 0.002, ptCenter.z).addScaledVector(normal, 0.1);
        const c2 = new THREE.Vector3(ptCenter.x, ptCenter.y + 0.002, ptCenter.z).addScaledVector(normal, -0.1);
        const c1Next = new THREE.Vector3(ptCenterNext.x, ptCenterNext.y + 0.002, ptCenterNext.z).addScaledVector(normalNext, 0.1);
        const c2Next = new THREE.Vector3(ptCenterNext.x, ptCenterNext.y + 0.002, ptCenterNext.z).addScaledVector(normalNext, -0.1);

        centerLinePos.push(c1.x, c1.y, c1.z);
        centerLinePos.push(c2.x, c2.y, c2.z);
        centerLinePos.push(c1Next.x, c1Next.y, c1Next.z);
        centerLinePos.push(c2Next.x, c2Next.y, c2Next.z);

        const v0 = centerVertIndex;
        const v1 = centerVertIndex + 1;
        const v2 = centerVertIndex + 2;
        const v3 = centerVertIndex + 3;

        centerLineIndex.push(v0, v1, v2);
        centerLineIndex.push(v1, v3, v2);

        centerVertIndex += 4;
      }
    }

    if (centerLinePos.length > 0) {
      centerLineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(centerLinePos), 3));
      centerLineGeom.setIndex(centerLineIndex);
      centerLineGeom.computeVertexNormals();
      const centerLineMesh = new THREE.Mesh(centerLineGeom, yellowMat);
      centerLineMesh.receiveShadow = true;
      this.environmentGroup.add(centerLineMesh);
    }

    const hasAnyCurb =
      sampleLeftCurbs.some(Boolean) || sampleRightCurbs.some(Boolean);
    if (hasAnyCurb) {
      // 7. Create Alternating Red & White Curbs
      const redCurbGeom = new THREE.BufferGeometry();
      const whiteCurbGeom = new THREE.BufferGeometry();

      const redCurbPos: number[] = [];
      const redCurbIndex: number[] = [];
      let redCurbVertIndex = 0;

      const whiteCurbPos: number[] = [];
      const whiteCurbIndex: number[] = [];
      let whiteCurbVertIndex = 0;

      const curbWidth = this.curbWidth;
      const curbHeight = this.curbHeight;

      // Helper to add a 3D curb segment (top face + inner face)
      const addCurbFace = (
        innerB: THREE.Vector3, innerT: THREE.Vector3, outerT: THREE.Vector3,
        innerB_next: THREE.Vector3, innerT_next: THREE.Vector3, outerT_next: THREE.Vector3,
        posArray: number[], indexArray: number[], vertIndex: number
      ): number => {
        // Inner Face (Inner Bottom, Inner Top, Inner Bottom Next, Inner Top Next)
        posArray.push(innerB.x, innerB.y, innerB.z); // 0
        posArray.push(innerT.x, innerT.y, innerT.z); // 1
        posArray.push(innerB_next.x, innerB_next.y, innerB_next.z); // 2
        posArray.push(innerT_next.x, innerT_next.y, innerT_next.z); // 3

        // Top Face (Inner Top, Outer Top, Inner Top Next, Outer Top Next)
        posArray.push(innerT.x, innerT.y, innerT.z); // 4
        posArray.push(outerT.x, outerT.y, outerT.z); // 5
        posArray.push(innerT_next.x, innerT_next.y, innerT_next.z); // 6
        posArray.push(outerT_next.x, outerT_next.y, outerT_next.z); // 7

        // Indices
        // Inner face triangles
        indexArray.push(vertIndex + 0, vertIndex + 1, vertIndex + 2);
        indexArray.push(vertIndex + 1, vertIndex + 3, vertIndex + 2);

        // Top face triangles
        indexArray.push(vertIndex + 4, vertIndex + 5, vertIndex + 6);
        indexArray.push(vertIndex + 5, vertIndex + 7, vertIndex + 6);

        return vertIndex + 8;
      };

      for (let i = 0; i < samplePoints.length; i++) {
        const next_i = (i + 1) % samplePoints.length;

        // Alternate red and white every segment for smaller, tighter blocks (was every 4)
        const isRed = i % 2 === 0;

        const normal = normals[i];
        const normalNext = normals[next_i];

        const lScale = this.roadSampleLeftScale[i];
        const lScaleNext = this.roadSampleLeftScale[next_i];
        const rScale = this.roadSampleRightScale[i];
        const rScaleNext = this.roadSampleRightScale[next_i];
        const hasLeftCurbSegment =
          sampleLeftCurbs[i] || sampleLeftCurbs[next_i];
        const hasRightCurbSegment =
          sampleRightCurbs[i] || sampleRightCurbs[next_i];

        // Add Left side curbs
        const l_inner_bottom = leftPoints[i];
        const l_inner_top = new THREE.Vector3(l_inner_bottom.x, l_inner_bottom.y + curbHeight, l_inner_bottom.z);
        const l_outer_top = new THREE.Vector3().copy(l_inner_top).addScaledVector(normal, curbWidth * lScale);

        const l_inner_bottom_next = leftPoints[next_i];
        const l_inner_top_next = new THREE.Vector3(l_inner_bottom_next.x, l_inner_bottom_next.y + curbHeight, l_inner_bottom_next.z);
        const l_outer_top_next = new THREE.Vector3().copy(l_inner_top_next).addScaledVector(normalNext, curbWidth * lScaleNext);

        // Add Right side curbs
        const r_inner_bottom = rightPoints[i];
        const r_inner_top = new THREE.Vector3(r_inner_bottom.x, r_inner_bottom.y + curbHeight, r_inner_bottom.z);
        const r_outer_top = new THREE.Vector3().copy(r_inner_top).addScaledVector(normal, -curbWidth * rScale);

        const r_inner_bottom_next = rightPoints[next_i];
        const r_inner_top_next = new THREE.Vector3(r_inner_bottom_next.x, r_inner_bottom_next.y + curbHeight, r_inner_bottom_next.z);
        const r_outer_top_next = new THREE.Vector3().copy(r_inner_top_next).addScaledVector(normalNext, -curbWidth * rScaleNext);

        if (isRed) {
          // Update red indexes sequentially for both left and right curbs
          if (hasLeftCurbSegment) {
            redCurbVertIndex = addCurbFace(
              l_inner_bottom, l_inner_top, l_outer_top,
              l_inner_bottom_next, l_inner_top_next, l_outer_top_next,
              redCurbPos, redCurbIndex, redCurbVertIndex
            );
          }
          if (hasRightCurbSegment) {
            redCurbVertIndex = addCurbFace(
              r_inner_bottom, r_inner_top, r_outer_top,
              r_inner_bottom_next, r_inner_top_next, r_outer_top_next,
              redCurbPos, redCurbIndex, redCurbVertIndex
            );
          }
        } else {
          // Update white indexes sequentially for both left and right curbs
          if (hasLeftCurbSegment) {
            whiteCurbVertIndex = addCurbFace(
              l_inner_bottom, l_inner_top, l_outer_top,
              l_inner_bottom_next, l_inner_top_next, l_outer_top_next,
              whiteCurbPos, whiteCurbIndex, whiteCurbVertIndex
            );
          }
          if (hasRightCurbSegment) {
            whiteCurbVertIndex = addCurbFace(
              r_inner_bottom, r_inner_top, r_outer_top,
              r_inner_bottom_next, r_inner_top_next, r_outer_top_next,
              whiteCurbPos, whiteCurbIndex, whiteCurbVertIndex
            );
          }
        }
      }

      const redCurbMat = new THREE.MeshStandardMaterial({
        color: 0xef4444, // Red
        emissive: 0xef4444,
        emissiveIntensity: 0.7,
        roughness: 0.5,
        metalness: 0.2,
        side: THREE.DoubleSide
      });

      const whiteCurbMat = new THREE.MeshStandardMaterial({
        color: 0xfafafa, // White
        emissive: 0xfafafa,
        emissiveIntensity: 0.35,
        roughness: 0.5,
        metalness: 0.2,
        side: THREE.DoubleSide
      });

      const curbUniforms = this.roadUniforms;
      redCurbMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = curbUniforms.uTime;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           float pulse = sin(uTime * 3.5) * 0.25 + 0.75;
           gl_FragColor.rgb += vec3(0.5, 0.0, 0.0) * pulse;`
        );
      };

      whiteCurbMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = curbUniforms.uTime;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           float pulse = sin(uTime * 3.5 + 3.14159) * 0.15 + 0.35;
           gl_FragColor.rgb += vec3(0.2, 0.2, 0.2) * pulse;`
        );
      };

      if (redCurbPos.length > 0) {
        redCurbGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(redCurbPos), 3));
        redCurbGeom.setIndex(redCurbIndex);
        redCurbGeom.computeVertexNormals();
        const redCurbMesh = new THREE.Mesh(redCurbGeom, redCurbMat);
        redCurbMesh.receiveShadow = true;
        this.environmentGroup.add(redCurbMesh);
      }

      if (whiteCurbPos.length > 0) {
        whiteCurbGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(whiteCurbPos), 3));
        whiteCurbGeom.setIndex(whiteCurbIndex);
        whiteCurbGeom.computeVertexNormals();
        const whiteCurbMesh = new THREE.Mesh(whiteCurbGeom, whiteCurbMat);
        whiteCurbMesh.receiveShadow = true;
        this.environmentGroup.add(whiteCurbMesh);
      }
    }

    // 7.5. Create Grass Ribbon (after curb but before fence)
    const hasAnyGrass =
      sampleLeftGrassWidths.some((width) => width > 0.05) ||
      sampleRightGrassWidths.some((width) => width > 0.05);
    if (hasAnyGrass) {
      const grassGeom = new THREE.BufferGeometry();
      const grassPos: number[] = [];
      const grassIndex: number[] = [];
      let grassVertIndex = 0;

      for (let i = 0; i < samplePoints.length; i++) {
        const next_i = (i + 1) % samplePoints.length;
        const pt = samplePoints[i];
        const ptNext = samplePoints[next_i];
        const normal = normals[i];
        const normalNext = normals[next_i];

        const lScale = this.roadSampleLeftScale[i];
        const lScaleNext = this.roadSampleLeftScale[next_i];
        const rScale = this.roadSampleRightScale[i];
        const rScaleNext = this.roadSampleRightScale[next_i];

        const leftGrassWidth = sampleLeftGrassWidths[i];
        const leftGrassWidthNext = sampleLeftGrassWidths[next_i];
        const rightGrassWidth = sampleRightGrassWidths[i];
        const rightGrassWidthNext = sampleRightGrassWidths[next_i];
        const hasLeftGrassSegment =
          leftGrassWidth > 0.05 || leftGrassWidthNext > 0.05;
        const hasRightGrassSegment =
          rightGrassWidth > 0.05 || rightGrassWidthNext > 0.05;

        const l_innerOffset =
          (this.roadSampleWidths[i] / 2 +
            (sampleLeftCurbs[i] ? this.curbWidth : 0)) *
          lScale;
        const l_innerOffsetNext =
          (this.roadSampleWidths[next_i] / 2 +
            (sampleLeftCurbs[next_i] ? this.curbWidth : 0)) *
          lScaleNext;
        const l_outerOffset = l_innerOffset + leftGrassWidth * lScale;
        const l_outerOffsetNext =
          l_innerOffsetNext + leftGrassWidthNext * lScaleNext;

        const r_innerOffset =
          (this.roadSampleWidths[i] / 2 +
            (sampleRightCurbs[i] ? this.curbWidth : 0)) *
          rScale;
        const r_innerOffsetNext =
          (this.roadSampleWidths[next_i] / 2 +
            (sampleRightCurbs[next_i] ? this.curbWidth : 0)) *
          rScaleNext;
        const r_outerOffset = r_innerOffset + rightGrassWidth * rScale;
        const r_outerOffsetNext =
          r_innerOffsetNext + rightGrassWidthNext * rScaleNext;

        const l_in_y =
          leftPoints[i].y + (sampleLeftCurbs[i] ? this.curbHeight : 0);
        const l_out_y = Math.max(pt.y + 0.02, l_in_y - 0.24);
        const l_in_y_next =
          leftPoints[next_i].y +
          (sampleLeftCurbs[next_i] ? this.curbHeight : 0);
        const l_out_y_next = Math.max(ptNext.y + 0.02, l_in_y_next - 0.24);

        const r_in_y =
          rightPoints[i].y + (sampleRightCurbs[i] ? this.curbHeight : 0);
        const r_out_y = Math.max(pt.y + 0.02, r_in_y - 0.24);
        const r_in_y_next =
          rightPoints[next_i].y +
          (sampleRightCurbs[next_i] ? this.curbHeight : 0);
        const r_out_y_next = Math.max(ptNext.y + 0.02, r_in_y_next - 0.24);

        // Left grass vertices (sloped from innerHeight down to outerHeight)
        const l_in = new THREE.Vector3(pt.x, l_in_y, pt.z).addScaledVector(normal, l_innerOffset);
        const l_out = new THREE.Vector3(pt.x, l_out_y, pt.z).addScaledVector(normal, l_outerOffset);
        
        const l_in_next = new THREE.Vector3(ptNext.x, l_in_y_next, ptNext.z).addScaledVector(normalNext, l_innerOffsetNext);
        const l_out_next = new THREE.Vector3(ptNext.x, l_out_y_next, ptNext.z).addScaledVector(normalNext, l_outerOffsetNext);

        // Right grass vertices
        const r_in = new THREE.Vector3(pt.x, r_in_y, pt.z).addScaledVector(normal, -r_innerOffset);
        const r_out = new THREE.Vector3(pt.x, r_out_y, pt.z).addScaledVector(normal, -r_outerOffset);
        
        const r_in_next = new THREE.Vector3(ptNext.x, r_in_y_next, ptNext.z).addScaledVector(normalNext, -r_innerOffsetNext);
        const r_out_next = new THREE.Vector3(ptNext.x, r_out_y_next, ptNext.z).addScaledVector(normalNext, -r_outerOffsetNext);

        // Left side grass ground
        if (hasLeftGrassSegment) {
          grassPos.push(l_in.x, l_in.y, l_in.z);
          grassPos.push(l_out.x, l_out.y, l_out.z);
          grassPos.push(l_in_next.x, l_in_next.y, l_in_next.z);
          grassPos.push(l_out_next.x, l_out_next.y, l_out_next.z);

          grassIndex.push(grassVertIndex + 0, grassVertIndex + 1, grassVertIndex + 2);
          grassIndex.push(grassVertIndex + 1, grassVertIndex + 3, grassVertIndex + 2);
          grassVertIndex += 4;
        }

        // Right side grass ground
        if (hasRightGrassSegment) {
          grassPos.push(r_in.x, r_in.y, r_in.z);
          grassPos.push(r_out.x, r_out.y, r_out.z);
          grassPos.push(r_in_next.x, r_in_next.y, r_in_next.z);
          grassPos.push(r_out_next.x, r_out_next.y, r_out_next.z);

          grassIndex.push(grassVertIndex + 0, grassVertIndex + 2, grassVertIndex + 1);
          grassIndex.push(grassVertIndex + 1, grassVertIndex + 2, grassVertIndex + 3);
          grassVertIndex += 4;
        }
      }

      grassGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(grassPos), 3));
      grassGeom.setIndex(grassIndex);
      grassGeom.computeVertexNormals();

      const grassMat = new THREE.MeshStandardMaterial({
        color: 0x7bb369, // User-requested fresh sage green ground
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.DoubleSide
      });

      const uniforms = this.grassUniforms;
      grassMat.customProgramCacheKey = () => 'grass_ground';
      grassMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.vertexShader = `
          uniform float uTime;
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          // Slight ground wave animation
          float wave = sin(position.x * 0.12 + position.z * 0.12 + uTime * 2.8) * 0.05;
          transformed.y += wave;
          `
        );
      };

      const grassMesh = new THREE.Mesh(grassGeom, grassMat);
      grassMesh.receiveShadow = true;
      this.environmentGroup.add(grassMesh);

      // Create 3D Grass Leaves/Blades growing out of the sloped ground. The blade
      // and its wind shader are shared with free-standing grass patches, so both
      // bend to the same gust instead of drifting apart as two copies.
      const bladeGeom = createGrassBladeGeometry();
      const leavesMat = createGrassBladeMaterial(uniforms);

      let bladesPerSegment = 150;
      const quality = this.engine.postProcessing ? this.engine.postProcessing.getQuality() : 'high';
      if (quality === 'medium') {
        bladesPerSegment = 50;
      } else if (quality === 'low') {
        bladesPerSegment = 0;
      }

      if (bladesPerSegment > 0) {
        const totalInstances = samplePoints.length * bladesPerSegment * 2;
        const grassBladesMesh = new THREE.InstancedMesh(bladeGeom, leavesMat, totalInstances);
        grassBladesMesh.receiveShadow = true;

        const leafColors = GRASS_LEAF_COLORS.map((hex) => new THREE.Color(hex));

        let bladeIndex = 0;
        const dummy = new THREE.Object3D();

        for (let i = 0; i < samplePoints.length; i++) {
          const pt = samplePoints[i];
          const normal = normals[i];

          const tangent = new THREE.Vector3();
          if (i < samplePoints.length - 1) {
            tangent.subVectors(samplePoints[i + 1], pt).normalize();
          } else {
            tangent.subVectors(samplePoints[1], samplePoints[0]).normalize();
          }

          for (let side = 0; side < 2; side++) {
            const sideSign = side === 0 ? 1 : -1;
            const scale = side === 0 ? this.roadSampleLeftScale[i] : this.roadSampleRightScale[i];
            const grassWidth =
              side === 0
                ? sampleLeftGrassWidths[i]
                : sampleRightGrassWidths[i];
            if (grassWidth <= 0.05) continue;

            const hasCurb =
              side === 0 ? sampleLeftCurbs[i] : sampleRightCurbs[i];
            const roadEdge = side === 0 ? leftPoints[i] : rightPoints[i];
            const innerHeight =
              roadEdge.y + (hasCurb ? this.curbHeight : 0);
            const outerHeight = Math.max(pt.y + 0.02, innerHeight - 0.24);
            const innerOffset =
              (this.roadSampleWidths[i] / 2 +
                (hasCurb ? this.curbWidth : 0)) *
              scale;

            for (let b = 0; b < bladesPerSegment; b++) {
              // Scatter randomly within the grass strip
              const randomNormOffset = innerOffset + Math.random() * grassWidth * scale;
              const randomTangOffset = (Math.random() - 0.5) * 4.0;

              const bladePos = new THREE.Vector3()
                .copy(pt)
                .addScaledVector(normal, sideSign * randomNormOffset)
                .addScaledVector(tangent, randomTangOffset);

              // Interpolate height on the slope
              const t = (randomNormOffset - innerOffset) / (grassWidth * (scale > 0.0001 ? scale : 1));
              bladePos.y = THREE.MathUtils.lerp(innerHeight, outerHeight, t);

              dummy.position.copy(bladePos);
              dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);

              const randomHeightScale = 0.7 + Math.random() * 0.6;
              const randomWidthScale = 0.8 + Math.random() * 0.4;
              dummy.scale.set(randomWidthScale, randomHeightScale, randomWidthScale);

              dummy.updateMatrix();
              grassBladesMesh.setMatrixAt(bladeIndex, dummy.matrix);

              // Set color
              const randColor = leafColors[Math.floor(Math.random() * leafColors.length)];
              grassBladesMesh.setColorAt(bladeIndex, randColor);

              bladeIndex++;
            }
          }
        }

        if (grassBladesMesh.instanceColor) {
          grassBladesMesh.instanceColor.needsUpdate = true;
        }
        this.environmentGroup.add(grassBladesMesh);
      }
    }

    // 8. Create Normal Racing Fences (Motorsport Steel Guardrails or Silverstone Catch Fences on Concrete Barriers)
    const hasAnyFence =
      sampleLeftFences.some(Boolean) || sampleRightFences.some(Boolean);
    if (hasAnyFence) {
      const FenceType = config.FenceType || 'guardrail';
      const leftBoundPoints: THREE.Vector3[] = [];
      const rightBoundPoints: THREE.Vector3[] = [];

      for (let i = 0; i < samplePoints.length; i++) {
        const pt = samplePoints[i];
        const normal = normals[i];
        const halfWidth = this.roadSampleWidths[i] / 2;
        const lScale = this.roadSampleLeftScale[i];
        const rScale = this.roadSampleRightScale[i];
        const totalOffsetL =
          (halfWidth +
            (sampleLeftCurbs[i] ? this.curbWidth : 0) +
            sampleLeftGrassWidths[i]) *
          lScale;
        const totalOffsetR =
          (halfWidth +
            (sampleRightCurbs[i] ? this.curbWidth : 0) +
            sampleRightGrassWidths[i]) *
          rScale;
        const leftRoadHeight =
          leftPoints[i].y + (sampleLeftCurbs[i] ? this.curbHeight : 0);
        const rightRoadHeight =
          rightPoints[i].y + (sampleRightCurbs[i] ? this.curbHeight : 0);
        const leftBaseHeight =
          sampleLeftGrassWidths[i] > 0.05
            ? Math.max(pt.y + 0.05, leftRoadHeight - 0.24)
            : leftRoadHeight;
        const rightBaseHeight =
          sampleRightGrassWidths[i] > 0.05
            ? Math.max(pt.y + 0.05, rightRoadHeight - 0.24)
            : rightRoadHeight;

        // Left boundary point
        const leftBound = new THREE.Vector3(pt.x, leftBaseHeight, pt.z).addScaledVector(normal, totalOffsetL);
        // Right boundary point
        const rightBound = new THREE.Vector3(pt.x, rightBaseHeight, pt.z).addScaledVector(normal, -totalOffsetR);

        leftBoundPoints.push(leftBound);
        rightBoundPoints.push(rightBound);
      }

      // Render Concrete Barriers under the fences (only for Silverstone)
      const isSilverstone = FenceType === 'silverstone';
      const activeBlockHeight = isSilverstone ? this.concreteHeight : 0.0;

      const createConcreteBlock = (
        boundPts: THREE.Vector3[],
        normalSigns: number[],
        activeFlags: boolean[]
      ): THREE.Mesh => {
        const geom = new THREE.BufferGeometry();
        const vertices = new Float32Array(boundPts.length * 4 * 3);
        const indices: number[] = [];

        for (let i = 0; i < boundPts.length; i++) {
          const base = boundPts[i];
          const normalL = normals[i];
          const sign = normalSigns[i];

          const inB = base;
          const outB = base.clone().addScaledVector(normalL, sign * this.concreteBaseWidth);
          const inT = new THREE.Vector3(inB.x, inB.y + this.concreteHeight, inB.z);
          const outT = new THREE.Vector3(inB.x, inB.y + this.concreteHeight, inB.z).addScaledVector(normalL, sign * this.concreteTopWidth);

          const idx = i * 4;
          vertices[idx * 3] = inB.x;
          vertices[idx * 3 + 1] = inB.y;
          vertices[idx * 3 + 2] = inB.z;

          vertices[(idx + 1) * 3] = outB.x;
          vertices[(idx + 1) * 3 + 1] = outB.y;
          vertices[(idx + 1) * 3 + 2] = outB.z;

          vertices[(idx + 2) * 3] = inT.x;
          vertices[(idx + 2) * 3 + 1] = inT.y;
          vertices[(idx + 2) * 3 + 2] = inT.z;

          vertices[(idx + 3) * 3] = outT.x;
          vertices[(idx + 3) * 3 + 1] = outT.y;
          vertices[(idx + 3) * 3 + 2] = outT.z;
        }

        for (let i = 0; i < boundPts.length; i++) {
          const next_i = (i + 1) % boundPts.length;
          if (!activeFlags[i] && !activeFlags[next_i]) continue;

          const c_inB = i * 4;
          const c_inT = i * 4 + 2;
          const c_outT = i * 4 + 3;

          const n_inB = next_i * 4;
          const n_inT = next_i * 4 + 2;
          const n_outT = next_i * 4 + 3;

          // Inner Face (inB, inT, n_inB, n_inT)
          indices.push(c_inB, c_inT, n_inB);
          indices.push(c_inT, n_inT, n_inB);

          // Top Face (inT, outT, n_inT, n_outT)
          indices.push(c_inT, c_outT, n_inT);
          indices.push(c_outT, n_outT, n_inT);

          // Outer Face (outT, outB, n_outT, n_outB)
          const c_outB = i * 4 + 1;
          const n_outB = next_i * 4 + 1;
          indices.push(c_outT, c_outB, n_outT);
          indices.push(c_outB, n_outB, n_outT);
        }

        geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const concreteMat = new THREE.MeshStandardMaterial({
          color: 0xc4c4ca, // Silver concrete
          roughness: 0.95,
          metalness: 0.05,
          side: THREE.DoubleSide
        });

        return new THREE.Mesh(geom, concreteMat);
      };

      if (isSilverstone) {
        const leftConcreteSigns = Array(samplePoints.length).fill(1);
        const leftConcrete = createConcreteBlock(
          leftBoundPoints,
          leftConcreteSigns,
          sampleLeftFences
        );
        leftConcrete.castShadow = true;
        leftConcrete.receiveShadow = true;
        this.environmentGroup.add(leftConcrete);

        const rightConcreteSigns = Array(samplePoints.length).fill(-1);
        const rightConcrete = createConcreteBlock(
          rightBoundPoints,
          rightConcreteSigns,
          sampleRightFences
        );
        rightConcrete.castShadow = true;
        rightConcrete.receiveShadow = true;
        this.environmentGroup.add(rightConcrete);
      }

      if (FenceType === 'silverstone') {
        // --- SILVERSTONE CATCH FENCE (on top of concrete wall) ---
        const postMat = new THREE.MeshStandardMaterial({
          color: 0x4a4a50, // Dark grey poles
          metalness: 0.85,
          roughness: 0.3
        });

        const fenceMat = new THREE.MeshStandardMaterial({
          color: 0xcccccc, // Light grey wire mesh
          metalness: 0.5,
          roughness: 0.5,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide
        });

        const cableMat = new THREE.MeshStandardMaterial({
          color: 0x333338, // Dark steel cables
          metalness: 0.9,
          roughness: 0.2,
          side: THREE.DoubleSide
        });

        // 1. Draw leaning posts (InstancedMesh)
        const postGeom = new THREE.BoxGeometry(0.12, 3.0, 0.12); // Tall 3.0 height posts
        const totalPosts = Math.ceil(samplePoints.length / 3) * 2;
        const instancedPosts = new THREE.InstancedMesh(postGeom, postMat, totalPosts);
        instancedPosts.castShadow = true;
        instancedPosts.receiveShadow = true;

        let postCount = 0;
        const tempObj = new THREE.Object3D();

        for (let i = 0; i < samplePoints.length; i += 3) {
          const l_base = leftBoundPoints[i];
          const r_base = rightBoundPoints[i];
          const tangent = new THREE.Vector3();

          if (i < samplePoints.length - 1) {
            tangent.subVectors(samplePoints[i + 1], samplePoints[i]).normalize();
          } else {
            tangent.subVectors(samplePoints[1], samplePoints[0]).normalize();
          }

          // Left leaning post (tilted inwards, base shifted up to concrete top)
          if (sampleLeftFences[i]) {
            tempObj.position.set(l_base.x, l_base.y + activeBlockHeight, l_base.z);
            tempObj.lookAt(tempObj.position.clone().add(tangent));
            tempObj.rotateZ(-0.25); // tilt inwards (right)
            tempObj.translateY(1.5); // position half-height up
            tempObj.updateMatrix();
            instancedPosts.setMatrixAt(postCount++, tempObj.matrix);
          }

          // Right leaning post (tilted inwards, base shifted up to concrete top)
          if (sampleRightFences[i]) {
            tempObj.position.set(r_base.x, r_base.y + activeBlockHeight, r_base.z);
            tempObj.lookAt(tempObj.position.clone().add(tangent));
            tempObj.rotateZ(0.25); // tilt inwards (left)
            tempObj.translateY(1.5);
            tempObj.updateMatrix();
            instancedPosts.setMatrixAt(postCount++, tempObj.matrix);
          }
        }
        instancedPosts.count = postCount;
        this.environmentGroup.add(instancedPosts);

        // 2. Draw wire catch fence meshes
        const leftFenceGeom = new THREE.BufferGeometry();
        const leftFencePos = new Float32Array(samplePoints.length * 2 * 3);
        const leftFenceIndex: number[] = [];

        const rightFenceGeom = new THREE.BufferGeometry();
        const rightFencePos = new Float32Array(samplePoints.length * 2 * 3);
        const rightFenceIndex: number[] = [];

        for (let i = 0; i < samplePoints.length; i++) {
          const l_base = leftBoundPoints[i];
          const r_base = rightBoundPoints[i];

          // Leaning top coordinates: offset inwards from base
          const normalL = normals[i];
          const l_top = new THREE.Vector3(l_base.x, l_base.y + activeBlockHeight + 2.8, l_base.z).addScaledVector(normalL, -0.6); // lean inwards
          const r_top = new THREE.Vector3(r_base.x, r_base.y + activeBlockHeight + 2.8, r_base.z).addScaledVector(normalL, 0.6);  // lean inwards

          // Left fence top and bottom vertices
          leftFencePos[i * 6] = l_top.x;
          leftFencePos[i * 6 + 1] = l_top.y;
          leftFencePos[i * 6 + 2] = l_top.z;

          leftFencePos[i * 6 + 3] = l_base.x;
          leftFencePos[i * 6 + 4] = l_base.y + activeBlockHeight; // bottom starts at concrete top
          leftFencePos[i * 6 + 5] = l_base.z;

          // Right fence top and bottom vertices
          rightFencePos[i * 6] = r_top.x;
          rightFencePos[i * 6 + 1] = r_top.y;
          rightFencePos[i * 6 + 2] = r_top.z;

          rightFencePos[i * 6 + 3] = r_base.x;
          rightFencePos[i * 6 + 4] = r_base.y + activeBlockHeight; // bottom starts at concrete top
          rightFencePos[i * 6 + 5] = r_base.z;
        }

        for (let i = 0; i < samplePoints.length; i++) {
          const next_i = (i + 1) % samplePoints.length;
          const currTop = 2 * i;
          const currBottom = 2 * i + 1;
          const nextTop = 2 * next_i;
          const nextBottom = 2 * next_i + 1;

          if (sampleLeftFences[i] || sampleLeftFences[next_i]) {
            leftFenceIndex.push(currTop, currBottom, nextTop);
            leftFenceIndex.push(currBottom, nextBottom, nextTop);
          }

          if (sampleRightFences[i] || sampleRightFences[next_i]) {
            rightFenceIndex.push(currTop, currBottom, nextTop);
            rightFenceIndex.push(currBottom, nextBottom, nextTop);
          }
        }

        leftFenceGeom.setAttribute('position', new THREE.BufferAttribute(leftFencePos, 3));
        leftFenceGeom.setIndex(leftFenceIndex);
        leftFenceGeom.computeVertexNormals();
        const leftFenceMesh = new THREE.Mesh(leftFenceGeom, fenceMat);
        leftFenceMesh.castShadow = true;
        leftFenceMesh.receiveShadow = true;
        this.environmentGroup.add(leftFenceMesh);

        rightFenceGeom.setAttribute('position', new THREE.BufferAttribute(rightFencePos, 3));
        rightFenceGeom.setIndex(rightFenceIndex);
        rightFenceGeom.computeVertexNormals();
        const rightFenceMesh = new THREE.Mesh(rightFenceGeom, fenceMat);
        rightFenceMesh.castShadow = true;
        rightFenceMesh.receiveShadow = true;
        this.environmentGroup.add(rightFenceMesh);

        // 3. Draw horizontal cables (thin bands) running at y = concreteTop + 1.0, 2.0, 2.8
        const cableHeights = [1.0, 2.0, 2.8];
        cableHeights.forEach(h => {
          const leftCableGeom = new THREE.BufferGeometry();
          const leftCablePos = new Float32Array(samplePoints.length * 2 * 3);
          const leftCableIndex: number[] = [];

          const rightCableGeom = new THREE.BufferGeometry();
          const rightCablePos = new Float32Array(samplePoints.length * 2 * 3);
          const rightCableIndex: number[] = [];

          for (let i = 0; i < samplePoints.length; i++) {
            const l_base = leftBoundPoints[i];
            const r_base = rightBoundPoints[i];
            const normalL = normals[i];

            // Interpolate lean offset based on height fraction
            const leanOffsetFrac = h / 2.8;
            const l_pos = new THREE.Vector3(l_base.x, l_base.y + activeBlockHeight + h, l_base.z).addScaledVector(normalL, -0.6 * leanOffsetFrac);
            const r_pos = new THREE.Vector3(r_base.x, r_base.y + activeBlockHeight + h, r_base.z).addScaledVector(normalL, 0.6 * leanOffsetFrac);

            // Left cable vertices
            leftCablePos[i * 6] = l_pos.x;
            leftCablePos[i * 6 + 1] = l_pos.y + 0.02; // thin band
            leftCablePos[i * 6 + 2] = l_pos.z;

            leftCablePos[i * 6 + 3] = l_pos.x;
            leftCablePos[i * 6 + 4] = l_pos.y - 0.02;
            leftCablePos[i * 6 + 5] = l_pos.z;

            // Right cable vertices
            rightCablePos[i * 6] = r_pos.x;
            rightCablePos[i * 6 + 1] = r_pos.y + 0.02;
            rightCablePos[i * 6 + 2] = r_pos.z;

            rightCablePos[i * 6 + 3] = r_pos.x;
            rightCablePos[i * 6 + 4] = r_pos.y - 0.02;
            rightCablePos[i * 6 + 5] = r_pos.z;
          }

          for (let i = 0; i < samplePoints.length; i++) {
            const next_i = (i + 1) % samplePoints.length;
            const currTop = 2 * i;
            const currBottom = 2 * i + 1;
            const nextTop = 2 * next_i;
            const nextBottom = 2 * next_i + 1;

            if (sampleLeftFences[i] || sampleLeftFences[next_i]) {
              leftCableIndex.push(currTop, currBottom, nextTop);
              leftCableIndex.push(currBottom, nextBottom, nextTop);
            }

            if (sampleRightFences[i] || sampleRightFences[next_i]) {
              rightCableIndex.push(currTop, currBottom, nextTop);
              rightCableIndex.push(currBottom, nextBottom, nextTop);
            }
          }

          leftCableGeom.setAttribute('position', new THREE.BufferAttribute(leftCablePos, 3));
          leftCableGeom.setIndex(leftCableIndex);
          leftCableGeom.computeVertexNormals();
          const leftCableMesh = new THREE.Mesh(leftCableGeom, cableMat);
          leftCableMesh.castShadow = true;
          leftCableMesh.receiveShadow = true;
          this.environmentGroup.add(leftCableMesh);

          rightCableGeom.setAttribute('position', new THREE.BufferAttribute(rightCablePos, 3));
          rightCableGeom.setIndex(rightCableIndex);
          rightCableGeom.computeVertexNormals();
          const rightCableMesh = new THREE.Mesh(rightCableGeom, cableMat);
          rightCableMesh.castShadow = true;
          rightCableMesh.receiveShadow = true;
          this.environmentGroup.add(rightCableMesh);
        });

      } else {
        // --- MOTORSPORT STEEL GUARDRAILS ---
        const railMat = new THREE.MeshStandardMaterial({
          color: 0x8c8c94, // Steel gray
          metalness: 0.9,
          roughness: 0.25,
          side: THREE.DoubleSide
        });

        const postMat = new THREE.MeshStandardMaterial({
          color: 0x5a5a60, // Darker steel gray
          metalness: 0.8,
          roughness: 0.3
        });

        // Render Left Guardrail
        const leftRailGeom = new THREE.BufferGeometry();
        const leftRailPos = new Float32Array(samplePoints.length * 2 * 3);
        const leftRailIndex: number[] = [];

        // Render Right Guardrail
        const rightRailGeom = new THREE.BufferGeometry();
        const rightRailPos = new Float32Array(samplePoints.length * 2 * 3);
        const rightRailIndex: number[] = [];

        for (let i = 0; i < samplePoints.length; i++) {
          const l_base = leftBoundPoints[i];
          const r_base = rightBoundPoints[i];

          // Left top and bottom rail vertices
          leftRailPos[i * 6] = l_base.x;
          leftRailPos[i * 6 + 1] = l_base.y + activeBlockHeight + 0.9; // top of rail (0.9 units above ground / barrier)
          leftRailPos[i * 6 + 2] = l_base.z;

          leftRailPos[i * 6 + 3] = l_base.x;
          leftRailPos[i * 6 + 4] = l_base.y + activeBlockHeight + 0.3; // bottom of rail
          leftRailPos[i * 6 + 5] = l_base.z;

          // Right top and bottom rail vertices
          rightRailPos[i * 6] = r_base.x;
          rightRailPos[i * 6 + 1] = r_base.y + activeBlockHeight + 0.9;
          rightRailPos[i * 6 + 2] = r_base.z;

          rightRailPos[i * 6 + 3] = r_base.x;
          rightRailPos[i * 6 + 4] = r_base.y + activeBlockHeight + 0.3;
          rightRailPos[i * 6 + 5] = r_base.z;
        }

        for (let i = 0; i < samplePoints.length; i++) {
          const next_i = (i + 1) % samplePoints.length;
          const currTop = 2 * i;
          const currBottom = 2 * i + 1;
          const nextTop = 2 * next_i;
          const nextBottom = 2 * next_i + 1;

          if (sampleLeftFences[i] || sampleLeftFences[next_i]) {
            leftRailIndex.push(currTop, currBottom, nextTop);
            leftRailIndex.push(currBottom, nextBottom, nextTop);
          }

          if (sampleRightFences[i] || sampleRightFences[next_i]) {
            rightRailIndex.push(currTop, currBottom, nextTop);
            rightRailIndex.push(currBottom, nextBottom, nextTop);
          }
        }

        leftRailGeom.setAttribute('position', new THREE.BufferAttribute(leftRailPos, 3));
        leftRailGeom.setIndex(leftRailIndex);
        leftRailGeom.computeVertexNormals();
        const leftRailMesh = new THREE.Mesh(leftRailGeom, railMat);
        leftRailMesh.castShadow = true;
        leftRailMesh.receiveShadow = true;
        this.environmentGroup.add(leftRailMesh);

        rightRailGeom.setAttribute('position', new THREE.BufferAttribute(rightRailPos, 3));
        rightRailGeom.setIndex(rightRailIndex);
        rightRailGeom.computeVertexNormals();
        const rightRailMesh = new THREE.Mesh(rightRailGeom, railMat);
        rightRailMesh.castShadow = true;
        rightRailMesh.receiveShadow = true;
        this.environmentGroup.add(rightRailMesh);

        // Render Guardrail Posts using InstancedMesh for performance (placed every 3 segments)
        const postGeom = new THREE.BoxGeometry(0.16, 1.2, 0.16); // 1.2 units height
        const totalPosts = Math.ceil(samplePoints.length / 3) * 2;
        const instancedPosts = new THREE.InstancedMesh(postGeom, postMat, totalPosts);
        instancedPosts.castShadow = true;
        instancedPosts.receiveShadow = true;

        let postCount = 0;
        const tempObj = new THREE.Object3D();
        for (let i = 0; i < samplePoints.length; i += 3) {
          const l_base = leftBoundPoints[i];
          const r_base = rightBoundPoints[i];

          // Left post (slightly offset outwards along normal direction)
          const normalL = normals[i];
          if (sampleLeftFences[i]) {
            const postL_pos = l_base.clone().addScaledVector(normalL, 0.05); // push post behind the rail
            tempObj.position.set(postL_pos.x, postL_pos.y + activeBlockHeight + 0.6, postL_pos.z); // center of post
            tempObj.updateMatrix();
            instancedPosts.setMatrixAt(postCount++, tempObj.matrix);
          }

          // Right post (slightly offset outwards along negative normal direction)
          if (sampleRightFences[i]) {
            const postR_pos = r_base.clone().addScaledVector(normalL, -0.05);
            tempObj.position.set(postR_pos.x, postR_pos.y + activeBlockHeight + 0.6, postR_pos.z);
            tempObj.updateMatrix();
            instancedPosts.setMatrixAt(postCount++, tempObj.matrix);
          }
        }
        instancedPosts.count = postCount;
        this.environmentGroup.add(instancedPosts);
      }
    }
  }

  /**
   * Where a world position sits relative to the road ribbon.
   *
   * The answer comes from the nearest *segment*, not the nearest sample point.
   * Samples sit 4m apart, so reading one sample made every road property — the
   * surface height most of all — a staircase with a step every 4m. A car cannot
   * ride a staircase, which is why an elevated or climbing road behaved like
   * scenery the car happened to hover near rather than something it sat on.
   *
   * `frac` is how far along segment `closestIdx` the point falls, and is what
   * lets getGroundHeight interpolate the actual mesh quad the car is over.
   */
  public getTrackInfo(x: number, z: number, yHint?: number): {
    dist: number;
    closestPt: THREE.Vector3;
    closestIdx: number;
    /** Position along the segment from `closestIdx` to `closestIdx + 1`, 0..1. */
    frac: number;
    width: number;
    leftScale?: number;
    rightScale?: number;
    sideSign?: number;
    normal?: THREE.Vector3;
    trackBoundary?: number;
    banking?: number;
    curb?: boolean;
    grassWidth?: number;
    fence?: boolean;
  } {
    if (this.roadSamplePoints.length < 2) {
      return {
        dist: 0,
        closestPt: new THREE.Vector3(x, 0, z),
        closestIdx: 0,
        frac: 0,
        width: this.roadWidth,
        leftScale: 1.0,
        rightScale: 1.0,
        sideSign: 1,
        normal: new THREE.Vector3(1, 0, 0),
        trackBoundary: this.trackBoundary,
        banking: 0,
        curb: this.haveCurb,
        grassWidth: this.haveGrass ? this.grassWidth : 0,
        fence: this.haveFence
      };
    }

    let minDistSq = Infinity;
    let closestIdx = 0;
    const px = x;
    const pz = z;
    const len = this.roadSamplePoints.length;

    // Two-pass search: coarse pass checking every 10th point
    for (let i = 0; i < len; i += 10) {
      const spt = this.roadSamplePoints[i];
      const dx = spt.x - px;
      const dz = spt.z - pz;
      const dy = yHint === undefined ? 0 : spt.y - yHint;
      const distSq = dx * dx + dz * dz + dy * dy * 0.35;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestIdx = i;
      }
    }

    // Fine pass checking a local window around the closest coarse index
    const start = Math.max(0, closestIdx - 10);
    const end = Math.min(len - 1, closestIdx + 10);
    for (let i = start; i <= end; i++) {
      const spt = this.roadSamplePoints[i];
      const dx = spt.x - px;
      const dz = spt.z - pz;
      const dy = yHint === undefined ? 0 : spt.y - yHint;
      const distSq = dx * dx + dz * dz + dy * dy * 0.35;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestIdx = i;
      }
    }

    // Refine onto the ribbon itself by projecting across the segments either side
    // of that sample. A closed loop repeats its first point at the end, so segment
    // i always runs from sample i to sample i + 1.
    const segCount = len - 1;
    const closedLoop =
      segCount > 1 &&
      this.roadSamplePoints[0].distanceToSquared(this.roadSamplePoints[len - 1]) < 0.01;
    const wrapSeg = (i: number) =>
      closedLoop
        ? ((i % segCount) + segCount) % segCount
        : THREE.MathUtils.clamp(i, 0, segCount - 1);

    let segIdx = wrapSeg(closestIdx);
    let segFrac = 0;
    let bestOffsetSq = Infinity;
    for (let offset = -2; offset <= 1; offset++) {
      const s = wrapSeg(closestIdx + offset);
      const from = this.roadSamplePoints[s];
      const to = this.roadSamplePoints[s + 1];
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const lengthSq = dx * dx + dz * dz;
      if (lengthSq < 1e-8) continue;
      const t = THREE.MathUtils.clamp(
        ((px - from.x) * dx + (pz - from.z) * dz) / lengthSq,
        0,
        1
      );
      const offX = px - (from.x + dx * t);
      const offZ = pz - (from.z + dz * t);
      const offsetSq = offX * offX + offZ * offZ;
      if (offsetSq < bestOffsetSq) {
        bestOffsetSq = offsetSq;
        segIdx = s;
        segFrac = t;
      }
    }

    const nextIdx = segIdx + 1;
    const segStart = this.roadSamplePoints[segIdx];
    const segEnd = this.roadSamplePoints[nextIdx];
    const closestPt = new THREE.Vector3().lerpVectors(segStart, segEnd, segFrac);

    const lerpSample = (values: number[], fallback: number) => {
      const v0 = values[segIdx] ?? fallback;
      const v1 = values[nextIdx] ?? v0;
      return v0 + (v1 - v0) * segFrac;
    };
    // Per-side flags are one boolean per sample, so the nearer sample wins rather
    // than trying to interpolate an on/off.
    const flagIdx = segFrac < 0.5 ? segIdx : nextIdx;

    const width = lerpSample(this.roadSampleWidths, this.roadWidth);
    const lScale = lerpSample(this.roadSampleLeftScale, 1.0);
    const rScale = lerpSample(this.roadSampleRightScale, 1.0);

    // Compute sideSign (1 = left, -1 = right)
    const tangent = new THREE.Vector3(
      segEnd.x - segStart.x,
      0,
      segEnd.z - segStart.z
    );
    if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
    else tangent.normalize();
    const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();

    const toCar = new THREE.Vector3(px - closestPt.x, 0, pz - closestPt.z);
    const dot = toCar.dot(normal);
    const sideSign = dot >= 0 ? 1 : -1;
    const activeScale = sideSign === 1 ? lScale : rScale;
    const activeCurb =
      sideSign === 1
        ? this.roadSampleLeftCurbs[flagIdx]
        : this.roadSampleRightCurbs[flagIdx];
    const activeGrassWidth =
      lerpSample(
        sideSign === 1
          ? this.roadSampleLeftGrassWidths
          : this.roadSampleRightGrassWidths,
        0
      ) * activeScale;
    const activeFence =
      sideSign === 1
        ? this.roadSampleLeftFences[flagIdx]
        : this.roadSampleRightFences[flagIdx];

    // Calculate dynamic track boundary on this side
    const halfWidth = (width / 2) * activeScale;
    const trackBoundary =
      halfWidth +
      (activeCurb ? this.curbWidth * activeScale : 0) +
      activeGrassWidth;

    const banking = lerpSample(this.roadSampleBankings, 0);

    return {
      dist: Math.abs(dot),
      closestPt: closestPt,
      closestIdx: segIdx,
      frac: segFrac,
      width: halfWidth * 2,
      leftScale: lScale,
      rightScale: rScale,
      sideSign: sideSign,
      normal: normal.clone(),
      trackBoundary: trackBoundary,
      banking: banking,
      curb: activeCurb,
      grassWidth: activeGrassWidth,
      fence: activeFence
    };
  }

  /**
   * Cuts the gap a branch needs through the circuit's own side dressing.
   *
   * Per road sample, not per node. The side flags come from the nearest node and the
   * grass width is interpolated between nodes, so clearing a node's side opened a hole
   * running halfway to each neighbour — tens of metres of missing fence for a branch
   * six metres wide — and shrank that node's `reach`, which moves the corner fillet
   * and with it the racing line.
   *
   * Here the gap is as long as the branch is wide plus room to turn in, the grass
   * tapers back in either side of it instead of stopping dead, and because
   * getTrackInfo reads the same arrays, the fence is only absent exactly where the
   * car is meant to drive out.
   */
  private openSamplesForSpurs(
    config: TrackConfig,
    samplePoints: THREE.Vector3[],
    samples: {
      leftCurbs: boolean[];
      rightCurbs: boolean[];
      leftGrass: number[];
      rightGrass: number[];
      leftFences: boolean[];
      rightFences: boolean[];
    }
  ) {
    const junctions = getSpurJunctions(config);
    if (junctions.length === 0 || samplePoints.length < 4) return;

    const count = samplePoints.length;

    for (const junctionInfo of junctions) {
      // The junction is wherever the ribbon actually passes closest to that node,
      // which is not always the sample the node index would suggest once a corner
      // fillet has moved the centreline.
      let junction = 0;
      let bestDistSq = Infinity;
      for (let i = 0; i < count; i++) {
        const dx = samplePoints[i].x - junctionInfo.position.x;
        const dz = samplePoints[i].z - junctionInfo.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          junction = i;
        }
      }

      const ahead = samplePoints[(junction + 1) % count];
      const behind = samplePoints[(junction - 1 + count) % count];
      const tangent = new THREE.Vector3(ahead.x - behind.x, 0, ahead.z - behind.z);
      if (tangent.lengthSq() < 1e-8) continue;
      tangent.normalize();
      const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
      // The side is taken from the sample's own normal, so a fillet that shifted the
      // ribbon cannot open the wrong side of the road.
      const leftSide = junctionInfo.outward.dot(normal) >= 0;

      // A branch turning off at a shallow angle lies across the verge for much longer
      // than a perpendicular one, so the gap is stretched by how oblique the join is.
      const obliqueness = 1 / Math.max(0.35, junctionInfo.squareness);
      const gapHalf = Math.max(6, (junctionInfo.width / 2 + 3) * obliqueness);
      const featherHalf = gapHalf + Math.max(8, gapHalf);

      const curbs = leftSide ? samples.leftCurbs : samples.rightCurbs;
      const fences = leftSide ? samples.leftFences : samples.rightFences;
      const grass = leftSide ? samples.leftGrass : samples.rightGrass;

      const openAt = (index: number, distance: number) => {
        if (distance <= gapHalf) {
          curbs[index] = false;
          fences[index] = false;
          grass[index] = 0;
          return;
        }
        // Outside the gap the verge grows back over a short run, so the grass does
        // not end in a straight edge across the track.
        const t = THREE.MathUtils.clamp(
          (distance - gapHalf) / Math.max(1, featherHalf - gapHalf),
          0,
          1
        );
        grass[index] *= t;
        if (t < 0.4) curbs[index] = false;
      };

      openAt(junction, 0);
      for (const direction of [-1, 1]) {
        let index = junction;
        let distance = 0;
        while (distance <= featherHalf) {
          const step = ((index + direction) % count + count) % count;
          distance += samplePoints[index].distanceTo(samplePoints[step]);
          if (distance > featherHalf || step === junction) break;
          openAt(step, distance);
          index = step;
        }
      }
    }
  }

  /**
   * Builds the blocked-off branches: tarmac that leaves the circuit, runs a little
   * way, and stops at a barrier.
   *
   * Deliberately kept out of `roadSamplePoints` and friends. Those arrays are what
   * `getTrackInfo`, `getGroundHeight`, `isOnGrass`, the AI line and the lap logic all
   * read, and a branch in there would give every one of them two answers for the same
   * patch of ground.
   *
   * Must run after createRacetrackRoad, because the surface height at the junction
   * comes from the road that is already built.
   */
  protected createSpurRoads(
    spurs: TrackSpur[] | undefined,
    config: TrackConfig,
    time: TimeOfDay = 'afternoon'
  ) {
    this.spurSurfaces = [];
    if (!spurs || spurs.length === 0) return;

    // 1. Identical asphalt material matching main track roadMat
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: 0x1f1f23, // Exactly matching main track dark grey asphalt
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const roadUniforms = this.roadUniforms;
    asphaltMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = roadUniforms.uTime;
      shader.uniforms.uTimeOfDayVal = roadUniforms.uTimeOfDayVal;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;`
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uTimeOfDayVal;
         varying vec3 vWorldPos;

         float hash2D(vec2 p) {
           return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
         }

         float noise2D(vec2 p) {
           vec2 i = floor(p);
           vec2 f = fract(p);
           vec2 u = f * f * (3.0 - 2.0 * f);
           return mix(mix(hash2D(i + vec2(0.0,0.0)), hash2D(i + vec2(1.0,0.0)), u.x),
                      mix(hash2D(i + vec2(0.0,1.0)), hash2D(i + vec2(1.0,1.0)), u.x), u.y);
         }`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         float grain = noise2D(vWorldPos.xz * 12.0) * 0.15;
         float microGrain = noise2D(vWorldPos.xz * 120.0) * 0.08;
         roughnessFactor = clamp(roughnessFactor + grain + microGrain, 0.0, 1.0);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float nightWeight = smoothstep(0.4, 0.9, uTimeOfDayVal);
         if (nightWeight > 0.01) {
           vec2 gridPos = abs(fract(vWorldPos.xz * 0.15 - 0.5) - 0.5) / fwidth(vWorldPos.xz * 0.15);
           float gridLine = min(gridPos.x, gridPos.y);
           float gridVal = 1.0 - min(gridLine, 1.0);

           float pulseWave = sin(vWorldPos.z * 0.04 - uTime * 3.5) * 0.5 + 0.5;
           pulseWave = pow(pulseWave, 16.0);

           vec3 gridColor = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 0.6), sin(vWorldPos.z * 0.005) * 0.5 + 0.5);

           vec3 neonGlow = gridColor * gridVal * (0.35 + pulseWave * 1.5) * nightWeight;
           gl_FragColor.rgb += neonGlow;
         }`
      );
    };

    // Shared marking & barrier materials
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      roughness: 0.6,
      side: THREE.DoubleSide
    });

    const concreteMat = new THREE.MeshStandardMaterial({
      color: gradeColor(0x9fa19b, time),
      roughness: 0.88,
      metalness: 0.08
    });

    const chevronRedMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.35,
      roughness: 0.5
    });

    const chevronWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xf8fafc,
      emissiveIntensity: 0.2,
      roughness: 0.4
    });

    const tireRubberMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.95,
      metalness: 0.05
    });

    const tireWrapMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.4
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: gradeColor(0xa1a1aa, time),
      metalness: 0.85,
      roughness: 0.35
    });

    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });
    beaconMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = roadUniforms.uTime;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float strobe = pow(sin(uTime * 6.0) * 0.5 + 0.5, 4.0);
         gl_FragColor.rgb += vec3(1.0, 0.6, 0.0) * strobe * 1.5;`
      );
    };

    const coneOrangeMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.5
    });

    const coneStripeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3
    });

    const redCurbMat = new THREE.MeshStandardMaterial({
      color: gradeColor(0xd94444, time),
      roughness: 0.7,
      metalness: 0.1
    });

    const whiteCurbMat = new THREE.MeshStandardMaterial({
      color: gradeColor(0xefefef, time),
      roughness: 0.7,
      metalness: 0.1
    });

    type TrackMouth = {
      point: THREE.Vector3;
      halfWidth: number;
      flareLength: number;
    };

    /**
     * Finds where the branch centreline crosses the actual outside edge of the main
     * road. Starting there instead of at the node centre removes the thin strip laid
     * over the carriageway; the projected width also gives shallow joins a broad,
     * clamped apron instead of a pinched triangle.
     */
    const resolveTrackMouth = (
      nodeIndex: number | undefined,
      toward: THREE.Vector3,
      branchHalfWidth: number
    ): TrackMouth | undefined => {
      if (
        nodeIndex === undefined ||
        !config.path[nodeIndex] ||
        this.roadSamplePoints.length < 2
      ) {
        return undefined;
      }

      const rawNode = config.path[nodeIndex];
      const node = 'pos' in rawNode ? rawNode.pos : rawNode;
      let nearest = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < this.roadSamplePoints.length; i++) {
        const point = this.roadSamplePoints[i];
        const distance = (point.x - node.x) ** 2 + (point.z - node.z) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          nearest = i;
        }
      }

      const center = this.roadSamplePoints[nearest];
      const direction = new THREE.Vector3(toward.x - center.x, 0, toward.z - center.z);
      if (direction.lengthSq() < 1e-8) direction.set(1, 0, 0);
      else direction.normalize();

      const leftEdge = this.roadSampleLeftPoints[nearest];
      const rightEdge = this.roadSampleRightPoints[nearest];
      if (!leftEdge || !rightEdge) return undefined;
      const leftOffset = new THREE.Vector3(
        leftEdge.x - center.x,
        0,
        leftEdge.z - center.z
      );
      const rightOffset = new THREE.Vector3(
        rightEdge.x - center.x,
        0,
        rightEdge.z - center.z
      );
      // Pick by geometry rather than by the label. The road's internal winding can
      // flip its normal, but the edge with the larger projection is always the edge
      // the branch is actually heading toward.
      const edgeOffset =
        leftOffset.dot(direction) >= rightOffset.dot(direction) ? leftOffset : rightOffset;
      const edgeDistance = edgeOffset.length();
      if (edgeDistance < 1e-6) return undefined;
      const edgeOutward = edgeOffset.clone().multiplyScalar(1 / edgeDistance);
      const signedSquare = Math.max(0.2, direction.dot(edgeOutward));
      const travel = edgeDistance / signedSquare;
      // Pull the apron slightly into the main deck so raster precision can never
      // expose a hairline crack between the two independently built meshes.
      const point = center.clone().addScaledVector(direction, Math.max(0, travel - 0.75));
      point.y = this.getGroundHeight(point.x, point.z);

      const squareness = Math.max(0.35, signedSquare);
      const projected = branchHalfWidth / squareness + 1.25;
      const mouthHalfWidth = THREE.MathUtils.clamp(
        projected,
        branchHalfWidth + 1.25,
        branchHalfWidth * 2.5
      );
      return {
        point,
        halfWidth: mouthHalfWidth,
        flareLength: Math.max(12, branchHalfWidth * 2.5, mouthHalfWidth * 1.5)
      };
    };

    spurs.forEach((spur, spurIndex) => {
      if (spur.path.length === 0) return;

      const halfWidth = (spur.width ?? config.roadWidth * 0.8) / 2;
      const startTrackMouth = resolveTrackMouth(spur.nodeIndex, spur.path[0], halfWidth);
      const endTrackMouth = resolveTrackMouth(
        spur.endNodeIndex,
        spur.path[spur.path.length - 1],
        halfWidth
      );

      // Resolve non-track attachments with their old endpoint fallback. They still
      // receive an opening zone; main-track attachments additionally get the exact
      // edge intersection and angle-aware flare above.
      let mouth = startTrackMouth?.point.clone();
      if (!mouth && spur.startSpurIndex !== undefined && spurs[spur.startSpurIndex]?.path.length) {
        const target = spurs[spur.startSpurIndex].path;
        const point = target[target.length - 1];
        mouth = new THREE.Vector3(point.x, this.getGroundHeight(point.x, point.z), point.z);
      }

      let endMouth = endTrackMouth?.point.clone();
      if (!endMouth && spur.endSpurIndex !== undefined && spurs[spur.endSpurIndex]?.path.length) {
        const point = spurs[spur.endSpurIndex].path[0];
        endMouth = new THREE.Vector3(point.x, this.getGroundHeight(point.x, point.z), point.z);
      }

      const pathPoints: THREE.Vector3[] = [];
      if (mouth) pathPoints.push(mouth);
      pathPoints.push(...spur.path.map((point) => point.clone()));
      if (endMouth) pathPoints.push(endMouth);
      if (pathPoints.length < 2) return;

      const curve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.15);
      const totalLen = curve.getLength();
      const stepCount = Math.max(8, Math.round(totalLen / 3.0));
      const samples = curve.getPoints(stepCount);

      const surface: THREE.Vector3[] = [];
      const normals: THREE.Vector3[] = [];
      const tangents: THREE.Vector3[] = [];
      const authoredElevation = spur.elevationMode === 'authored';

      for (let i = 0; i < samples.length; i++) {
        const point = samples[i];
        const y = authoredElevation
          ? point.y + 0.05
          : this.getGroundHeight(point.x, point.z) + 0.05;
        surface.push(new THREE.Vector3(point.x, y, point.z));
      }
      // Junction endpoints belong to the surface they meet, regardless of spline
      // overshoot or the authored profile farther down the branch.
      if (mouth) surface[0].y = mouth.y + 0.05;
      if (endMouth) surface[surface.length - 1].y = endMouth.y + 0.05;

      for (let i = 0; i < surface.length; i++) {
        const previous = surface[Math.max(0, i - 1)];
        const next = surface[Math.min(surface.length - 1, i + 1)];
        const tangent = new THREE.Vector3().subVectors(next, previous);
        tangent.y = 0;
        if (tangent.lengthSq() < 1e-6) tangent.set(0, 0, 1);
        else tangent.normalize();
        tangents.push(tangent);
        normals.push(new THREE.Vector3(tangent.z, 0, -tangent.x));
      }

      const distanceFromStart: number[] = [0];
      for (let i = 1; i < surface.length; i++) {
        distanceFromStart.push(
          distanceFromStart[i - 1] + surface[i].distanceTo(surface[i - 1])
        );
      }
      const fullLength = distanceFromStart[distanceFromStart.length - 1] ?? 0;
      const startOpeningLength = mouth
        ? startTrackMouth?.flareLength ?? Math.max(8, halfWidth * 1.75)
        : 0;
      const endOpeningLength = endMouth
        ? endTrackMouth?.flareLength ?? Math.max(8, halfWidth * 1.75)
        : 0;
      const smooth = (value: number) => {
        const t = THREE.MathUtils.clamp(value, 0, 1);
        return t * t * (3 - 2 * t);
      };
      const flareWidth = (
        distance: number,
        attachment: TrackMouth | undefined,
        openingLength: number
      ) => {
        if (!attachment || openingLength <= 0 || distance >= openingLength) return halfWidth;
        return THREE.MathUtils.lerp(
          attachment.halfWidth,
          halfWidth,
          smooth(distance / openingLength)
        );
      };
      const leftWidths = surface.map((_, index) =>
        Math.max(
          flareWidth(distanceFromStart[index], startTrackMouth, startOpeningLength),
          flareWidth(fullLength - distanceFromStart[index], endTrackMouth, endOpeningLength)
        )
      );
      const rightWidths = [...leftWidths];
      const junctionOpenAt = (index: number) =>
        (startOpeningLength > 0 && distanceFromStart[index] < startOpeningLength) ||
        (endOpeningLength > 0 && fullLength - distanceFromStart[index] < endOpeningLength);

      const leftPositions: THREE.Vector3[] = [];
      const rightPositions: THREE.Vector3[] = [];
      for (let i = 0; i < surface.length; i++) {
        leftPositions.push(surface[i].clone().addScaledVector(normals[i], leftWidths[i]));
        rightPositions.push(surface[i].clone().addScaledVector(normals[i], -rightWidths[i]));
      }

      // 2. Build Tarmac Mesh (2 vertices per sample quad ribbon)
      const ribbonPositions: number[] = [];
      const ribbonIndices: number[] = [];

      for (let i = 0; i < surface.length; i++) {
        const left = leftPositions[i];
        const right = rightPositions[i];
        ribbonPositions.push(left.x, left.y, left.z);
        ribbonPositions.push(right.x, right.y, right.z);
      }

      for (let i = 0; i < surface.length - 1; i++) {
        const currL = 2 * i;
        const currR = 2 * i + 1;
        const nextL = 2 * (i + 1);
        const nextR = 2 * (i + 1) + 1;

        ribbonIndices.push(currL, currR, nextL);
        ribbonIndices.push(currR, nextR, nextL);
      }

      const ribbonGeom = new THREE.BufferGeometry();
      ribbonGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ribbonPositions), 3));
      ribbonGeom.setIndex(ribbonIndices);
      ribbonGeom.computeVertexNormals();

      const ribbonMesh = new THREE.Mesh(ribbonGeom, asphaltMat);
      ribbonMesh.receiveShadow = true;
      ribbonMesh.userData = { isSpur: true, spurIndex };
      this.environmentGroup.add(ribbonMesh);

      // 3. Crisp Road Markings (Edge lines & dashed centerline)
      const edgeLinePositions: number[] = [];
      const edgeLineIndices: number[] = [];
      let edgeVertIdx = 0;
      const lineWidth = 0.16;

      for (let i = 0; i < surface.length - 1; i++) {
        if (junctionOpenAt(i) || junctionOpenAt(i + 1)) continue;
        const p0 = surface[i];
        const p1 = surface[i + 1];
        const n0 = normals[i];
        const n1 = normals[i + 1];
        const leftWidth0 = leftWidths[i];
        const leftWidth1 = leftWidths[i + 1];
        const rightWidth0 = rightWidths[i];
        const rightWidth1 = rightWidths[i + 1];

        // Left white edge line
        const l0_out = new THREE.Vector3().copy(p0).addScaledVector(n0, leftWidth0 - 0.05);
        const l0_in = new THREE.Vector3().copy(p0).addScaledVector(n0, leftWidth0 - 0.05 - lineWidth);
        const l1_out = new THREE.Vector3().copy(p1).addScaledVector(n1, leftWidth1 - 0.05);
        const l1_in = new THREE.Vector3().copy(p1).addScaledVector(n1, leftWidth1 - 0.05 - lineWidth);

        edgeLinePositions.push(
          l0_out.x, l0_out.y + 0.008, l0_out.z,
          l0_in.x, l0_in.y + 0.008, l0_in.z,
          l1_out.x, l1_out.y + 0.008, l1_out.z,
          l1_in.x, l1_in.y + 0.008, l1_in.z
        );
        edgeLineIndices.push(
          edgeVertIdx, edgeVertIdx + 1, edgeVertIdx + 2,
          edgeVertIdx + 1, edgeVertIdx + 3, edgeVertIdx + 2
        );
        edgeVertIdx += 4;

        // Right white edge line
        const r0_out = new THREE.Vector3().copy(p0).addScaledVector(n0, -rightWidth0 + 0.05);
        const r0_in = new THREE.Vector3().copy(p0).addScaledVector(n0, -rightWidth0 + 0.05 + lineWidth);
        const r1_out = new THREE.Vector3().copy(p1).addScaledVector(n1, -rightWidth1 + 0.05);
        const r1_in = new THREE.Vector3().copy(p1).addScaledVector(n1, -rightWidth1 + 0.05 + lineWidth);

        edgeLinePositions.push(
          r0_out.x, r0_out.y + 0.008, r0_out.z,
          r0_in.x, r0_in.y + 0.008, r0_in.z,
          r1_out.x, r1_out.y + 0.008, r1_out.z,
          r1_in.x, r1_in.y + 0.008, r1_in.z
        );
        edgeLineIndices.push(
          edgeVertIdx, edgeVertIdx + 1, edgeVertIdx + 2,
          edgeVertIdx + 1, edgeVertIdx + 3, edgeVertIdx + 2
        );
        edgeVertIdx += 4;
      }

      if (edgeLinePositions.length > 0) {
        const edgeGeom = new THREE.BufferGeometry();
        edgeGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgeLinePositions), 3));
        edgeGeom.setIndex(edgeLineIndices);
        edgeGeom.computeVertexNormals();
        const edgeMesh = new THREE.Mesh(edgeGeom, lineMat);
        edgeMesh.receiveShadow = true;
        this.environmentGroup.add(edgeMesh);
      }

      // Dashed yellow centerline for spurs with width >= 9.5m
      if (halfWidth >= 4.75) {
        const yellowPositions: number[] = [];
        const yellowIndices: number[] = [];
        let yVertIdx = 0;

        for (let i = 0; i < surface.length - 1; i += 2) {
          if (junctionOpenAt(i) || junctionOpenAt(i + 1)) continue;
          const p0 = surface[i];
          const p1 = surface[i + 1];
          const n0 = normals[i];
          const n1 = normals[i + 1];

          const c0_l = new THREE.Vector3().copy(p0).addScaledVector(n0, 0.08);
          const c0_r = new THREE.Vector3().copy(p0).addScaledVector(n0, -0.08);
          const c1_l = new THREE.Vector3().copy(p1).addScaledVector(n1, 0.08);
          const c1_r = new THREE.Vector3().copy(p1).addScaledVector(n1, -0.08);

          yellowPositions.push(
            c0_l.x, c0_l.y + 0.008, c0_l.z,
            c0_r.x, c0_r.y + 0.008, c0_r.z,
            c1_l.x, c1_l.y + 0.008, c1_l.z,
            c1_r.x, c1_r.y + 0.008, c1_r.z
          );
          yellowIndices.push(
            yVertIdx, yVertIdx + 1, yVertIdx + 2,
            yVertIdx + 1, yVertIdx + 3, yVertIdx + 2
          );
          yVertIdx += 4;
        }

        if (yellowPositions.length > 0) {
          const yellowGeom = new THREE.BufferGeometry();
          yellowGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(yellowPositions), 3));
          yellowGeom.setIndex(yellowIndices);
          yellowGeom.computeVertexNormals();
          const yellowMesh = new THREE.Mesh(yellowGeom, yellowMat);
          yellowMesh.receiveShadow = true;
          this.environmentGroup.add(yellowMesh);
        }
      }

      // 4. Side Curbs & Grass Verges. Missing values intentionally inherit the
      // old track-wide settings, so loading an existing save changes nothing.
      const inheritedCurb = config.HaveCrub ?? this.haveCurb;
      const inheritedGrassWidth = (config.HaveGrass ?? this.haveGrass)
        ? config.GrassWidth ?? this.grassWidth
        : 0;
      const inheritedFence = config.HaveFence ?? this.haveFence;
      const leftStyle = {
        haveCurb: spur.leftCurb ?? inheritedCurb,
        curbWidth: this.curbWidth,
        grassWidth: Math.max(0, spur.leftGrassWidth ?? inheritedGrassWidth),
        fence: spur.leftFence ?? inheritedFence
      };
      const rightStyle = {
        haveCurb: spur.rightCurb ?? inheritedCurb,
        curbWidth: this.curbWidth,
        grassWidth: Math.max(0, spur.rightGrassWidth ?? inheritedGrassWidth),
        fence: spur.rightFence ?? inheritedFence
      };
      const spurHaveCurb = leftStyle.haveCurb || rightStyle.haveCurb;
      if (spurHaveCurb) {
        const redCurbPos: number[] = [];
        const redCurbIdx: number[] = [];
        let redVert = 0;

        const whiteCurbPos: number[] = [];
        const whiteCurbIdx: number[] = [];
        let whiteVert = 0;

        const addCurbQuad = (
          posArray: number[],
          idxArray: number[],
          vertIdx: number,
          p0: THREE.Vector3,
          p1: THREE.Vector3,
          n0: THREE.Vector3,
          n1: THREE.Vector3,
          sideSign: number,
          width0: number,
          width1: number
        ) => {
          const inB0 = new THREE.Vector3().copy(p0).addScaledVector(n0, sideSign * width0);
          const inT0 = new THREE.Vector3(inB0.x, inB0.y + this.curbHeight, inB0.z);
          const outT0 = new THREE.Vector3().copy(inT0).addScaledVector(n0, sideSign * this.curbWidth);

          const inB1 = new THREE.Vector3().copy(p1).addScaledVector(n1, sideSign * width1);
          const inT1 = new THREE.Vector3(inB1.x, inB1.y + this.curbHeight, inB1.z);
          const outT1 = new THREE.Vector3().copy(inT1).addScaledVector(n1, sideSign * this.curbWidth);

          posArray.push(
            inB0.x, inB0.y, inB0.z,
            inT0.x, inT0.y, inT0.z,
            inB1.x, inB1.y, inB1.z,
            inT1.x, inT1.y, inT1.z,
            inT0.x, inT0.y, inT0.z,
            outT0.x, outT0.y, outT0.z,
            inT1.x, inT1.y, inT1.z,
            outT1.x, outT1.y, outT1.z
          );

          idxArray.push(
            vertIdx, vertIdx + 1, vertIdx + 2,
            vertIdx + 1, vertIdx + 3, vertIdx + 2,
            vertIdx + 4, vertIdx + 5, vertIdx + 6,
            vertIdx + 5, vertIdx + 7, vertIdx + 6
          );

          return vertIdx + 8;
        };

        for (let i = 0; i < surface.length - 1; i++) {
          if (junctionOpenAt(i) || junctionOpenAt(i + 1)) continue;
          const isRed = i % 2 === 0;
          const p0 = surface[i];
          const p1 = surface[i + 1];
          const n0 = normals[i];
          const n1 = normals[i + 1];
          const positions = isRed ? redCurbPos : whiteCurbPos;
          const indices = isRed ? redCurbIdx : whiteCurbIdx;

          if (leftStyle.haveCurb) {
            if (isRed) {
              redVert = addCurbQuad(
                positions, indices, redVert, p0, p1, n0, n1, 1, leftWidths[i], leftWidths[i + 1]
              );
            } else {
              whiteVert = addCurbQuad(
                positions, indices, whiteVert, p0, p1, n0, n1, 1, leftWidths[i], leftWidths[i + 1]
              );
            }
          }
          if (rightStyle.haveCurb) {
            if (isRed) {
              redVert = addCurbQuad(
                positions, indices, redVert, p0, p1, n0, n1, -1, rightWidths[i], rightWidths[i + 1]
              );
            } else {
              whiteVert = addCurbQuad(
                positions, indices, whiteVert, p0, p1, n0, n1, -1, rightWidths[i], rightWidths[i + 1]
              );
            }
          }
        }

        if (redCurbPos.length > 0) {
          const redGeom = new THREE.BufferGeometry();
          redGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(redCurbPos), 3));
          redGeom.setIndex(redCurbIdx);
          redGeom.computeVertexNormals();
          const redMesh = new THREE.Mesh(redGeom, redCurbMat);
          redMesh.receiveShadow = true;
          this.environmentGroup.add(redMesh);
        }

        if (whiteCurbPos.length > 0) {
          const whiteGeom = new THREE.BufferGeometry();
          whiteGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(whiteCurbPos), 3));
          whiteGeom.setIndex(whiteCurbIdx);
          whiteGeom.computeVertexNormals();
          const whiteMesh = new THREE.Mesh(whiteGeom, whiteCurbMat);
          whiteMesh.receiveShadow = true;
          this.environmentGroup.add(whiteMesh);
        }
      }

      const spurHaveGrass = leftStyle.grassWidth > 0.05 || rightStyle.grassWidth > 0.05;
      if (spurHaveGrass) {
        const grassPositions: number[] = [];
        const grassIndices: number[] = [];
        let grassVertex = 0;

        const addGrassSegment = (
          index: number,
          sideSign: 1 | -1,
          style: typeof leftStyle,
          widths: number[]
        ) => {
          if (style.grassWidth <= 0.05) return;
          const next = index + 1;
          const inner0 = widths[index] + (style.haveCurb ? this.curbWidth : 0);
          const inner1 = widths[next] + (style.haveCurb ? this.curbWidth : 0);
          const outer0 = inner0 + style.grassWidth;
          const outer1 = inner1 + style.grassWidth;
          const innerY0 = surface[index].y + (style.haveCurb ? this.curbHeight : 0);
          const innerY1 = surface[next].y + (style.haveCurb ? this.curbHeight : 0);
          const outerY0 = Math.max(surface[index].y - 0.03, innerY0 - 0.24);
          const outerY1 = Math.max(surface[next].y - 0.03, innerY1 - 0.24);
          const innerPoint0 = new THREE.Vector3(
            surface[index].x,
            innerY0,
            surface[index].z
          ).addScaledVector(normals[index], sideSign * inner0);
          const outerPoint0 = new THREE.Vector3(
            surface[index].x,
            outerY0,
            surface[index].z
          ).addScaledVector(normals[index], sideSign * outer0);
          const innerPoint1 = new THREE.Vector3(
            surface[next].x,
            innerY1,
            surface[next].z
          ).addScaledVector(normals[next], sideSign * inner1);
          const outerPoint1 = new THREE.Vector3(
            surface[next].x,
            outerY1,
            surface[next].z
          ).addScaledVector(normals[next], sideSign * outer1);

          grassPositions.push(
            innerPoint0.x, innerPoint0.y, innerPoint0.z,
            outerPoint0.x, outerPoint0.y, outerPoint0.z,
            innerPoint1.x, innerPoint1.y, innerPoint1.z,
            outerPoint1.x, outerPoint1.y, outerPoint1.z
          );
          if (sideSign > 0) {
            grassIndices.push(
              grassVertex, grassVertex + 1, grassVertex + 2,
              grassVertex + 1, grassVertex + 3, grassVertex + 2
            );
          } else {
            grassIndices.push(
              grassVertex, grassVertex + 2, grassVertex + 1,
              grassVertex + 1, grassVertex + 2, grassVertex + 3
            );
          }
          grassVertex += 4;
        };

        for (let i = 0; i < surface.length - 1; i++) {
          if (junctionOpenAt(i) || junctionOpenAt(i + 1)) continue;
          addGrassSegment(i, 1, leftStyle, leftWidths);
          addGrassSegment(i, -1, rightStyle, rightWidths);
        }

        if (grassPositions.length > 0) {
          const grassGeometry = new THREE.BufferGeometry();
          grassGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(grassPositions), 3)
          );
          grassGeometry.setIndex(grassIndices);
          grassGeometry.computeVertexNormals();
          const grassMaterial = new THREE.MeshStandardMaterial({
            color: 0x7bb369,
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide
          });
          const grassMesh = new THREE.Mesh(grassGeometry, grassMaterial);
          grassMesh.receiveShadow = true;
          grassMesh.userData = { isSpurGrass: true, spurIndex };
          this.environmentGroup.add(grassMesh);
        }
      }

      const spurHaveFence = leftStyle.fence || rightStyle.fence;

      // 5. Spur Fences / Steel Guardrails along left and right sides
      if (spurHaveFence) {
        const fenceRailPositions: number[] = [];
        const fenceRailIndices: number[] = [];
        let fVertIdx = 0;

        const postGeom = new THREE.BoxGeometry(0.14, 1.25, 0.14);
        const postMat = steelMat;

        for (let i = 0; i < surface.length - 1; i++) {
          if (junctionOpenAt(i) || junctionOpenAt(i + 1)) continue;
          const p0 = surface[i];
          const p1 = surface[i + 1];
          const n0 = normals[i];
          const n1 = normals[i + 1];

          ([
            { sideSign: 1, style: leftStyle, widths: leftWidths },
            { sideSign: -1, style: rightStyle, widths: rightWidths }
          ] as const).forEach(({ sideSign, style, widths }) => {
            if (!style.fence) return;
            const offset0 =
              widths[i] + (style.haveCurb ? this.curbWidth : 0) + style.grassWidth;
            const offset1 =
              widths[i + 1] + (style.haveCurb ? this.curbWidth : 0) + style.grassWidth;
            const roadHeight0 = p0.y + (style.haveCurb ? this.curbHeight : 0);
            const roadHeight1 = p1.y + (style.haveCurb ? this.curbHeight : 0);
            const baseHeight0 = style.grassWidth > 0.05
              ? Math.max(p0.y - 0.03, roadHeight0 - 0.24)
              : roadHeight0;
            const baseHeight1 = style.grassWidth > 0.05
              ? Math.max(p1.y - 0.03, roadHeight1 - 0.24)
              : roadHeight1;
            const b0 = new THREE.Vector3(p0.x, baseHeight0, p0.z).addScaledVector(
              n0,
              sideSign * offset0
            );
            const b1 = new THREE.Vector3(p1.x, baseHeight1, p1.z).addScaledVector(
              n1,
              sideSign * offset1
            );

            const r0_bot = new THREE.Vector3(b0.x, b0.y + 0.35, b0.z);
            const r0_top = new THREE.Vector3(b0.x, b0.y + 0.85, b0.z);
            const r1_bot = new THREE.Vector3(b1.x, b1.y + 0.35, b1.z);
            const r1_top = new THREE.Vector3(b1.x, b1.y + 0.85, b1.z);

            fenceRailPositions.push(
              r0_bot.x, r0_bot.y, r0_bot.z,
              r0_top.x, r0_top.y, r0_top.z,
              r1_bot.x, r1_bot.y, r1_bot.z,
              r1_top.x, r1_top.y, r1_top.z
            );

            fenceRailIndices.push(
              fVertIdx, fVertIdx + 1, fVertIdx + 2,
              fVertIdx + 1, fVertIdx + 3, fVertIdx + 2,
              fVertIdx + 2, fVertIdx + 1, fVertIdx,
              fVertIdx + 2, fVertIdx + 3, fVertIdx + 1
            );
            fVertIdx += 4;

            if (i % 2 === 0 || i === surface.length - 2) {
              const post = new THREE.Mesh(postGeom, postMat);
              post.position.set(b0.x, b0.y + 0.6, b0.z);
              post.castShadow = true;
              this.environmentGroup.add(post);
            }
          });
        }

        if (fenceRailPositions.length > 0) {
          const fenceGeom = new THREE.BufferGeometry();
          fenceGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fenceRailPositions), 3));
          fenceGeom.setIndex(fenceRailIndices);
          fenceGeom.computeVertexNormals();
          const fenceMesh = new THREE.Mesh(fenceGeom, steelMat);
          fenceMesh.castShadow = true;
          this.environmentGroup.add(fenceMesh);
        }
      }

      const barriers: SpurBarrier[] = [];

      /**
       * Explicit endpoint closures are intentionally simpler than the legacy GT
       * dead-end set piece. They close a junction without adding cones and tyres
       * across the live road beside it, while sharing the same collision contract.
       */
      const addEndpointClosure = (sampleIndex: number, inward: THREE.Vector3) => {
        const point = surface[sampleIndex];
        const crossRoad = normals[sampleIndex];
        const endpointHalfWidth = Math.max(
          leftWidths[sampleIndex],
          rightWidths[sampleIndex]
        );
        const barrierWidth = endpointHalfWidth * 2 + 1.8;
        const group = new THREE.Group();

        const base = new THREE.Mesh(
          new THREE.BoxGeometry(barrierWidth, 0.42, 0.78),
          concreteMat
        );
        base.position.y = 0.21;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);

        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(barrierWidth, 0.7, 0.48),
          concreteMat
        );
        wall.position.y = 0.72;
        wall.castShadow = true;
        wall.receiveShadow = true;
        group.add(wall);

        const panelCount = Math.max(4, Math.ceil(barrierWidth / 1.8));
        const panelWidth = barrierWidth / panelCount;
        for (let panelIndex = 0; panelIndex < panelCount; panelIndex++) {
          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(panelWidth * 0.92, 0.34, 0.05),
            panelIndex % 2 === 0 ? chevronRedMat : chevronWhiteMat
          );
          panel.position.set(
            -barrierWidth / 2 + panelWidth * (panelIndex + 0.5),
            0.76,
            0.27
          );
          panel.rotation.z = panelIndex % 2 === 0 ? -0.35 : 0.35;
          panel.castShadow = true;
          group.add(panel);
        }

        group.position.copy(point);
        group.rotation.y = Math.atan2(inward.x, inward.z);
        group.userData = { isSpur: true, spurIndex };
        this.environmentGroup.add(group);

        barriers.push({
          center: point.clone().addScaledVector(inward, 0.3),
          normal: inward.clone(),
          tangent: crossRoad.clone(),
          halfWidth: endpointHalfWidth + 1.2,
          halfDepth: 1.6,
          height: 1.3
        });
      };

      const lastIdx = surface.length - 1;
      if (spur.blockedStart === true) {
        addEndpointClosure(0, tangents[0].clone());
      }
      if (spur.blockedEnd === true) {
        addEndpointClosure(lastIdx, tangents[lastIdx].clone().negate());
      }

      // 6. Gran Turismo Style Dead-End Barricade
      // Preserve the old default at an unattached end. An explicit blockedEnd uses
      // the simpler closure above, so the two systems can never overlap.
      const isLoopClosed = endMouth !== undefined;
      const legacyEndBlocked = !isLoopClosed && (spur.blocked ?? true);

      if (legacyEndBlocked && spur.blockedEnd !== true) {
        const endPoint = surface[lastIdx];
        const endNormal = normals[lastIdx];
        const endTangent = tangents[lastIdx];
        const barrierWidth = halfWidth * 2 + 1.8;
        const group = new THREE.Group();

        // 6a. Profiled Concrete Jersey Barrier (Base + Body + Top)
        const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(barrierWidth, 0.38, 0.76), concreteMat);
        baseBlock.position.set(0, 0.19, 0);
        baseBlock.castShadow = true;
        baseBlock.receiveShadow = true;
        group.add(baseBlock);

        const midBody = new THREE.Mesh(new THREE.BoxGeometry(barrierWidth, 0.62, 0.48), concreteMat);
        midBody.position.set(0, 0.62, 0);
        midBody.castShadow = true;
        midBody.receiveShadow = true;
        group.add(midBody);

        const topCrown = new THREE.Mesh(new THREE.BoxGeometry(barrierWidth, 0.18, 0.36), concreteMat);
        topCrown.position.set(0, 0.98, 0);
        topCrown.castShadow = true;
        topCrown.receiveShadow = true;
        group.add(topCrown);

        // 6b. GT Chevron Arrow Hazard Panels (Red & White alternating)
        const chevronCount = Math.max(3, Math.floor(barrierWidth / 2.2));
        const chevronSpacing = barrierWidth / (chevronCount + 1);
        for (let c = 0; c < chevronCount; c++) {
          const cx = -barrierWidth / 2 + chevronSpacing * (c + 1);
          const isLeft = cx < 0;

          // Backplate
          const plate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.48, 0.04), chevronRedMat);
          plate.position.set(cx, 0.65, 0.26);
          plate.castShadow = true;
          group.add(plate);

          // Arrow chevron stripe
          const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.36, 0.06), chevronWhiteMat);
          arrow.position.set(cx, 0.65, 0.27);
          arrow.rotation.z = isLeft ? -0.785 : 0.785;
          group.add(arrow);
        }

        // Top hazard warning strip
        const topStripe = new THREE.Mesh(new THREE.BoxGeometry(barrierWidth, 0.16, 0.38), chevronRedMat);
        topStripe.position.set(0, 1.08, 0);
        topStripe.castShadow = true;
        group.add(topStripe);

        // 6c. Crash Cushion Tire Stacks (Rubber cylinders with yellow wrap bands)
        const tireStacks = Math.max(3, Math.min(6, Math.floor(barrierWidth / 2.0)));
        const tireSpacing = (barrierWidth - 1.2) / (tireStacks - 1 || 1);
        const tireGeom = new THREE.CylinderGeometry(0.44, 0.44, 0.32, 16);
        const wrapGeom = new THREE.CylinderGeometry(0.448, 0.448, 0.1, 16);

        for (let t = 0; t < tireStacks; t++) {
          const tx = -barrierWidth / 2 + 0.6 + t * tireSpacing;
          const tz = 0.58;

          // 2-tier tire stack
          const tireBottom = new THREE.Mesh(tireGeom, tireRubberMat);
          tireBottom.position.set(tx, 0.16, tz);
          tireBottom.castShadow = true;
          tireBottom.receiveShadow = true;
          group.add(tireBottom);

          const wrapBottom = new THREE.Mesh(wrapGeom, tireWrapMat);
          wrapBottom.position.set(tx, 0.16, tz);
          group.add(wrapBottom);

          const tireTop = new THREE.Mesh(tireGeom, tireRubberMat);
          tireTop.position.set(tx, 0.48, tz);
          tireTop.castShadow = true;
          tireTop.receiveShadow = true;
          group.add(tireTop);

          const wrapTop = new THREE.Mesh(wrapGeom, tireWrapMat);
          wrapTop.position.set(tx, 0.48, tz);
          group.add(wrapTop);
        }

        // 6d. Pulsating Amber Strobe Hazard Beacons
        const beaconPostGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8);
        const beaconDomeGeom = new THREE.CylinderGeometry(0.12, 0.14, 0.22, 12);

        [-barrierWidth / 2 + 0.35, barrierWidth / 2 - 0.35].forEach((bx) => {
          const post = new THREE.Mesh(beaconPostGeom, steelMat);
          post.position.set(bx, 1.25, 0);
          post.castShadow = true;
          group.add(post);

          const dome = new THREE.Mesh(beaconDomeGeom, beaconMat);
          dome.position.set(bx, 1.48, 0);
          dome.castShadow = true;
          group.add(dome);
        });

        // 6e. Traffic Warning Cones in front of barrier
        const coneGeom = new THREE.ConeGeometry(0.22, 0.65, 12);
        const coneBandGeom = new THREE.CylinderGeometry(0.14, 0.17, 0.18, 12);
        const conePositions = [-halfWidth * 0.6, 0, halfWidth * 0.6];
        conePositions.forEach((cx, idx) => {
          const cz = 1.25 + (idx % 2 === 0 ? 0.2 : 0);
          const cone = new THREE.Mesh(coneGeom, coneOrangeMat);
          cone.position.set(cx, 0.32, cz);
          cone.castShadow = true;
          group.add(cone);

          const band = new THREE.Mesh(coneBandGeom, coneStripeMat);
          band.position.set(cx, 0.28, cz);
          group.add(band);
        });

        // 6f. Steel Guardrail Backing behind concrete wall
        const backRail = new THREE.Mesh(new THREE.BoxGeometry(barrierWidth + 1.2, 0.35, 0.08), steelMat);
        backRail.position.set(0, 0.75, -0.45);
        backRail.castShadow = true;
        group.add(backRail);

        const fencePostGeom = new THREE.BoxGeometry(0.12, 1.5, 0.12);
        [-barrierWidth / 2 - 0.2, 0, barrierWidth / 2 + 0.2].forEach((px) => {
          const p = new THREE.Mesh(fencePostGeom, steelMat);
          p.position.set(px, 0.75, -0.48);
          p.castShadow = true;
          group.add(p);
        });

        group.position.copy(endPoint);
        // Correct barrier orientation: faces oncoming cars back along spur (-endTangent)
        group.rotation.y = Math.atan2(-endTangent.x, -endTangent.z);
        group.userData = { isSpur: true, spurIndex };
        this.environmentGroup.add(group);

        barriers.push({
          center: endPoint.clone().addScaledVector(endTangent, -0.3),
          normal: endTangent.clone().negate(),
          tangent: endNormal.clone(),
          halfWidth: halfWidth + 1.2,
          halfDepth: 1.6,
          height: 1.8
        });
      }

      const maxReach = Math.max(
        ...leftWidths.map(
          (width) => width + (leftStyle.haveCurb ? this.curbWidth : 0) + leftStyle.grassWidth
        ),
        ...rightWidths.map(
          (width) => width + (rightStyle.haveCurb ? this.curbWidth : 0) + rightStyle.grassWidth
        )
      );

      // Register the exact flare widths and side styles used by the meshes, so
      // driving height, grass grip and fence collision agree with what is visible.
      this.spurSurfaces.push({
        samples: surface,
        normals,
        tangents,
        openSamples: surface.map((_, index) => junctionOpenAt(index)),
        leftWidths,
        rightWidths,
        left: leftStyle,
        right: rightStyle,
        maxReach,
        blocked: barriers.length > 0,
        minX: Math.min(...surface.map((p) => p.x)) - maxReach - 8,
        maxX: Math.max(...surface.map((p) => p.x)) + maxReach + 8,
        minZ: Math.min(...surface.map((p) => p.z)) - maxReach - 8,
        maxZ: Math.max(...surface.map((p) => p.z)) + maxReach + 8,
        barriers
      });
    });
  }

  /**
   * One free-standing patch of grass: a ground mat that follows the sculpted
   * terrain plus a scatter of instanced blades.
   *
   * Unlike the verge ribbon, which is welded to the road edge, this can sit
   * anywhere. It is decoration only — it is not part of the grass band that costs
   * grip, so a field beside the circuit does not turn that ground into a penalty
   * zone. Built here rather than inline in createScenery so the editor's grass
   * brush can drop a real patch mid-stroke instead of waiting for a full rebuild.
   */
  public buildGrassPatch(
    item: TrackScenery,
    idx: number,
    time: TimeOfDay = 'afternoon'
  ): THREE.Group {
    const scale = item.scale || 1.0;
    const radius = grassPatchRadius(scale);
    const centerX = item.position.x;
    const centerZ = item.position.z;
    const centerY = this.terrain.sampleAt(centerX, centerZ) + item.position.y;
    // Local height at an offset, so both the mat and the blades bed into the
    // ground instead of floating as one flat plate across a slope.
    const localY = (dx: number, dz: number) =>
      this.terrain.sampleAt(centerX + dx, centerZ + dz) + item.position.y - centerY;

    const patchGroup = new THREE.Group();

    // Ground mat: a disc that follows the terrain. Also the thing the editor
    // clicks on, since single blades are far too thin to hit.
    const rings = 4;
    const segments = 28;

    /**
     * How far the patch reaches on each bearing.
     *
     * Two reasons this is not just `radius`. A perfect circle of grass reads as a
     * green dinner plate dropped on the map, and a circle that overlaps the circuit
     * lays grass straight over the tarmac. So the outline wobbles, and every bearing
     * stops short of the road.
     */
    const reach: number[] = [];
    const wobbleSeed = (Math.abs(centerX) * 0.017 + Math.abs(centerZ) * 0.023) % (Math.PI * 2);
    for (let seg = 0; seg < segments; seg++) {
      const angle = (seg / segments) * Math.PI * 2;
      const wobble =
        0.78 +
        0.13 * Math.sin(angle * 3 + wobbleSeed) +
        0.09 * Math.sin(angle * 5 - wobbleSeed * 1.7);
      let limit = radius * wobble;

      if (this.roadSamplePoints.length > 1) {
        const step = Math.max(1.5, radius / 12);
        for (let r = step; r <= limit; r += step) {
          const px = centerX + Math.cos(angle) * r;
          const pz = centerZ + Math.sin(angle) * r;
          const info = this.getTrackInfo(px, pz);
          if (info.dist < info.width / 2 + 0.8 || this.isPointOnSpur(px, pz)) {
            limit = Math.max(0, r - step);
            break;
          }
        }
      }
      reach.push(limit);
    }
    // One smoothing pass, so a bearing clipped by the road does not leave a spike
    // next to its neighbours.
    const smoothedReach = reach.map((value, seg) => {
      const prev = reach[(seg - 1 + segments) % segments];
      const next = reach[(seg + 1) % segments];
      return value * 0.5 + prev * 0.25 + next * 0.25;
    });

    const matPositions: number[] = [0, localY(0, 0) + 0.05, 0];
    const matIndices: number[] = [];
    for (let ring = 1; ring <= rings; ring++) {
      const ringFraction = ring / rings;
      for (let seg = 0; seg < segments; seg++) {
        const angle = (seg / segments) * Math.PI * 2;
        const ringRadius = ringFraction * smoothedReach[seg];
        const dx = Math.cos(angle) * ringRadius;
        const dz = Math.sin(angle) * ringRadius;
        // The rim settles into the ground so the patch has no standing lip.
        const lift = 0.05 - ringFraction * 0.05;
        matPositions.push(dx, localY(dx, dz) + lift, dz);
      }
    }
    const ringStart = (ring: number) => 1 + (ring - 1) * segments;
    for (let seg = 0; seg < segments; seg++) {
      const next = (seg + 1) % segments;
      matIndices.push(0, ringStart(1) + next, ringStart(1) + seg);
    }
    for (let ring = 1; ring < rings; ring++) {
      for (let seg = 0; seg < segments; seg++) {
        const next = (seg + 1) % segments;
        const inner = ringStart(ring);
        const outer = ringStart(ring + 1);
        matIndices.push(inner + seg, outer + next, outer + seg);
        matIndices.push(inner + seg, inner + next, outer + next);
      }
    }
    const matGeom = new THREE.BufferGeometry();
    matGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(matPositions), 3)
    );
    matGeom.setIndex(matIndices);
    matGeom.computeVertexNormals();
    // Grass that was just placed comes up over about half a second; grass that was
    // already on the map is simply there. The key is the patch position, so editing
    // something else and rebuilding the world does not make every field sprout again.
    const growthKey = `${Math.round(centerX)}:${Math.round(centerZ)}`;
    const alreadyGrown = !this.grassGrowsIn || BaseMode.sproutedGrass.has(growthKey);
    BaseMode.sproutedGrass.add(growthKey);
    const grow = { value: alreadyGrown ? 1 : 0 };

    const groundMatMaterial = new THREE.MeshStandardMaterial({
      color: gradeColor(0x7bb369, time),
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: alreadyGrown ? 1 : 0,
      // Painted patches overlap, and two coplanar mats flicker against each
      // other. A per-patch depth bias picks a stable winner instead.
      polygonOffset: true,
      polygonOffsetFactor: -1 - (idx % 4),
      polygonOffsetUnits: -1
    });
    if (!alreadyGrown) {
      this.grassGrowth.push({ grow, mat: groundMatMaterial });
    }

    const groundMat = new THREE.Mesh(matGeom, groundMatMaterial);
    groundMat.receiveShadow = true;
    patchGroup.add(groundMat);

    // Deterministic scatter: the editor rebuilds the world on every edit, and
    // Math.random would reshuffle every blade each time.
    let seed = Math.floor(Math.abs(centerX) * 73856093 + Math.abs(centerZ) * 19349663) >>> 0;
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const quality = this.engine?.postProcessing
      ? this.engine.postProcessing.getQuality()
      : 'high';
    // Even on low, a patch has to show blades: it is grass the user placed by hand,
    // so silently rendering a bare green disc reads as the feature not working.
    const bladesPerSquareMetre = quality === 'low' ? 0.12 : quality === 'medium' ? 0.28 : 0.55;
    const bladeCount = Math.min(
      3000,
      Math.round(Math.PI * radius * radius * bladesPerSquareMetre)
    );

    if (bladeCount > 0) {
      const bladeGeom = createGrassBladeGeometry();
      const bladeMat = createGrassBladeMaterial(this.grassUniforms, grow);
      const blades = new THREE.InstancedMesh(bladeGeom, bladeMat, bladeCount);
      blades.receiveShadow = true;
      const dummy = new THREE.Object3D();
      const leafColor = new THREE.Color();
      let placed = 0;

      for (let i = 0; i < bladeCount; i++) {
        // Blades live inside the same wobbly, road-clipped outline as the mat, so
        // they never stand on tarmac or out past the green.
        const bladeSeg = Math.min(segments - 1, Math.floor(random() * segments));
        const bladeAngle = ((bladeSeg + random()) / segments) * Math.PI * 2;
        // sqrt keeps the scatter even across the area instead of bunching up
        // in the middle.
        const bladeRadius = Math.sqrt(random()) * smoothedReach[bladeSeg];
        const dx = Math.cos(bladeAngle) * bladeRadius;
        const dz = Math.sin(bladeAngle) * bladeRadius;

        // Nothing grows through the tarmac.
        if (this.roadSamplePoints.length > 1) {
          const info = this.getTrackInfo(centerX + dx, centerZ + dz);
          if (info.dist < info.width / 2 + 0.6 || this.isPointOnSpur(centerX + dx, centerZ + dz)) continue;
        }

        dummy.position.set(dx, localY(dx, dz) + 0.02, dz);
        dummy.rotation.set(0, random() * Math.PI * 2, 0);
        const heightScale = 0.7 + random() * 0.6;
        const widthScale = 0.8 + random() * 0.4;
        dummy.scale.set(widthScale, heightScale * (item.heightScale ?? 1), widthScale);
        dummy.updateMatrix();
        blades.setMatrixAt(placed, dummy.matrix);
        leafColor.setHex(GRASS_LEAF_COLORS[Math.floor(random() * GRASS_LEAF_COLORS.length)]);
        blades.setColorAt(placed, leafColor);
        placed++;
      }

      // Unused instances would otherwise render stacked at the origin.
      blades.count = placed;
      if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
      blades.instanceMatrix.needsUpdate = true;
      patchGroup.add(blades);
    }

    patchGroup.position.set(centerX, centerY, centerZ);
    patchGroup.rotation.y = item.rotation ?? 0;
    // isGrassPatch lets the editor's clear-grass brush hide what a stroke removed
    // before the world is rebuilt.
    patchGroup.userData = { isScenery: true, sceneryIndex: idx, isGrassPatch: true };
    return patchGroup;
  }

  protected createScenery(scenery: TrackScenery[] | undefined, time: TimeOfDay = 'afternoon') {
    if (!scenery || scenery.length === 0) return;

    // Base colours are authored for daylight; gradeColor pulls them toward the
    // ambient light of the active time of day so night tracks stop rendering
    // bright daytime foliage.
    const tint = (hex: number) => gradeColor(hex, time);

    // Define materials
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: tint(0x4d3319), roughness: 1.0 });
    const coniferLeavesMat = new THREE.MeshStandardMaterial({ color: tint(0x2e8b57), roughness: 0.9, flatShading: true }); // tree1
    const oakLeavesMat = new THREE.MeshStandardMaterial({ color: tint(0x1f663b), roughness: 0.9, flatShading: true }); // tree2
    const palmLeavesMat = new THREE.MeshStandardMaterial({ color: tint(0x32cd32), roughness: 0.8, flatShading: true }); // tree3
    const rockMat = new THREE.MeshStandardMaterial({ color: tint(0x7a7a7a), roughness: 0.9, flatShading: true });
    const mountainMat = new THREE.MeshStandardMaterial({ color: tint(0x5a5a5a), roughness: 0.9, flatShading: true });
    const snowMat = new THREE.MeshStandardMaterial({ color: tint(0xffffff), roughness: 0.9, flatShading: true });
    const hillMat = new THREE.MeshStandardMaterial({ color: tint(0x3b7d3b), roughness: 0.9, flatShading: true });

    // City block: one facade material shared by every tower, with a procedural
    // window grid that carries its own glow so blocks read as lit at night.
    const buildingFacadeMat = new THREE.MeshStandardMaterial({
      color: tint(0x8a8f9c),
      roughness: 0.75,
      metalness: 0.15,
      map: getWindowTexture(),
      emissive: 0xffd08a,
      emissiveMap: getWindowTexture(),
      emissiveIntensity: emissiveStrengthFor(time)
    });
    const buildingRoofMat = new THREE.MeshStandardMaterial({ color: tint(0x3a3f4a), roughness: 0.9 });

    // Houses: painted render walls, tiled roofs, and windows that light up after dark.
    const houseWallHues = [0xd8cfc0, 0xc9b9a4, 0xb9c4cc, 0xd6c2b2, 0xa9b39c];
    const houseWallMats = houseWallHues.map(
      (hex) => new THREE.MeshStandardMaterial({ color: tint(hex), roughness: 0.85 })
    );
    const houseRoofMats = [0x8c4a3a, 0x4a5560, 0x6b5040].map(
      (hex) => new THREE.MeshStandardMaterial({ color: tint(hex), roughness: 0.8, flatShading: true })
    );
    const houseTrimMat = new THREE.MeshStandardMaterial({ color: tint(0x6b5b4a), roughness: 0.9 });
    const houseWindowMat = new THREE.MeshStandardMaterial({
      color: tint(0x2a3038),
      emissive: 0xffc978,
      emissiveIntensity: emissiveStrengthFor(time) * 1.3,
      roughness: 0.35
    });

    // Construction site: bare structure, scaffolding, crane and work lights.
    const concreteMat = new THREE.MeshStandardMaterial({ color: tint(0x9a978f), roughness: 0.95 });
    const rebarMat = new THREE.MeshStandardMaterial({ color: tint(0x6e6257), roughness: 0.85 });
    const scaffoldMat = new THREE.MeshStandardMaterial({ color: tint(0x9aa3ad), roughness: 0.6, metalness: 0.5 });
    const craneMat = new THREE.MeshStandardMaterial({ color: tint(0xe0a021), roughness: 0.55, metalness: 0.3 });
    const hoardingMat = new THREE.MeshStandardMaterial({ color: tint(0x2f6f52), roughness: 0.9 });
    const workLightMat = new THREE.MeshStandardMaterial({
      color: 0xfff0c0,
      emissive: 0xfff0c0,
      emissiveIntensity: emissiveStrengthFor(time) * 2.2,
      roughness: 0.3
    });
    const buildingTrimMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: emissiveStrengthFor(time) * 1.6,
      roughness: 0.4,
      metalness: 0.6
    });

    // Grandstand materials
    const standConcreteMat = new THREE.MeshStandardMaterial({ color: 0x2e3033, roughness: 0.8 });
    const standRoofMat = new THREE.MeshStandardMaterial({ color: 0xd946ef, metalness: 0.8, roughness: 0.2 });
    const standSeatsMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.5 });
    const standPostMat = new THREE.MeshStandardMaterial({ color: 0x1e2022, metalness: 0.9, roughness: 0.1 });

    // Define geometries
    const trunkGeom1 = new THREE.CylinderGeometry(0.5, 0.7, 3, 5);
    const leavesGeom1 = new THREE.ConeGeometry(3, 7, 5);
    leavesGeom1.translate(0, 5, 0); // Move conifer leaves up
    
    const trunkGeom2 = new THREE.CylinderGeometry(0.4, 0.6, 3, 6);
    const leavesGeom2 = new THREE.SphereGeometry(3.5, 6, 6);
    leavesGeom2.translate(0, 4.5, 0); // Move oak leaves up
    
    const trunkGeom3 = new THREE.CylinderGeometry(0.15, 0.3, 6, 6);
    const palmLeafGeom = new THREE.BoxGeometry(0.5, 0.1, 3.5);
    palmLeafGeom.translate(0, 0, 1.75); // Pivot at the base of the leaf
    
    const rockGeom = new THREE.DodecahedronGeometry(2);
    
    const mountainGeom = new THREE.ConeGeometry(12, 25, 5);
    mountainGeom.translate(0, 12.5, 0); // Position base at 0
    const snowGeom = new THREE.ConeGeometry(3.36, 7, 5);
    snowGeom.translate(0, 21.5, 0); // Position cap at top
    
    const hillGeom = new THREE.SphereGeometry(15, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    
    // Grandstand geometries
    const row1Geom = new THREE.BoxGeometry(8, 0.6, 1.2);
    const row2Geom = new THREE.BoxGeometry(8, 1.2, 1.2);
    const row3Geom = new THREE.BoxGeometry(8, 1.8, 1.2);
    const sideWallGeom = new THREE.BoxGeometry(0.3, 2.8, 4.2);
    const backWallGeom = new THREE.BoxGeometry(8.6, 2.8, 0.3);
    const roofGeom = new THREE.BoxGeometry(8.8, 0.15, 4.4);
    const postGeom = new THREE.CylinderGeometry(0.08, 0.08, 3.2);
    const seatOverlay1Geom = new THREE.BoxGeometry(7.8, 0.1, 0.5);

    /**
     * Drops a prop onto the sculpted ground. The authored y is treated as height
     * *above* terrain rather than an absolute world height, so a tree placed on a
     * hillside sits on the slope instead of being buried at zero, and anything
     * deliberately floated keeps its clearance when the ground moves under it.
     */
    const groundedPosition = (position: THREE.Vector3) =>
      new THREE.Vector3(
        position.x,
        this.terrain.sampleAt(position.x, position.z) + position.y,
        position.z
      );

    // Foliage colour is jittered per instance, but bucketed so a forest needs a
    // handful of materials rather than one per tree.
    const leafMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
    const leafMaterialFor = (baseHex: number, variation: InstanceVariation) => {
      const bucket = Math.floor(((variation.hueShift + 0.035) / 0.07) * 5);
      const key = `${baseHex}:${bucket}`;
      const cached = leafMaterialCache.get(key);
      if (cached) return cached;
      const mat = new THREE.MeshStandardMaterial({
        color: gradeColor(baseHex, time, variation),
        roughness: 0.9,
        flatShading: true
      });
      leafMaterialCache.set(key, mat);
      return mat;
    };

    // Facade brightness varies per block so a skyline is not one flat grey, but
    // is bucketed the same way as foliage to keep the material count down.
    const facadeCache = new Map<number, THREE.MeshStandardMaterial>();
    const buildingFacadeVariant = (variation: InstanceVariation) => {
      const bucket = Math.floor(((variation.lightnessShift + 0.09) / 0.18) * 4);
      const cached = facadeCache.get(bucket);
      if (cached) return cached;
      const mat = buildingFacadeMat.clone();
      mat.color = gradeColor(0x8a8f9c, time, variation);
      facadeCache.set(bucket, mat);
      return mat;
    };

    scenery.forEach((item, idx) => {
      const scale = item.scale || 1.0;
      // Deterministic jitter, so props vary but never shuffle between rebuilds.
      const variation = variationAt(item.position.x, item.position.z);

      /** Drops a prop in place with its lean, spin and size noise applied. */
      const placeProp = (group: THREE.Object3D, strength = 1) => {
        const xz = 1 + (variation.scaleXZ - 1) * strength;
        const y = 1 + (variation.scaleY - 1) * strength;
        group.position.copy(groundedPosition(item.position));
        group.scale.set(scale * xz, scale * y, scale * xz);
        // An authored rotation always wins; otherwise spin it deterministically.
        group.rotation.y = item.rotation ?? variation.rotation;
        group.rotation.x = variation.tiltX * strength;
        group.rotation.z = variation.tiltZ * strength;
        group.userData = { isScenery: true, sceneryIndex: idx };
        this.environmentGroup.add(group);
      };

      if (item.type === 'tree' || item.type === 'tree1') {
        const treeGroup = new THREE.Group();
        
        const trunk = new THREE.Mesh(trunkGeom1, treeTrunkMat);
        trunk.position.y = 1.5;
        trunk.castShadow = true;
        treeGroup.add(trunk);
        
        const leaves = new THREE.Mesh(leavesGeom1, leafMaterialFor(0x2e8b57, variation));
        leaves.castShadow = true;
        treeGroup.add(leaves);

        placeProp(treeGroup);
      } else if (item.type === 'tree2') {
        const treeGroup = new THREE.Group();
        
        const trunk = new THREE.Mesh(trunkGeom2, treeTrunkMat);
        trunk.position.y = 1.5;
        trunk.castShadow = true;
        treeGroup.add(trunk);
        
        const leaves = new THREE.Mesh(leavesGeom2, leafMaterialFor(0x1f663b, variation));
        leaves.castShadow = true;
        treeGroup.add(leaves);

        placeProp(treeGroup);
      } else if (item.type === 'tree3') {
        const palmGroup = new THREE.Group();
        
        const trunk = new THREE.Mesh(trunkGeom3, treeTrunkMat);
        trunk.position.y = 3;
        trunk.castShadow = true;
        palmGroup.add(trunk);
        
        // 6 palm leaves in a star pattern, slightly tilted
        const palmLeafMat = leafMaterialFor(0x32cd32, variation);
        for (let i = 0; i < 6; i++) {
          const leaf = new THREE.Mesh(palmLeafGeom, palmLeafMat);
          leaf.position.set(0, 6, 0);
          leaf.rotation.y = (i * Math.PI * 2) / 6;
          // Droop varies per frond so the crown is not perfectly symmetrical.
          leaf.rotation.x = 0.25 + positionNoise(item.position.x, item.position.z + i, 8) * 0.22;
          leaf.castShadow = true;
          palmGroup.add(leaf);
        }

        placeProp(palmGroup);
      } else if (item.type === 'rock') {
        const rock = new THREE.Mesh(rockGeom, rockMat);
        rock.castShadow = true;
        rock.receiveShadow = true;
        // Squashed on Y so it reads as a boulder rather than a ball, then given
        // the usual per-instance lean and spin on top.
        placeProp(rock);
        rock.scale.multiply(new THREE.Vector3(1.2, 0.8, 1.0));
        rock.rotation.x += 0.1;
      } else if (item.type === 'grass_patch') {
        this.environmentGroup.add(this.buildGrassPatch(item, idx, time));
      } else if (item.type === 'mountain') {
        const mountainGroup = new THREE.Group();
        
        const body = new THREE.Mesh(mountainGeom, mountainMat);
        body.castShadow = true;
        body.receiveShadow = true;
        mountainGroup.add(body);
        
        const snow = new THREE.Mesh(snowGeom, snowMat);
        snow.castShadow = true;
        mountainGroup.add(snow);
        
        mountainGroup.position.copy(groundedPosition(item.position));
        const heightScale = item.heightScale ?? scale;
        mountainGroup.scale.set(scale, heightScale, scale);
        if (item.rotation) {
          mountainGroup.rotation.y = item.rotation;
        }
        
        mountainGroup.userData = { isScenery: true, sceneryIndex: idx };
        this.environmentGroup.add(mountainGroup);
      } else if (item.type === 'hill') {
        const hill = new THREE.Mesh(hillGeom, hillMat);
        hill.position.copy(groundedPosition(item.position));
        const heightScale = item.heightScale ?? (scale * 0.8);
        hill.scale.set(scale, heightScale, scale);
        hill.receiveShadow = true;
        if (item.rotation) {
          hill.rotation.y = item.rotation;
        }
        hill.userData = { isScenery: true, sceneryIndex: idx };
        this.environmentGroup.add(hill);
      } else if (item.type === 'building') {
        const { x: px, z: pz } = item.position;
        const blockGroup = new THREE.Group();

        const width = scale * 5 * (0.8 + positionNoise(px, pz, 21) * 0.5);
        const depth = width * (item.depthScale ?? 0.8 + positionNoise(px, pz, 22) * 0.5);
        const height = (item.heightScale ?? scale * 2.5) * 5;
        const uvOffset = positionNoise(px, pz, 23);

        // Facade brightness varies per block, so a skyline is not one flat grey.
        const facadeMat = buildingFacadeVariant(variation);

        /** One box section of the block, walls textured and roof plain. */
        const addSection = (w: number, h: number, d: number, baseY: number, offset: number) => {
          const section = new THREE.Mesh(
            makeBuildingGeometry(w, h, d, uvOffset + offset),
            // Face order is +X, -X, +Y, -Y, +Z, -Z.
            [facadeMat, facadeMat, buildingRoofMat, buildingRoofMat, facadeMat, facadeMat]
          );
          section.position.y = baseY + h / 2;
          section.castShadow = true;
          section.receiveShadow = true;
          blockGroup.add(section);
          return baseY + h;
        };

        // Four silhouettes so a row of blocks reads as a real skyline. Picked
        // deterministically from the position unless the author chose one.
        const style = item.variant ?? Math.floor(positionNoise(px, pz, 24) * 4);
        let crownY: number;
        let crownW: number;
        let crownD: number;
        // Where the topmost section sits, so the crown and roof clutter follow it.
        let crownOffset = { x: 0, z: 0 };

        if (style === 1) {
          // Setback tower: three stacked boxes stepping inward.
          let y = addSection(width, height * 0.5, depth, 0, 0);
          y = addSection(width * 0.78, height * 0.32, depth * 0.78, y, 0.11);
          crownY = addSection(width * 0.56, height * 0.18, depth * 0.56, y, 0.23);
          crownW = width * 0.56;
          crownD = depth * 0.56;
        } else if (style === 2) {
          // Podium base with a slimmer tower rising off-centre.
          const baseH = height * 0.22;
          addSection(width, baseH, depth, 0, 0);
          const towerW = width * 0.62;
          const towerD = depth * 0.62;
          const tower = new THREE.Mesh(
            makeBuildingGeometry(towerW, height - baseH, towerD, uvOffset + 0.17),
            [facadeMat, facadeMat, buildingRoofMat, buildingRoofMat, facadeMat, facadeMat]
          );
          tower.position.set(width * 0.12, baseH + (height - baseH) / 2, -depth * 0.1);
          tower.castShadow = true;
          tower.receiveShadow = true;
          blockGroup.add(tower);
          crownY = height;
          crownW = towerW;
          crownD = towerD;
          crownOffset = { x: width * 0.12, z: -depth * 0.1 };
        } else if (style === 3) {
          // Wide low slab, the filler between the tall stuff.
          const slabH = height * 0.45;
          crownY = addSection(width * 1.35, slabH, depth * 0.7, 0, 0);
          crownW = width * 1.35;
          crownD = depth * 0.7;
        } else {
          // Plain tower.
          crownY = addSection(width, height, depth, 0, 0);
          crownW = width;
          crownD = depth;
        }

        // Neon crown, so blocks still read as a silhouette against a night sky.
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(crownW * 1.04, 0.4, crownD * 1.04),
          buildingTrimMat
        );
        crown.position.set(crownOffset.x, crownY + 0.2, crownOffset.z);
        blockGroup.add(crown);

        // Rooftop clutter: a mast and a tank, each on its own coin flip, so the
        // tops of the skyline are not all identical flat lids.
        if (positionNoise(px, pz, 25) > 0.45) {
          const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.28, height * 0.22, 5),
            buildingRoofMat
          );
          mast.position.set(
            crownOffset.x + crownW * 0.22,
            crownY + height * 0.11,
            crownOffset.z - crownD * 0.18
          );
          mast.castShadow = true;
          blockGroup.add(mast);
        }
        if (positionNoise(px, pz, 26) > 0.55) {
          const tankH = Math.max(1.5, height * 0.06);
          const tank = new THREE.Mesh(
            new THREE.BoxGeometry(crownW * 0.3, tankH, crownD * 0.3),
            buildingRoofMat
          );
          tank.position.set(
            crownOffset.x - crownW * 0.24,
            crownY + tankH / 2,
            crownOffset.z + crownD * 0.2
          );
          tank.castShadow = true;
          blockGroup.add(tank);
        }

        blockGroup.position.copy(groundedPosition(item.position));
        // Buildings are man-made, so no lean and no size noise: only the yaw,
        // snapped to 15 degrees so blocks still line up like a city grid.
        blockGroup.rotation.y =
          item.rotation ?? Math.round((variation.rotation / Math.PI) * 12) * (Math.PI / 12);
        blockGroup.userData = { isScenery: true, sceneryIndex: idx };
        this.environmentGroup.add(blockGroup);
      } else if (item.type === 'house') {
        const { x: px, z: pz } = item.position;
        const houseGroup = new THREE.Group();

        const style = item.variant ?? Math.floor(positionNoise(px, pz, 31) * 3);
        const storeys = style === 2 ? 2 : positionNoise(px, pz, 32) > 0.7 ? 2 : 1;
        const width = scale * 3.2 * (0.85 + positionNoise(px, pz, 33) * 0.35);
        const depth = width * (item.depthScale ?? 0.7 + positionNoise(px, pz, 34) * 0.3);
        const wallHeight = (item.heightScale ?? 1) * 2.6 * storeys;

        const wallMat = houseWallMats[Math.floor(positionNoise(px, pz, 35) * houseWallMats.length)];
        const roofMat = houseRoofMats[Math.floor(positionNoise(px, pz, 36) * houseRoofMats.length)];

        const walls = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), wallMat);
        walls.position.y = wallHeight / 2;
        walls.castShadow = true;
        walls.receiveShadow = true;
        houseGroup.add(walls);

        const roofHeight = width * (style === 2 ? 0.12 : 0.42);
        if (style === 2) {
          // Flat roof with a parapet lip.
          const parapet = new THREE.Mesh(
            new THREE.BoxGeometry(width * 1.04, roofHeight, depth * 1.04),
            roofMat
          );
          parapet.position.y = wallHeight + roofHeight / 2;
          parapet.castShadow = true;
          houseGroup.add(parapet);
        } else if (style === 1) {
          // Hip roof: a four-sided pyramid turned to line up with the walls.
          const hip = new THREE.Mesh(
            new THREE.ConeGeometry(Math.max(width, depth) * 0.78, roofHeight, 4),
            roofMat
          );
          hip.position.y = wallHeight + roofHeight / 2;
          hip.rotation.y = Math.PI / 4;
          hip.scale.set(1, 1, depth / width);
          hip.castShadow = true;
          houseGroup.add(hip);
        } else {
          // Gable roof: two slabs leaning together along the ridge. Built from
          // boxes rather than a prism so the orientation is unambiguous.
          const pitch = Math.atan2(roofHeight, depth / 2);
          const slabLength = Math.hypot(depth / 2, roofHeight) * 1.06;
          for (const side of [-1, 1]) {
            const slab = new THREE.Mesh(
              new THREE.BoxGeometry(width * 1.08, 0.18, slabLength),
              roofMat
            );
            slab.position.set(0, wallHeight + roofHeight / 2, (side * depth) / 4);
            slab.rotation.x = -side * pitch;
            slab.castShadow = true;
            houseGroup.add(slab);
          }
        }

        // Door on the front face, plus a lit window per storey either side of it.
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.18, wallHeight / storeys * 0.62, 0.12),
          houseTrimMat
        );
        door.position.set(0, (wallHeight / storeys) * 0.31, depth / 2 + 0.06);
        houseGroup.add(door);

        const windowGeom = new THREE.BoxGeometry(width * 0.16, width * 0.14, 0.1);
        for (let storey = 0; storey < storeys; storey++) {
          for (const side of [-1, 1]) {
            const win = new THREE.Mesh(windowGeom, houseWindowMat);
            win.position.set(
              side * width * 0.28,
              (wallHeight / storeys) * (storey + 0.62),
              depth / 2 + 0.05
            );
            houseGroup.add(win);
          }
        }

        if (positionNoise(px, pz, 37) > 0.5) {
          const chimney = new THREE.Mesh(
            new THREE.BoxGeometry(width * 0.14, roofHeight * 1.4, width * 0.14),
            houseTrimMat
          );
          chimney.position.set(width * 0.28, wallHeight + roofHeight * 0.7, -depth * 0.18);
          chimney.castShadow = true;
          houseGroup.add(chimney);
        }

        houseGroup.position.copy(groundedPosition(item.position));
        houseGroup.rotation.y = item.rotation ?? variation.rotation;
        houseGroup.userData = { isScenery: true, sceneryIndex: idx };
        this.environmentGroup.add(houseGroup);
      } else if (item.type === 'construction') {
        const { x: px, z: pz } = item.position;
        const siteGroup = new THREE.Group();

        const width = scale * 5 * (0.85 + positionNoise(px, pz, 41) * 0.3);
        const depth = width * (item.depthScale ?? 0.8 + positionNoise(px, pz, 42) * 0.4);
        const storeyHeight = 3.4;
        const storeys = Math.max(1, Math.round((item.heightScale ?? scale * 1.4) * 2));
        const topY = storeys * storeyHeight;

        // Bare floor slabs held up on corner and mid columns: the frame goes up
        // before the walls do, which is what makes a site read as unfinished.
        const columnGeom = new THREE.BoxGeometry(0.45, storeyHeight, 0.45);
        for (let level = 0; level < storeys; level++) {
          const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, depth), concreteMat);
          slab.position.y = (level + 1) * storeyHeight;
          slab.castShadow = true;
          slab.receiveShadow = true;
          siteGroup.add(slab);

          for (const sx of [-1, 0, 1]) {
            for (const sz of [-1, 1]) {
              if (sx === 0 && positionNoise(px + level, pz + sz, 43) < 0.5) continue;
              const column = new THREE.Mesh(columnGeom, concreteMat);
              column.position.set(
                sx * (width / 2 - 0.5),
                level * storeyHeight + storeyHeight / 2,
                sz * (depth / 2 - 0.5)
              );
              column.castShadow = true;
              siteGroup.add(column);
            }
          }
        }

        // Rebar stubs poking out of the top slab, waiting for the next pour.
        const rebarGeom = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 4);
        for (let i = 0; i < 8; i++) {
          const rebar = new THREE.Mesh(rebarGeom, rebarMat);
          rebar.position.set(
            (positionNoise(px + i, pz, 44) - 0.5) * width * 0.85,
            topY + 0.8,
            (positionNoise(px, pz + i, 45) - 0.5) * depth * 0.85
          );
          siteGroup.add(rebar);
        }

        // Scaffolding up one face.
        const poleGeom = new THREE.CylinderGeometry(0.09, 0.09, topY, 5);
        const scaffoldZ = depth / 2 + 0.6;
        for (let i = 0; i <= 3; i++) {
          const pole = new THREE.Mesh(poleGeom, scaffoldMat);
          pole.position.set(-width / 2 + (i * width) / 3, topY / 2, scaffoldZ);
          siteGroup.add(pole);
        }
        for (let level = 1; level <= storeys; level++) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 0.1), scaffoldMat);
          rail.position.set(0, level * storeyHeight, scaffoldZ);
          siteGroup.add(rail);
        }

        // Site hoarding around the base.
        for (const [sx, sz, w, d] of [
          [0, 1, width + 2, 0.2],
          [0, -1, width + 2, 0.2],
          [1, 0, 0.2, depth + 2],
          [-1, 0, 0.2, depth + 2]
        ] as const) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), hoardingMat);
          panel.position.set(sx * (width / 2 + 1), 1.1, sz * (depth / 2 + 1));
          panel.receiveShadow = true;
          siteGroup.add(panel);
        }

        // Tower crane on taller sites, so a skyline has something in progress.
        if (storeys >= 3) {
          const mastHeight = topY + storeyHeight * 2.5;
          const mast = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, mastHeight, 1.1),
            craneMat
          );
          mast.position.set(width / 2 + 3, mastHeight / 2, -depth / 2 - 3);
          mast.castShadow = true;
          siteGroup.add(mast);

          const jib = new THREE.Mesh(new THREE.BoxGeometry(width * 2.2, 0.7, 0.7), craneMat);
          jib.position.set(width / 2 + 3 + width * 0.5, mastHeight, -depth / 2 - 3);
          jib.castShadow = true;
          siteGroup.add(jib);

          const counterweight = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.2), concreteMat);
          counterweight.position.set(width / 2 + 3 - width * 0.55, mastHeight, -depth / 2 - 3);
          siteGroup.add(counterweight);

          // Crane group turns as a unit so the jib sweeps a believable direction.
          const craneYaw = positionNoise(px, pz, 46) * Math.PI * 2;
          for (const part of [mast, jib, counterweight]) {
            part.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), craneYaw);
            part.rotation.y = craneYaw;
          }
        }

        // Work lights, the thing that actually sells a site at night.
        const lampGeom = new THREE.BoxGeometry(0.6, 0.4, 0.3);
        for (const side of [-1, 1]) {
          const lamp = new THREE.Mesh(lampGeom, workLightMat);
          lamp.position.set(side * (width / 2 - 0.6), topY + 0.6, depth / 2 - 0.6);
          siteGroup.add(lamp);
        }

        siteGroup.position.copy(groundedPosition(item.position));
        siteGroup.rotation.y =
          item.rotation ?? Math.round((variation.rotation / Math.PI) * 12) * (Math.PI / 12);
        siteGroup.userData = { isScenery: true, sceneryIndex: idx };
        this.environmentGroup.add(siteGroup);
      } else if (item.type === 'podium') {
        const standGroup = new THREE.Group();
        
        // Seating steps
        const row1 = new THREE.Mesh(row1Geom, standConcreteMat);
        row1.position.set(0, 0.3, 0.9);
        row1.castShadow = true;
        row1.receiveShadow = true;
        standGroup.add(row1);
        
        const row2 = new THREE.Mesh(row2Geom, standConcreteMat);
        row2.position.set(0, 0.6, -0.3);
        row2.castShadow = true;
        row2.receiveShadow = true;
        standGroup.add(row2);
        
        const row3 = new THREE.Mesh(row3Geom, standConcreteMat);
        row3.position.set(0, 0.9, -1.5);
        row3.castShadow = true;
        row3.receiveShadow = true;
        standGroup.add(row3);

        // Side Walls
        const leftWall = new THREE.Mesh(sideWallGeom, standConcreteMat);
        leftWall.position.set(-4.15, 1.4, -0.3);
        leftWall.castShadow = true;
        leftWall.receiveShadow = true;
        standGroup.add(leftWall);

        const rightWall = new THREE.Mesh(sideWallGeom, standConcreteMat);
        rightWall.position.set(4.15, 1.4, -0.3);
        rightWall.castShadow = true;
        rightWall.receiveShadow = true;
        standGroup.add(rightWall);

        // Back Wall
        const backWall = new THREE.Mesh(backWallGeom, standConcreteMat);
        backWall.position.set(0, 1.4, -2.25);
        backWall.castShadow = true;
        backWall.receiveShadow = true;
        standGroup.add(backWall);

        // Posts
        const leftPost = new THREE.Mesh(postGeom, standPostMat);
        leftPost.position.set(-3.9, 1.6, 1.3);
        leftPost.castShadow = true;
        standGroup.add(leftPost);

        const rightPost = new THREE.Mesh(postGeom, standPostMat);
        rightPost.position.set(3.9, 1.6, 1.3);
        rightPost.castShadow = true;
        standGroup.add(rightPost);

        // Roof
        const roof = new THREE.Mesh(roofGeom, standRoofMat);
        roof.position.set(0, 3.2, -0.3);
        roof.rotation.x = 0.08;
        roof.castShadow = true;
        standGroup.add(roof);

        // Seating Row Visual Overlays (colored rows)
        const seat1 = new THREE.Mesh(seatOverlay1Geom, standSeatsMat);
        seat1.position.set(0, 0.65, 1.15);
        seat1.castShadow = true;
        standGroup.add(seat1);

        const seat2 = new THREE.Mesh(seatOverlay1Geom, standSeatsMat);
        seat2.position.set(0, 1.25, -0.05);
        seat2.castShadow = true;
        standGroup.add(seat2);

        const seat3 = new THREE.Mesh(seatOverlay1Geom, standSeatsMat);
        seat3.position.set(0, 1.85, -1.25);
        seat3.castShadow = true;
        standGroup.add(seat3);

        standGroup.position.copy(groundedPosition(item.position));
        standGroup.scale.set(scale, scale, scale);
        if (item.rotation !== undefined) {
          standGroup.rotation.y = item.rotation;
        }
        
        standGroup.userData = { isScenery: true, sceneryIndex: idx };
        this.environmentGroup.add(standGroup);
      }
    });
  }

  /**
   * The smooth surface the car rests on, ignoring curb lips and the verge step.
   *
   * Separate from getGroundHeight on purpose. That one has to include curbs and
   * the grass drop so the suspension feels them, but feeding those steps into a
   * slope calculation makes the ground appear to tilt violently the instant one
   * wheel clips a kerb, and the resulting gravity kick reads as the car shaking.
   * Which way is downhill has to come from something continuous.
   */
  public getSlopeHeight(x: number, z: number, yHint?: number): number {
    const terrainHeight = this.terrain.sampleAt(x, z);
    const spurInfo = this.getSpurInfo(x, z, yHint);
    const spurHeight =
      spurInfo && (spurInfo.onAsphalt || spurInfo.onCurb || spurInfo.onGrass)
        ? spurInfo.baseHeight
        : null;

    if (this.roadSamplePoints.length < 2) {
      if (spurHeight === null) return terrainHeight;
      if (yHint === undefined) return spurHeight;
      return Math.abs(spurHeight - yHint) <= Math.abs(terrainHeight - yHint)
        ? spurHeight
        : terrainHeight;
    }

    const info = this.getTrackInfo(x, z, yHint);
    const reach = info.width / 2 + (info.grassWidth ?? 0) + this.curbWidth;
    // Same embankment rule as getGroundHeight, so which way the car thinks is
    // downhill agrees with what is holding it up.
    const shoulder = Math.max(12, Math.abs(info.closestPt.y - terrainHeight) * 1.5);
    const blend = THREE.MathUtils.clamp((info.dist - reach) / shoulder, 0, 1);
    const mainHeight = THREE.MathUtils.lerp(info.closestPt.y, terrainHeight, blend);

    if (spurHeight === null) return mainHeight;
    if (yHint !== undefined) {
      // getGroundHeight performs deck selection against the actual banked ribbon.
      // Once that source is known, return this method's smooth version of it.
      const selectedSupport = this.getGroundHeight(x, z, yHint);
      return Math.abs(selectedSupport - spurHeight) < 0.3
        ? spurHeight
        : mainHeight;
    }

    // Legacy callers have no deck hint, so retain the old XZ rule.
    return info.dist > info.width / 2 ? spurHeight : mainHeight;
  }

  /**
   * Where a point on the road sits in node-index space, or null if it is not on the
   * tarmac. A result of 3.4 means "between node 3 and node 4", which is exactly what
   * the editor needs to splice a new node into the lap without anyone typing an
   * index. Only the road surface counts: clicking the grass beside it is a miss, so
   * the editor can treat that as appending to the end instead.
   */
  public getNodeIndexAt(x: number, z: number): number | null {
    if (this.roadSampleNodeIndex.length === 0) return null;

    const info = this.getTrackInfo(x, z);
    if (info.dist > info.width / 2) return null;

    const from = this.roadSampleNodeIndex[info.closestIdx];
    const to = this.roadSampleNodeIndex[info.closestIdx + 1];
    if (from === undefined) return null;
    // The sequence climbs to the node count and restarts at the seam; interpolating
    // across that wrap would land the node at the wrong end of the lap.
    if (to === undefined || to < from) return from;
    return from + (to - from) * info.frac;
  }

  /**
   * Detailed info about how a world point relates to any active spur road.
   */
  public getSpurInfo(x: number, z: number, yHint?: number): SpurRoadInfo | null {
    if (this.spurSurfaces.length === 0) return null;

    let bestScore = Infinity;
    let bestInfo: SpurRoadInfo | null = null;

    for (let spurIndex = 0; spurIndex < this.spurSurfaces.length; spurIndex++) {
      const spur = this.spurSurfaces[spurIndex];
      if (x < spur.minX || x > spur.maxX || z < spur.minZ || z > spur.maxZ) {
        continue;
      }

      for (let i = 0; i < spur.samples.length - 1; i++) {
        const from = spur.samples[i];
        const to = spur.samples[i + 1];
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const lengthSq = dx * dx + dz * dz;
        if (lengthSq < 1e-8) continue;

        const t = THREE.MathUtils.clamp(
          ((x - from.x) * dx + (z - from.z) * dz) / lengthSq,
          0,
          1
        );
        const ptX = from.x + dx * t;
        const ptZ = from.z + dz * t;
        const offX = x - ptX;
        const offZ = z - ptZ;
        const dist = Math.hypot(offX, offZ);

        const normFrom = spur.normals[i] ?? new THREE.Vector3(1, 0, 0);
        const normTo = spur.normals[i + 1] ?? normFrom;
        const normal = new THREE.Vector3().lerpVectors(normFrom, normTo, t).normalize();
        const tangFrom = spur.tangents[i] ?? new THREE.Vector3(0, 0, 1);
        const tangTo = spur.tangents[i + 1] ?? tangFrom;
        const tangent = new THREE.Vector3().lerpVectors(tangFrom, tangTo, t).normalize();
        const sideSign: 1 | -1 = offX * normal.x + offZ * normal.z >= 0 ? 1 : -1;
        const baseStyle = sideSign > 0 ? spur.left : spur.right;
        const opening = spur.openSamples[i] || spur.openSamples[i + 1];
        const style = opening
          ? { ...baseStyle, haveCurb: false, grassWidth: 0, fence: false }
          : baseStyle;
        const widths = sideSign > 0 ? spur.leftWidths : spur.rightWidths;
        const halfWidth = THREE.MathUtils.lerp(widths[i], widths[i + 1], t);
        const curbEnd = halfWidth + (style.haveCurb ? style.curbWidth : 0);
        const grassEnd = curbEnd + style.grassWidth;
        // Keep a generous fence-only capture margin so one fast frame cannot jump
        // clean over the rail. Ground height below still rejects this outer zone.
        const queryReach = grassEnd + (style.fence ? 8 : 0.5);
        if (dist > queryReach) continue;

        const baseHeight = THREE.MathUtils.lerp(from.y, to.y, t) - 0.05;
        const score =
          yHint === undefined ? dist : Math.abs(baseHeight - yHint) * 10 + dist;
        if (score >= bestScore) continue;

        bestScore = score;
        bestInfo = {
          dist,
          sideSign,
          closestPt: new THREE.Vector3(ptX, baseHeight, ptZ),
          normal,
          tangent,
          halfWidth,
          haveCurb: style.haveCurb,
          curbWidth: style.curbWidth,
          haveGrass: style.grassWidth > 0.05,
          grassWidth: style.grassWidth,
          fence: style.fence,
          trackBoundary: grassEnd,
          onAsphalt: dist <= halfWidth + 0.5,
          onCurb: style.haveCurb && dist > halfWidth && dist <= curbEnd + 0.1,
          onGrass: style.grassWidth > 0.05 && dist > curbEnd && dist < grassEnd,
          baseHeight,
          spurIndex
        };
      }
    }

    return bestInfo;
  }

  public getSpurBarriers(): SpurBarrier[] {
    return this.spurSurfaces.flatMap((spur) => spur.barriers);
  }

  /** Grip classification on the same elevation-aware surface that supports the car. */
  public isPointOnGrass(x: number, z: number, yHint?: number): boolean {
    const supportHeight = this.getGroundHeight(x, z, yHint);
    const spurInfo = this.getSpurInfo(x, z, yHint);
    const spurHeight = this.getSpurHeight(x, z, yHint);
    if (
      spurInfo &&
      spurHeight !== null &&
      Math.abs(spurHeight - supportHeight) < 0.3 &&
      spurInfo.dist <= spurInfo.trackBoundary + 0.5
    ) {
      if (spurInfo.onAsphalt || spurInfo.onCurb) return false;
      if (spurInfo.onGrass) return true;
    }

    const info = this.getTrackInfo(x, z, yHint);
    const grassWidth = info.grassWidth ?? 0;
    if (grassWidth <= 0) return false;
    const grassStart = info.width / 2 + (info.curb ? this.curbWidth : 0);
    return info.dist >= grassStart && info.dist < grassStart + grassWidth;
  }

  public isPointOnSpur(x: number, z: number): boolean {
    const info = this.getSpurInfo(x, z);
    return info !== null && (info.onAsphalt || info.onCurb);
  }

  /**
   * Height of the branch tarmac under a point, or null when the point is not on one.
   */
  public getSpurHeight(x: number, z: number, yHint?: number): number | null {
    const info = this.getSpurInfo(x, z, yHint);
    if (!info) return null;

    if (info.onAsphalt) {
      return info.baseHeight;
    }

    if (info.onCurb) {
      return info.baseHeight + this.curbHeight;
    }

    if (info.onGrass) {
      const grassStart = info.halfWidth + (info.haveCurb ? info.curbWidth : 0);
      const t = (info.dist - grassStart) / (info.grassWidth || 1);
      const innerHeight = info.baseHeight + (info.haveCurb ? this.curbHeight : 0);
      const outerHeight = Math.max(info.closestPt.y + 0.02, innerHeight - 0.24);
      return THREE.MathUtils.lerp(innerHeight, outerHeight, t);
    }

    return null;
  }

  public getGroundHeight(x: number, z: number, yHint?: number): number {
    const terrainHeight = this.terrain.sampleAt(x, z);
    if (this.roadSamplePoints.length < 2 || this.roadSampleLeftPoints.length === 0 || this.roadSampleRightPoints.length === 0) {
      const spurHeight = this.getSpurHeight(x, z, yHint);
      if (spurHeight === null) return terrainHeight;
      if (yHint === undefined) return spurHeight;
      return Math.abs(spurHeight - yHint) <= Math.abs(terrainHeight - yHint)
        ? spurHeight
        : terrainHeight;
    }

    const spurInfo = this.getSpurInfo(x, z, yHint);
    const spurHeight = this.getSpurHeight(x, z, yHint);
    const info = this.getTrackInfo(x, z, yHint);
    const halfWidth = info.width / 2;

    // Build the actual banked main-road candidate before choosing between decks.
    // Centreline Y is not enough here: at strong banking the driven edge can sit
    // metres above or below it.

    // The two road edges either end of the segment the car is over. Interpolating
    // along the segment as well as across it makes this the actual mesh quad, so
    // the surface the car rests on is the surface that was drawn — continuous,
    // instead of a fresh flat step every sample.
    const idx = info.closestIdx;
    const nextIdx = Math.min(idx + 1, this.roadSampleLeftPoints.length - 1);
    const leftStart = this.roadSampleLeftPoints[idx];
    const leftEnd = this.roadSampleLeftPoints[nextIdx];
    const rightStart = this.roadSampleRightPoints[idx];
    const rightEnd = this.roadSampleRightPoints[nextIdx];

    if (!leftStart || !leftEnd || !rightStart || !rightEnd) {
      if (spurHeight === null) return terrainHeight;
      if (yHint === undefined) return spurHeight;
      return Math.abs(spurHeight - yHint) <= Math.abs(terrainHeight - yHint)
        ? spurHeight
        : terrainHeight;
    }

    const left = new THREE.Vector3().lerpVectors(leftStart, leftEnd, info.frac);
    const right = new THREE.Vector3().lerpVectors(rightStart, rightEnd, info.frac);

    // We interpolate the height between left and right points based on the XZ projection
    const segmentXZ = new THREE.Vector2(left.x - right.x, left.z - right.z);
    const lenXZSq = segmentXZ.lengthSq();
    let u = 0.5; // Default to center if length is tiny
    if (lenXZSq > 0.0001) {
      const toCarXZ = new THREE.Vector2(x - right.x, z - right.z);
      u = Math.max(0, Math.min(1, toCarXZ.dot(segmentXZ) / lenXZSq));
    }
    
    // Calculate the base road height at the car's current offset
    const baseRoadHeight = THREE.MathUtils.lerp(right.y, left.y, u);

    const curbStart = halfWidth;
    const curbEnd = halfWidth + (info.curb ? this.curbWidth : 0);
    const grassStart = curbEnd;
    const localGrassWidth = info.grassWidth ?? 0;
    const grassEnd = grassStart + localGrassWidth;

    let mainHeight: number;
    if (info.dist < halfWidth) {
      // Subtract the visual raise offset to get the physical asphalt height.
      mainHeight = baseRoadHeight - 0.05;
    } else if (info.curb && info.dist >= curbStart && info.dist <= curbEnd) {
      mainHeight = baseRoadHeight - 0.05 + this.curbHeight;
    } else if (localGrassWidth > 0 && info.dist >= grassStart && info.dist < grassEnd) {
      const t = (info.dist - grassStart) / (localGrassWidth || 1);
      const innerHeight = baseRoadHeight + (info.curb ? this.curbHeight : 0);
      const outerHeight = Math.max(info.closestPt.y + 0.02, innerHeight - 0.24);
      mainHeight = THREE.MathUtils.lerp(innerHeight, outerHeight, t);
    } else {
      // Past the verge the ground is whatever the terrain says, reached down an
      // embankment rather than a step.
      const vergeHeight =
        localGrassWidth > 0
          ? Math.max(info.closestPt.y + 0.02, baseRoadHeight - 0.24)
          : baseRoadHeight;
      const shoulder = Math.max(6, Math.abs(vergeHeight - terrainHeight) * 1.5);
      const blend = THREE.MathUtils.clamp((info.dist - grassEnd) / shoulder, 0, 1);
      mainHeight = THREE.MathUtils.lerp(vergeHeight, terrainHeight, blend);
    }

    if (spurHeight === null) return mainHeight;
    if (yHint !== undefined) {
      // Compare against the physical banked mesh height, not the centreline.
      return Math.abs(spurHeight - yHint) + 0.01 < Math.abs(mainHeight - yHint)
        ? spurHeight
        : mainHeight;
    }

    // Preserve legacy no-hint behavior for non-vehicle callers.
    return info.dist > halfWidth ||
      (spurInfo?.onAsphalt && spurInfo.dist < info.dist)
      ? spurHeight
      : mainHeight;
  }
}
