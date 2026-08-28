import * as THREE from 'three';
import { BaseMode } from './BaseMode';
import { TRACKS_DATABASE, TrackScenery } from '../config/TrackDatabase';
import { GameEngine } from '../gameEngine';
import { Vehicle } from '../objects/Vehicle';
import { ParticleSystem } from '../objects/ParticleSystem';
import { resolveTrackLayout } from './trackNodes';
import {
  getMinNodeSpacing,
  isTerrainHeightBrush,
  removeEditorSpurPointAt,
  remapEditorSpursForInsertedNode,
  remapEditorSpursForRemovedNode
} from '../engine/types';
import type { EditorScenery } from '../engine/types';
import {
  eraseGrassPatchesWithin,
  grassPatchScaleForRadius,
  hasGrassPatchNear
} from '../objects/Grass';
import { applyBrush } from './terrain';

/** Vertices per brush ring. Enough that a 250m brush still reads as a circle. */
const BRUSH_RING_SEGMENTS = 72;

export class PreviewMode extends BaseMode {
  // Static state to preserve camera between track geometry rebuilds
  public static isRebuilding = false;
  private static lastPitch = -Math.PI / 4;
  private static lastYaw = 0;

  private trackId: string;
  private centerPt = new THREE.Vector3();

  // Free camera state
  private pitch = -Math.PI / 4;
  private yaw = 0;
  private isDraggingCamera = false;
  private isPanningCamera = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  /** Framing that Reset View returns to, measured from the track when it loads. */
  private defaultRadius = 200;

  // 3D Editor drag state
  private draggedNodeIdx: number | null = null;
  private draggedSceneryIdx: number | null = null;
  /** The live prop mesh being dragged, so it can follow the cursor immediately. */
  private draggedSceneryObject: THREE.Object3D | null = null;
  /**
   * Height of the horizontal plane a drag runs on. A raised node or a lifted prop
   * used to be dragged on the y = 0 plane, so it jumped away from the cursor the
   * moment it was grabbed.
   */
  private dragPlaneY = 0;
  private hoveredNodeIdx: number | null = null;
  private isSculpting = false;
  private flattenTarget: number | undefined;

  // Grass brush stroke state
  private isPaintingGrass = false;
  /** The stroke's own copy of the scenery list, so fast drags cannot double-paint. */
  private paintedScenery: EditorScenery[] | null = null;
  /** How many items existed before the stroke, so only new patches are previewed. */
  private paintBaseCount = 0;
  private paintPreviewGroups: THREE.Object3D[] = [];
  
  // Visual markers and helpers
  private nodesVisualGroup = new THREE.Group();
  private nodeMarkers: THREE.Mesh[] = [];
  /** Handles for the blocked-off branches, kept apart from the lap's own handles. */
  private spurVisualGroup = new THREE.Group();
  private spurMarkers: { mesh: THREE.Mesh; spur: number; point: number }[] = [];
  private draggedSpurPoint: { spur: number; point: number } | null = null;
  /**
   * Bright line through each branch's points. Kept out of the marker group so it can
   * never swallow a click meant for a handle.
   */
  private spurGuideGroup = new THREE.Group();
  private spurGuideSignature = '';
  private hoverCursor: THREE.Mesh | null = null;
  private brushCursor: THREE.Group | null = null;
  private gridHelper: THREE.GridHelper | null = null;
  /** Grid is rebuilt only when the snap or map size it is drawn from changes. */
  private gridSignature = '';
  private sceneryOutlineHelper: THREE.BoxHelper | null = null;
  private lastSelectedSceneryIndex: number | null = null;

  constructor(
    engine: GameEngine,
    scene: THREE.Scene,
    vehicle: Vehicle,
    particles: ParticleSystem,
    environmentGroup: THREE.Group,
    keys: { [key: string]: boolean },
    trackId: string
  ) {
    super(engine, scene, vehicle, particles, environmentGroup, keys);
    this.trackId = trackId;
    // In the editor you want to see grass come up as you paint it.
    this.grassGrowsIn = true;

    // Bind event listeners
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onDoubleClick = this.onDoubleClick.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onWindowBlur = this.onWindowBlur.bind(this);
  }

  /**
   * Alt-tabbing away used to leave a drag or a camera spin latched on, so the next
   * click back in the editor threw whatever was held across the map.
   */
  private onWindowBlur() {
    this.onMouseUp();
  }

  private onContextMenu(e: MouseEvent) {
    e.preventDefault();
  }

  /** True when the event landed on a floating HTML panel rather than the viewport. */
  private isOverUi(e: Event): boolean {
    const targetEl = e.target as HTMLElement | null;
    if (!targetEl || typeof targetEl.closest !== 'function') return false;
    return !!(
      targetEl.closest('.pointer-events-auto') ||
      targetEl.closest('button') ||
      targetEl.closest('input') ||
      targetEl.closest('select') ||
      targetEl.closest('textarea')
    );
  }

  private getPointerRaycaster(e: MouseEvent): THREE.Raycaster {
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.engine.camera);
    return raycaster;
  }

  /**
   * Where the cursor lands on a horizontal plane. `planeY` defaults to the ground,
   * but a drag passes the height of whatever it grabbed so the object tracks the
   * cursor instead of sliding away by its own elevation.
   */
  private getRaycastIntersection(e: MouseEvent, planeY = 0): THREE.Vector3 | null {
    const raycaster = this.getPointerRaycaster(e);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, target)) {
      return target;
    }
    return null;
  }

  /** Index of the node marker under the cursor, or -1. */
  private pickNode(raycaster: THREE.Raycaster): number {
    const hits = raycaster.intersectObjects(this.nodesVisualGroup.children, true);
    if (hits.length === 0) return -1;
    const match = hits[0].object.name.match(/^node-(\d+)$/);
    return match ? parseInt(match[1], 10) : -1;
  }

  /** Track node closest to a spot, or null when the track has no nodes yet. */
  private nearestNodeIndex(x: number, z: number): number | null {
    const nodes = this.engine.editorState.nodes;
    let best: number | null = null;
    let bestDistSq = Infinity;
    nodes.forEach((node, index) => {
      const distSq = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = index;
      }
    });
    return best;
  }

  /** The spur point under the cursor, or null. */
  private pickSpurPoint(raycaster: THREE.Raycaster): { spur: number; point: number } | null {
    const hits = raycaster.intersectObjects(this.spurVisualGroup.children, true);
    if (hits.length === 0) return null;
    const match = hits[0].object.name.match(/^spur-(\d+)-(\d+)$/);
    if (!match) return null;
    return { spur: parseInt(match[1], 10), point: parseInt(match[2], 10) };
  }

  /** Index of the decoration under the cursor, or -1. */
  private pickScenery(raycaster: THREE.Raycaster): number {
    const hits = raycaster.intersectObjects(this.environmentGroup.children, true);
    if (hits.length === 0) return -1;
    // Only the nearest hit counts: the environment group also holds the terrain and
    // road, so a click on open ground must not reach through to a prop behind it.
    let current: THREE.Object3D | null = hits[0].object;
    while (current && current !== this.environmentGroup) {
      if (current.userData && current.userData.isScenery) {
        return current.userData.sceneryIndex as number;
      }
      current = current.parent;
    }
    return -1;
  }

  private findSceneryObject(index: number): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this.environmentGroup.traverse((child) => {
      if (child.userData && child.userData.isScenery && child.userData.sceneryIndex === index) {
        found = child;
      }
    });
    return found;
  }

  /**
   * Pushes a dragged position back out to the minimum spacing from its loop
   * neighbours. Clamping keeps the drag smooth, where rejecting it outright would
   * make the node stick.
   */
  private clampToNeighbourSpacing(
    nodes: any[],
    idx: number,
    x: number,
    z: number,
    minSpacing: number
  ): { x: number; z: number } {
    const n = nodes.length;
    let outX = x;
    let outZ = z;
    // Two passes, so satisfying one neighbour cannot quietly violate the other.
    for (let pass = 0; pass < 2; pass++) {
      for (const offset of [-1, 1]) {
        const other = nodes[(((idx + offset) % n) + n) % n];
        if (!other || other === nodes[idx]) continue;
        let dx = outX - other.x;
        let dz = outZ - other.z;
        let dist = Math.hypot(dx, dz);
        if (dist >= minSpacing) continue;
        if (dist < 1e-4) {
          // Exactly on top of the neighbour, so any push-out direction will do.
          dx = 1;
          dz = 0;
          dist = 1;
        }
        outX = other.x + (dx / dist) * minSpacing;
        outZ = other.z + (dz / dist) * minSpacing;
      }
    }
    return { x: outX, z: outZ };
  }

  /**
   * Snaps a ground-plane hit to the grid and clamps it to the map bounds.
   * `free` skips the snap but keeps the clamp, so nothing can be placed off-map.
   */
  private applyGridSnap(
    state: { snapToGrid: number; gridLimit: number },
    target: THREE.Vector3,
    free: boolean
  ): { x: number; z: number } {
    let x = target.x;
    let z = target.z;
    if (!free && state.snapToGrid > 0) {
      x = Math.round(target.x / state.snapToGrid) * state.snapToGrid;
      z = Math.round(target.z / state.snapToGrid) * state.snapToGrid;
    }
    // The bound is the map size, not the snap size. Deriving it from snapToGrid
    // meant turning snapping off collapsed it to zero and nothing could be moved.
    const limit = Math.max(1, state.gridLimit) * 2;
    return {
      x: Math.max(-limit, Math.min(limit, x)),
      z: Math.max(-limit, Math.min(limit, z))
    };
  }

  /**
   * Drapes the brush rings over the ground at the cursor. Following the terrain
   * rather than drawing a flat disc is the whole point: on a slope a flat circle
   * sits half-buried and gives no idea what the brush will actually reach.
   */
  private updateBrushCursor(x: number, z: number, radius: number, brush: string) {
    if (!this.brushCursor) return;
    this.brushCursor.visible = true;

    // Digging reads red, building up reads amber, levelling reads blue, and the
    // grass brushes read green for planting and red for clearing.
    const color =
      brush === 'grass'
        ? 0x4ade80
        : brush === 'grass_erase'
          ? 0xff7a7a
          : brush === 'lower'
            ? 0xff5c5c
            : brush === 'raise'
              ? 0xffb020
              : 0x5cc8ff;

    this.brushCursor.children.forEach((child, ring) => {
      const line = child as THREE.LineLoop;
      (line.material as THREE.LineBasicMaterial).color.setHex(color);
      // Outer ring is where the brush stops mattering; inner is roughly half strength.
      const r = radius * (ring === 0 ? 1 : 0.5);
      const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < BRUSH_RING_SEGMENTS; i++) {
        const angle = (i / BRUSH_RING_SEGMENTS) * Math.PI * 2;
        const px = x + Math.cos(angle) * r;
        const pz = z + Math.sin(angle) * r;
        pos.setXYZ(i, px, this.terrain.sampleAt(px, pz) + 0.35, pz);
      }
      pos.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    });
  }

  /**
   * Applies one brush dab and refreshes only the patch of mesh it moved, so a
   * stroke costs the brush area rather than the whole terrain.
   */
  private sculptAt(x: number, z: number) {
    const state = this.engine.editorState;
    if (!isTerrainHeightBrush(state.terrainBrush)) return;
    const rect = applyBrush(this.terrain, {
      brush: state.terrainBrush,
      x,
      z,
      radius: state.terrainBrushRadius,
      strength: state.terrainBrushStrength,
      targetHeight: this.flattenTarget
    });
    this.refreshTerrainRegion(rect);
  }

  /**
   * One dab of the grass brush. Painting drops whole patches rather than single
   * blades, so a stroke lays a handful of overlapping patches instead of thousands
   * of separate props, and the spacing test stops a slow drag stacking them.
   *
   * The stroke works on its own copy of the scenery list: React state lands a frame
   * later, so reading it back mid-stroke would paint duplicates.
   */
  private paintGrassAt(x: number, z: number) {
    const state = this.engine.editorState;
    if (!this.paintedScenery) return;

    const radius = state.terrainBrushRadius;

    if (state.terrainBrush === 'grass_erase') {
      // Patches already in the scene are hidden straight away; the ones this stroke
      // painted are rebuilt below. Either way the ground clears under the ring.
      this.hideGrassPatchesNear(x, z, radius);
      const remaining = eraseGrassPatchesWithin(this.paintedScenery, x, z, radius);
      if (remaining.length === this.paintedScenery.length) return;
      this.paintedScenery = remaining;
      state.onSelectScenery?.(null);
      state.onUpdateScenery?.(this.paintedScenery);
      this.refreshPaintedPatches();
      return;
    }

    // Patches overlap by about a fifth, which covers ground without seams while
    // keeping the count low.
    if (hasGrassPatchNear(this.paintedScenery, x, z, radius * 0.8)) return;
    // A patch centred on the road would lay its mat over the tarmac. Blades are
    // already skipped there, but the mat has to be kept off too.
    if (this.roadSamplePoints.length > 1) {
      const info = this.getTrackInfo(x, z);
      if (info.dist < info.width / 2 + 1.5) return;
    }

    const patch: EditorScenery = {
      type: 'grass_patch',
      x,
      z,
      scale: grassPatchScaleForRadius(radius)
    };
    this.paintedScenery = [...this.paintedScenery, patch];
    state.onUpdateScenery?.(this.paintedScenery);
    // Only the new patch is built. Rebuilding the whole stroke would restart the
    // sprout on every patch behind the cursor.
    this.addPaintedPatchPreview(this.paintedScenery.length - 1);
  }

  /** Builds one painted patch into the live scene, mid-stroke. */
  private addPaintedPatchPreview(index: number) {
    const item = this.paintedScenery?.[index];
    if (!item || item.type !== 'grass_patch') return;

    const time = TRACKS_DATABASE.find((t) => t.id === this.trackId)?.time ?? 'afternoon';
    const patch = this.buildGrassPatch(
      {
        type: 'grass_patch',
        position: new THREE.Vector3(item.x, item.y ?? 0, item.z),
        scale: item.scale,
        heightScale: item.heightScale,
        rotation: item.rotation
      },
      index,
      time
    );
    this.environmentGroup.add(patch);
    this.paintPreviewGroups.push(patch);
  }

  /**
   * Shows the stroke as it happens. The world rebuild is suppressed while painting
   * (same as during a drag), so without this the grass would only appear when the
   * mouse came up.
   */
  private refreshPaintedPatches() {
    if (!this.paintedScenery) return;

    for (const mesh of this.paintPreviewGroups) {
      this.environmentGroup.remove(mesh);
    }
    this.paintPreviewGroups = [];

    const time = TRACKS_DATABASE.find((t) => t.id === this.trackId)?.time ?? 'afternoon';
    this.paintedScenery.forEach((item, idx) => {
      if (item.type !== 'grass_patch') return;
      // Only patches this stroke is responsible for; the rest are already built.
      if (idx < this.paintBaseCount) return;
      const patch = this.buildGrassPatch(
        {
          type: 'grass_patch',
          position: new THREE.Vector3(item.x, item.y ?? 0, item.z),
          scale: item.scale,
          heightScale: item.heightScale,
          rotation: item.rotation
        },
        idx,
        time
      );
      this.environmentGroup.add(patch);
      this.paintPreviewGroups.push(patch);
    });
  }

  /** Hides already-built grass patches under the brush, pending the rebuild. */
  private hideGrassPatchesNear(x: number, z: number, radius: number) {
    const radiusSq = radius * radius;
    for (const child of this.environmentGroup.children) {
      if (!child.userData?.isGrassPatch) continue;
      const dx = child.position.x - x;
      const dz = child.position.z - z;
      if (dx * dx + dz * dz <= radiusSq) child.visible = false;
    }
  }

  /** True while the active ground brush paints grass rather than moving height. */
  private isGrassBrush(): boolean {
    return !isTerrainHeightBrush(this.engine.editorState.terrainBrush);
  }

  private getDefaultScale(tool: string): number {
    if (tool.startsWith('tree')) return 2;
    if (tool === 'grass_patch') return 4;
    if (tool === 'hill') return 8;
    if (tool === 'mountain') return 1.0;
    if (tool === 'podium') return 1.0;
    if (tool === 'rock') return 2;
    if (tool === 'building') return 2;
    if (tool === 'house') return 1.5;
    if (tool === 'construction') return 2;
    return 1;
  }

  private onMouseDown(e: MouseEvent) {
    // Ignore mouse actions meant for floating HTML UI panels
    if (this.isOverUi(e)) return;

    if (e.button === 1) { // Middle click slides the view across the map
      this.isPanningCamera = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      e.preventDefault();
      return;
    }

    if (e.button === 2 || (e.button === 0 && e.shiftKey)) { // Right click or Shift+Left click to drag camera
      this.isDraggingCamera = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      e.preventDefault();
      return;
    }

    if (e.button === 0) { // Left click for placing/selecting/dragging
      const raycaster = this.getPointerRaycaster(e);

      const state = this.engine.editorState;
      if (state.activeMode !== 'editor') return;

      // Terrain sculpting owns the whole canvas while it is the active layer,
      // so a stroke never accidentally grabs a node or a prop.
      if (state.editLayer === 'terrain') {
        const hit = this.getRaycastIntersection(e);
        if (hit) {
          if (this.isGrassBrush()) {
            this.isPaintingGrass = true;
            this.paintedScenery = [...state.scenery];
            this.paintBaseCount = this.paintedScenery.length;
            this.paintPreviewGroups = [];
            // Borrow the scenery-drag flag: it is what stops React rebuilding the
            // whole world on every dab and autosaving mid-stroke.
            state.onDragSceneryStart?.(this.paintBaseCount);
            this.paintGrassAt(hit.x, hit.z);
          } else {
            this.isSculpting = true;
            // A flatten stroke locks onto the height it started on, so dragging
            // levels ground to where you first clicked rather than chasing itself.
            this.flattenTarget =
              state.terrainBrush === 'flatten' ? this.terrain.sampleAt(hit.x, hit.z) : undefined;
            this.sculptAt(hit.x, hit.z);
          }
        }
        return;
      }

      // Blocked branches live on the track layer alongside the lap nodes, and their
      // handles are checked first so an overlapping pair still grabs the branch you
      // can see on top.
      const clickedSpurPoint =
        state.editLayer === 'track' ? this.pickSpurPoint(raycaster) : null;

      // In spur mode, clicking another spur connects/closes loop into that spur
      if (
        state.tool === 'spur' &&
        clickedSpurPoint &&
        state.activeSpurIndex !== null &&
        clickedSpurPoint.spur !== state.activeSpurIndex
      ) {
        const spurs = state.spurs.map((spur) => ({ ...spur, nodes: [...spur.nodes] }));
        const targetIndex = state.activeSpurIndex;
        if (spurs[targetIndex]) {
          if (spurs[targetIndex].nodes.length === 0) {
            spurs[targetIndex].startSpurIndex = clickedSpurPoint.spur;
          } else {
            spurs[targetIndex].endSpurIndex = clickedSpurPoint.spur;
            spurs[targetIndex].blocked = false;
          }
          state.onUpdateSpurs?.(spurs);
          return;
        }
      }

      if (clickedSpurPoint) {
        this.draggedSpurPoint = clickedSpurPoint;
        this.dragPlaneY = state.spurs[clickedSpurPoint.spur]?.nodes[clickedSpurPoint.point]?.y ?? 0;
        state.onSelectSpurPoint?.(clickedSpurPoint);
        // Borrow the scenery-drag flag so the world is not rebuilt every mouse move.
        state.onDragSceneryStart?.(-1);
        return;
      }

      // Each layer only grabs its own kind of thing. Before this a stray click in
      // Decorate could pick up a track node, and a click in Track could drag a tree.
      const clickedNodeIdx = state.editLayer === 'decorate' ? -1 : this.pickNode(raycaster);
      const clickedSceneryIdx =
        clickedNodeIdx !== -1 || state.editLayer === 'track' ? -1 : this.pickScenery(raycaster);

      // In spur mode, clicking a track node anchors start or closes loop to that node!
      if (state.tool === 'spur' && clickedNodeIdx !== -1) {
        const spurs = state.spurs.map((spur) => ({ ...spur, nodes: [...spur.nodes] }));
        const targetIndex =
          state.activeSpurIndex !== null && spurs[state.activeSpurIndex]
            ? state.activeSpurIndex
            : spurs.length;
        if (!spurs[targetIndex]) spurs[targetIndex] = { nodes: [] };

        if (spurs[targetIndex].nodes.length === 0) {
          spurs[targetIndex].nodeIndex = clickedNodeIdx;
          state.onUpdateSpurs?.(spurs);
          state.onSelectSpurPoint?.(null);
        } else {
          spurs[targetIndex].endNodeIndex = clickedNodeIdx;
          spurs[targetIndex].blocked = false;
          state.onUpdateSpurs?.(spurs);
          state.onSelectSpurPoint?.({
            spur: targetIndex,
            point: spurs[targetIndex].nodes.length - 1
          });
        }
        return;
      }

      // Ground plane raycast fallback for placing new objects
      const target = this.getRaycastIntersection(e);

      // If we clicked on an existing element, select and start dragging it
      if (clickedNodeIdx !== -1) {
        this.draggedNodeIdx = clickedNodeIdx;
        // Drag along the node's own height, so a raised node stays under the cursor.
        this.dragPlaneY = state.nodes[clickedNodeIdx]?.y ?? 0;
        state.onSelectNode?.(clickedNodeIdx);
        state.onDragNodeStart?.(clickedNodeIdx);
      } else if (clickedSceneryIdx !== -1) {
        this.draggedSceneryIdx = clickedSceneryIdx;
        this.draggedSceneryObject = this.findSceneryObject(clickedSceneryIdx);
        this.dragPlaneY = this.draggedSceneryObject
          ? this.draggedSceneryObject.position.y
          : state.scenery[clickedSceneryIdx]?.y ?? 0;
        state.onSelectScenery?.(clickedSceneryIdx);
        state.onDragSceneryStart?.(clickedSceneryIdx);
      } else if (target) {
        // Empty space click - place new element according to the active tool.
        // Decoration can opt out of the grid so it can sit anywhere; track nodes
        // always snap, since the road geometry relies on tidy spacing.
        const snapped = this.applyGridSnap(state, target, state.tool !== 'node' && state.sceneryFreeMove);
        const finalX = snapped.x;
        const finalZ = snapped.z;

        if (state.tool === 'spur') {
          // Each click extends the active branch. A branch is an open run, so points
          // simply append; nothing here touches the lap or its centreline.
          const spurs = state.spurs.map((spur) => ({ ...spur, nodes: [...spur.nodes] }));
          const targetIndex =
            state.activeSpurIndex !== null && spurs[state.activeSpurIndex]
              ? state.activeSpurIndex
              : spurs.length;
          if (!spurs[targetIndex]) spurs[targetIndex] = { nodes: [] };
          // A branch has to leave the circuit somewhere, so the first click picks the
          // node nearest to it as the junction. That is also the node whose curb,
          // grass and fence get opened up so a car can drive out through it.
          if (spurs[targetIndex].nodeIndex === undefined && spurs[targetIndex].startSpurIndex === undefined) {
            const anchor = this.nearestNodeIndex(finalX, finalZ);
            if (anchor === null) {
              // No circuit yet: a branch would have nothing to attach to.
              return;
            }
            spurs[targetIndex].nodeIndex = anchor;
          }
          spurs[targetIndex].nodes.push({ x: finalX, z: finalZ, y: state.cornerHeight });
          state.onUpdateSpurs?.(spurs);
          state.onSelectSpurPoint?.({
            spur: targetIndex,
            point: spurs[targetIndex].nodes.length - 1
          });
        } else if (state.tool === 'node') {
          // Where in the lap this click belongs. Clicking the tarmac splices the node
          // between the two it fell between; clicking open ground continues the lap
          // from its end. Both used to be one window.prompt asking for the sequence
          // index by hand, once per node, which is most of why laying out a track was
          // such a chore.
          const onRoad = this.getNodeIndexAt(finalX, finalZ);
          const insertIdx =
            onRoad === null ? state.nodes.length : Math.floor(onRoad) + 1;

          const newNodes = [...state.nodes];
          newNodes.splice(insertIdx, 0, {
            x: finalX,
            z: finalZ,
            y: state.cornerHeight,
            width: state.roadWidth
          });

          // Nodes packed tighter than this warp the road mesh, so the new one slides
          // out to a legal gap. It used to be rejected outright with an alert, which
          // threw the click away and left you guessing where the line was.
          const spaced = this.clampToNeighbourSpacing(
            newNodes,
            insertIdx,
            finalX,
            finalZ,
            getMinNodeSpacing(state.roadWidth)
          );
          newNodes[insertIdx] = { ...newNodes[insertIdx], x: spaced.x, z: spaced.z };

          state.onUpdateNodes?.(newNodes);
          state.onUpdateSpurs?.(remapEditorSpursForInsertedNode(state.spurs, insertIdx));
          state.onSelectNode?.(insertIdx);
        } else {
          // Place new scenery
          const defaultScale = this.getDefaultScale(state.tool);
          const newItem: any = { type: state.tool, x: finalX, z: finalZ, scale: defaultScale };
          if (state.tool === 'podium') {
            newItem.rotation = 0;
          }
          const newScenery = [...state.scenery, newItem];
          state.onUpdateScenery?.(newScenery);
          state.onSelectScenery?.(newScenery.length - 1);
        }
      }
    }
  }

  private onMouseUp() {
    this.isDraggingCamera = false;
    this.isPanningCamera = false;

    const state = this.engine.editorState;
    if (this.isSculpting) {
      this.isSculpting = false;
      this.flattenTarget = undefined;
      // Persist once per stroke rather than per dab.
      state.onTerrainChange?.();
    }
    if (this.isPaintingGrass) {
      this.isPaintingGrass = false;
      if (this.paintedScenery) state.onUpdateScenery?.(this.paintedScenery);
      this.paintedScenery = null;
      // The stroke previews are thrown away here; releasing the drag flag lets the
      // real rebuild put the same patches back as part of the scene.
      for (const mesh of this.paintPreviewGroups) {
        this.environmentGroup.remove(mesh);
      }
      this.paintPreviewGroups = [];
      state.onDragSceneryEnd?.();
    }
    if (this.draggedNodeIdx !== null) {
      state.onUpdateNodes?.(state.nodes); // trigger final rebuild
      state.onDragNodeEnd?.();
      this.draggedNodeIdx = null;
    }
    if (this.draggedSceneryIdx !== null) {
      state.onUpdateScenery?.(state.scenery); // trigger final rebuild
      state.onDragSceneryEnd?.();
      this.draggedSceneryIdx = null;
      this.draggedSceneryObject = null;
    }
    if (this.draggedSpurPoint !== null) {
      this.draggedSpurPoint = null;
      state.onUpdateSpurs?.(state.spurs); // trigger the final rebuild
      state.onDragSceneryEnd?.();
    }
  }

  /** Wheel dollies the view along the cursor ray, so zoom lands where you point. */
  private onWheel(e: WheelEvent) {
    if (this.engine.editorState.activeMode !== 'editor') return;
    if (this.isOverUi(e)) return;

    e.preventDefault();

    const cam = this.engine.camera;
    // Step scales with altitude: close to the deck it creeps, high up it strides.
    const altitude = Math.max(6, Math.abs(cam.position.y));
    const step = -e.deltaY * altitude * 0.0012;
    const direction = this.getPointerRaycaster(e).ray.direction.clone();

    const next = cam.position.clone().addScaledVector(direction, step);
    next.y = THREE.MathUtils.clamp(next.y, 4, 4000);
    cam.position.copy(next);
  }

  /** Point the view at a spot on the map without changing the viewing angle. */
  public focusOnPoint(x: number, y: number, z: number, distance?: number) {
    const cam = this.engine.camera;
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')
    );
    const reach = distance ?? 110;
    const target = new THREE.Vector3(x, y, z);
    const next = target.clone().addScaledVector(forward, -reach);
    next.y = Math.max(next.y, y + 6);
    cam.position.copy(next);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  /**
   * Fly to whatever is selected. With nothing selected this frames the whole track,
   * which doubles as the way back when the free camera has been flown into the void.
   */
  public focusOnSelection() {
    const state = this.engine.editorState;

    if (state.selectedSpurPoint) {
      const selection = state.selectedSpurPoint;
      const point = state.spurs[selection.spur]?.nodes[selection.point];
      if (point) {
        this.focusOnPoint(point.x, point.y ?? 0, point.z, 90);
        return;
      }
    }
    if (state.selectedNodeIndex !== null && state.nodes[state.selectedNodeIndex]) {
      const node = state.nodes[state.selectedNodeIndex];
      this.focusOnPoint(node.x, node.y ?? 0, node.z, 90);
      return;
    }
    if (state.selectedSceneryIndex !== null && state.scenery[state.selectedSceneryIndex]) {
      const prop = state.scenery[state.selectedSceneryIndex];
      this.focusOnPoint(prop.x, prop.y ?? 0, prop.z, 90);
      return;
    }
    this.resetView();
  }

  /** Back to the opening overhead framing of the whole track. */
  public resetView() {
    const cam = this.engine.camera;
    this.pitch = -Math.PI / 4;
    this.yaw = 0;
    cam.up.set(0, 1, 0);
    cam.position.set(
      this.centerPt.x,
      this.defaultRadius * 0.8,
      this.centerPt.z + this.defaultRadius * 0.8
    );
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private onMouseMove(e: MouseEvent) {
    if (this.isDraggingCamera) {
      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;

      this.yaw -= deltaX * 0.005;
      this.pitch -= deltaY * 0.005;

      // Clamp pitch to avoid flipping
      this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      return;
    }

    if (this.isPanningCamera) {
      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;
      const cam = this.engine.camera;
      const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
      const right = new THREE.Vector3(1, 0, 0).applyEuler(euler);
      const up = new THREE.Vector3(0, 1, 0).applyEuler(euler);
      // Higher up, the same drag has to cover more ground to feel one to one.
      const scale = Math.max(6, Math.abs(cam.position.y)) * 0.0022;

      cam.position.addScaledVector(right, -deltaX * scale);
      cam.position.addScaledVector(up, deltaY * scale);

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      return;
    }

    const state = this.engine.editorState;
    if (state.activeMode !== 'editor') return;

    const hideCursors = () => {
      if (this.hoverCursor) this.hoverCursor.visible = false;
      if (this.brushCursor) this.brushCursor.visible = false;
    };

    // The panel check has to come before any editing, or dragging a brush slider
    // would keep painting terrain under the panel.
    if (this.isOverUi(e)) {
      this.hoveredNodeIdx = null;
      hideCursors();
      return;
    }

    // A drag runs on the height of what it grabbed; free hovering reads the ground.
    const dragging = this.draggedNodeIdx !== null || this.draggedSceneryIdx !== null;
    const target = this.getRaycastIntersection(e, dragging ? this.dragPlaneY : 0);
    if (!target) {
      hideCursors();
      return;
    }

    if (state.editLayer === 'terrain') {
      // Show the footprint whether or not a stroke is in progress, so the size
      // can be judged before committing to it.
      this.updateBrushCursor(target.x, target.z, state.terrainBrushRadius, state.terrainBrush);
      if (this.hoverCursor) this.hoverCursor.visible = false;
      this.hoveredNodeIdx = null;
      if (this.isSculpting) this.sculptAt(target.x, target.z);
      if (this.isPaintingGrass) this.paintGrassAt(target.x, target.z);
      return;
    }
    if (this.brushCursor) this.brushCursor.visible = false;

    // Light up the handle under the cursor, so it is obvious what a click will grab
    // before the click happens.
    this.hoveredNodeIdx =
      dragging || state.editLayer === 'decorate'
        ? null
        : (() => {
            const hit = this.pickNode(this.getPointerRaycaster(e));
            return hit === -1 ? null : hit;
          })();

    // Snapping. Decoration can move freely; nodes always stay on the grid.
    const movingScenery = this.draggedSceneryIdx !== null || (this.draggedNodeIdx === null && state.tool !== 'node');
    const snapped = this.applyGridSnap(state, target, movingScenery && state.sceneryFreeMove);
    const finalX = snapped.x;
    const finalZ = snapped.z;

    // Update hover cursor positioning. It is a "this is where the next one lands"
    // ghost, so it is hidden while hovering an existing handle or mid-drag, where a
    // click means grab rather than place.
    if (this.hoverCursor) {
      this.hoverCursor.position.set(finalX, state.tool === 'node' ? state.cornerHeight : 0.1, finalZ);
      this.hoverCursor.visible = !dragging && this.hoveredNodeIdx === null;
    }

    if (this.draggedSpurPoint) {
      const { spur, point } = this.draggedSpurPoint;
      const spurs = state.spurs.map((entry, idx) =>
        idx === spur
          ? {
              ...entry,
              nodes: entry.nodes.map((p, i) => (i === point ? { ...p, x: finalX, z: finalZ } : p))
            }
          : entry
      );
      state.onUpdateSpurs?.(spurs);
      const marker = this.spurMarkers.find((m) => m.spur === spur && m.point === point);
      if (marker) marker.mesh.position.set(finalX, marker.mesh.position.y, finalZ);
      return;
    }

    if (this.draggedNodeIdx !== null) {
      const newNodes = [...state.nodes];
      if (newNodes[this.draggedNodeIdx]) {
        const clamped = this.clampToNeighbourSpacing(
          newNodes,
          this.draggedNodeIdx,
          finalX,
          finalZ,
          getMinNodeSpacing(state.roadWidth)
        );
        newNodes[this.draggedNodeIdx] = { ...newNodes[this.draggedNodeIdx], x: clamped.x, z: clamped.z };
        state.onUpdateNodes?.(newNodes);
      }
    } else if (this.draggedSceneryIdx !== null) {
      const newScenery = [...state.scenery];
      if (newScenery[this.draggedSceneryIdx]) {
        newScenery[this.draggedSceneryIdx] = { ...newScenery[this.draggedSceneryIdx], x: finalX, z: finalZ };
        state.onUpdateScenery?.(newScenery);
        // The scene is not rebuilt mid-drag, so the prop itself is moved here.
        // Without this the model sat still until the mouse was released.
        if (this.draggedSceneryObject) {
          this.draggedSceneryObject.position.x = finalX;
          this.draggedSceneryObject.position.z = finalZ;
        }
      }
    }
  }

  private onDoubleClick(e: MouseEvent) {
    if (this.isOverUi(e)) return;

    const raycaster = this.getPointerRaycaster(e);

    const state = this.engine.editorState;
    if (state.activeMode !== 'editor') return;
    if (state.editLayer === 'terrain') return;

    // A branch point goes first, matching which handle a single click would grab.
    const clickedSpurPoint = state.editLayer === 'track' ? this.pickSpurPoint(raycaster) : null;
    if (clickedSpurPoint) {
      const spurs = removeEditorSpurPointAt(
        state.spurs,
        clickedSpurPoint.spur,
        clickedSpurPoint.point
      );
      state.onUpdateSpurs?.(spurs);
      state.onSelectSpurPoint?.(null);
      return;
    }

    // Check if double clicked a node to delete it
    const clickedNodeIdx = state.editLayer === 'decorate' ? -1 : this.pickNode(raycaster);

    if (clickedNodeIdx !== -1) {
      const newNodes = state.nodes.filter((_, idx) => idx !== clickedNodeIdx);
      state.onUpdateNodes?.(newNodes);
      state.onUpdateSpurs?.(remapEditorSpursForRemovedNode(state.spurs, clickedNodeIdx));
      state.onSelectNode?.(null);
      return;
    }

    // Check if double clicked scenery to delete it
    const clickedSceneryIdx = state.editLayer === 'track' ? -1 : this.pickScenery(raycaster);

    if (clickedSceneryIdx !== -1) {
      const newScenery = state.scenery.filter((_, idx) => idx !== clickedSceneryIdx);
      state.onUpdateScenery?.(newScenery);
      state.onSelectScenery?.(null);
    }
  }

  private rebuildNodeMarkers() {
    // Clear old visual markers
    while (this.nodesVisualGroup.children.length > 0) {
      const child = this.nodesVisualGroup.children[0];
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
      this.nodesVisualGroup.remove(child);
    }
    this.nodeMarkers = [];

    const state = this.engine.editorState;

    state.nodes.forEach((n, idx) => {
      const geom = new THREE.SphereGeometry(1.2, 12, 12);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.85,
        depthTest: false // render on top of the road surface
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(n.x, n.y ?? 0, n.z);
      mesh.name = `node-${idx}`;
      mesh.renderOrder = 998;
      this.nodesVisualGroup.add(mesh);
      this.nodeMarkers.push(mesh);
    });

    this.syncNodeMarkers();
  }

  /**
   * Keeps the handles honest every frame: position from the live node list, a colour
   * that says selected / hovered / start line, and a radius that holds roughly the
   * same size on screen.
   *
   * The old markers were a fixed 1.2m and were only rebuilt when the whole track
   * rebuilt, so from the default overhead camera they were a couple of pixels wide,
   * and a node being dragged did not move until the mouse was released.
   */
  private syncNodeMarkers() {
    const state = this.engine.editorState;
    if (this.nodeMarkers.length !== state.nodes.length) {
      this.rebuildNodeMarkers();
      return;
    }

    const camPos = this.engine.camera.position;

    this.nodeMarkers.forEach((mesh, idx) => {
      const node = state.nodes[idx];
      if (!node) return;

      mesh.position.set(node.x, node.y ?? 0, node.z);

      const distance = camPos.distanceTo(mesh.position);
      // 1.2 is the geometry radius, so this solves for a constant apparent size.
      const radius = THREE.MathUtils.clamp(distance * 0.014, 1.2, 9);
      mesh.scale.setScalar(radius / 1.2);

      const material = mesh.material as THREE.MeshBasicMaterial;
      const isSelected = state.selectedNodeIndex === idx;
      const isHovered = this.hoveredNodeIdx === idx;
      // Selected reads fuchsia, hover reads bright, node 0 marks the start line, and
      // everything else stays cyan.
      const color = isSelected ? 0xd946ef : isHovered ? 0xf8fafc : idx === 0 ? 0x22c55e : 0x06b6d4;
      material.color.setHex(color);
      material.opacity = isSelected || isHovered ? 1 : 0.85;
    });
  }

  /** Amber handles for the blocked branches, so they never look like lap nodes. */
  private rebuildSpurMarkers() {
    while (this.spurVisualGroup.children.length > 0) {
      const child = this.spurVisualGroup.children[0] as THREE.Mesh;
      child.geometry?.dispose();
      (child.material as THREE.Material | undefined)?.dispose();
      this.spurVisualGroup.remove(child);
    }
    this.spurMarkers = [];

    const state = this.engine.editorState;
    state.spurs.forEach((spur, spurIndex) => {
      spur.nodes.forEach((point, pointIndex) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1.2, 10, 10),
          new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.85,
            depthTest: false
          })
        );
        mesh.position.set(point.x, point.y ?? 0, point.z);
        mesh.name = `spur-${spurIndex}-${pointIndex}`;
        mesh.renderOrder = 998;
        this.spurVisualGroup.add(mesh);
        this.spurMarkers.push({ mesh, spur: spurIndex, point: pointIndex });
      });
    });

    this.syncSpurMarkers();
  }

  /**
   * Draws the line a branch will follow, straight from the clicked points.
   *
   * Without it a new spur showed nothing until the world was rebuilt with two or
   * more points in it, which read as the tool doing nothing at all.
   */
  private updateSpurGuides() {
    const state = this.engine.editorState;
    const signature =
      state.spurs
        .map(
          (spur) =>
            `${spur.nodeIndex ?? -1}>${spur.endNodeIndex ?? -1}>${spur.startSpurIndex ?? -1}>${spur.endSpurIndex ?? -1}>` +
            spur.nodes.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(';')
        )
        .join('|') +
      `:${state.editLayer}:${state.nodes.length}`;
    if (signature === this.spurGuideSignature) return;
    this.spurGuideSignature = signature;

    while (this.spurGuideGroup.children.length > 0) {
      const child = this.spurGuideGroup.children[0] as THREE.Line;
      child.geometry?.dispose();
      (child.material as THREE.Material | undefined)?.dispose();
      this.spurGuideGroup.remove(child);
    }

    for (const spur of state.spurs) {
      if (spur.nodes.length < 1) continue;

      // Start anchor (node or spur)
      let startAnchor: { x: number; z: number; y?: number } | undefined =
        spur.nodeIndex !== undefined ? state.nodes[spur.nodeIndex] : undefined;
      if (!startAnchor && spur.startSpurIndex !== undefined && state.spurs[spur.startSpurIndex]) {
        const target = state.spurs[spur.startSpurIndex].nodes;
        startAnchor = target[target.length - 1];
      }

      // End anchor (node or spur)
      let endAnchor: { x: number; z: number; y?: number } | undefined =
        spur.endNodeIndex !== undefined ? state.nodes[spur.endNodeIndex] : undefined;
      if (!endAnchor && spur.endSpurIndex !== undefined && state.spurs[spur.endSpurIndex]) {
        const target = state.spurs[spur.endSpurIndex].nodes;
        endAnchor = target[0];
      }

      const path = [
        ...(startAnchor ? [{ x: startAnchor.x, z: startAnchor.z, y: startAnchor.y }] : []),
        ...spur.nodes,
        ...(endAnchor ? [{ x: endAnchor.x, z: endAnchor.z, y: endAnchor.y }] : [])
      ];

      if (path.length < 2) continue;
      const points = path.map((p) => {
        const ground = this.getGroundHeight(p.x, p.z);
        return new THREE.Vector3(p.x, (Number.isFinite(ground) ? ground : p.y ?? 0) + 0.8, p.z);
      });
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: endAnchor ? 0x22c55e : 0xf59e0b,
          transparent: true,
          opacity: 0.95,
          depthTest: false
        })
      );
      line.renderOrder = 997;
      this.spurGuideGroup.add(line);
    }

    this.spurGuideGroup.visible = state.editLayer === 'track';
  }

  /** Same constant-screen-size treatment the lap handles get. */
  private syncSpurMarkers() {
    const state = this.engine.editorState;
    const total = state.spurs.reduce((sum, spur) => sum + spur.nodes.length, 0);
    if (this.spurMarkers.length !== total) {
      this.rebuildSpurMarkers();
      return;
    }

    const camPos = this.engine.camera.position;
    const selected = state.selectedSpurPoint;

    for (const marker of this.spurMarkers) {
      const point = state.spurs[marker.spur]?.nodes[marker.point];
      if (!point) continue;
      marker.mesh.position.set(point.x, point.y ?? 0, point.z);

      const radius = THREE.MathUtils.clamp(
        camPos.distanceTo(marker.mesh.position) * 0.014,
        1.2,
        9
      );
      marker.mesh.scale.setScalar(radius / 1.2);

      const material = marker.mesh.material as THREE.MeshBasicMaterial;
      const isSelected = selected?.spur === marker.spur && selected?.point === marker.point;
      // The mouth is where the branch leaves the circuit, so it reads differently.
      material.color.setHex(isSelected ? 0xfef08a : marker.point === 0 ? 0xfb923c : 0xf59e0b);
      material.opacity = isSelected ? 1 : 0.85;
      // Only shown while the track layer is active; other layers cannot touch them.
      marker.mesh.visible = state.editLayer === 'track';
    }
  }

  /**
   * Grid drawn from the map bound and the snap step. It used to be sized
   * `snapToGrid * 500`, which drew a 5km grid with 100m cells for a 10m snap and
   * vanished entirely when snapping was switched off.
   */
  private ensureGrid() {
    const state = this.engine.editorState;
    const size = Math.max(200, Math.round(state.gridLimit * 4));
    const cell = state.snapToGrid > 0 ? state.snapToGrid : 25;
    const divisions = THREE.MathUtils.clamp(Math.round(size / cell), 4, 400);
    const signature = `${size}:${divisions}`;
    if (this.gridHelper && this.gridSignature === signature) return;

    if (this.gridHelper) {
      this.gridHelper.geometry.dispose();
      (this.gridHelper.material as THREE.Material).dispose();
      this.scene.remove(this.gridHelper);
    }
    this.gridHelper = new THREE.GridHelper(size, divisions, 0x8b5cf6, 0x334155);
    this.gridHelper.position.y = 0.05;
    this.gridSignature = signature;
    this.scene.add(this.gridHelper);
  }

  public init() {
    this.clearEnvironment();
    this.particles.clear();
    
    // Create standard neon grid floor & sun
    this.createGridFloor();

    // The editor can preview one layout at a time, so the ribbon here is built from
    // the same filtered path a race on that layout would use.
    const trackConfig = resolveTrackLayout(
      TRACKS_DATABASE.find(t => t.id === this.trackId) || TRACKS_DATABASE[1],
      this.engine.editorState.previewLayoutId
    );
    
    // Create visual road mesh with curbs and fences
    this.createTerrain(trackConfig, trackConfig.time);
    this.createRacetrackRoad(trackConfig);
    this.createSpurRoads(trackConfig.spurs, trackConfig, trackConfig.time);
    this.createScenery(trackConfig.scenery, trackConfig.time);

    // Calculate center point of the track
    const path = trackConfig.path;
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    path.forEach(pt => {
      const pos = ('isVector3' in pt ? pt : (pt as any).pos) as THREE.Vector3;
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.z < minZ) minZ = pos.z;
      if (pos.z > maxZ) maxZ = pos.z;
    });

    // A brand-new or freshly cleared track has no path, so the fold above leaves
    // the bounds at +-Infinity. Framing from that put the camera at NaN and the
    // viewport went blank, which is the worst possible moment for it to happen.
    if (!Number.isFinite(minX) || !Number.isFinite(minZ)) {
      minX = 0;
      maxX = 0;
      minZ = 0;
      maxZ = 0;
    }

    this.centerPt.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    
    const maxRadius = Math.max((maxX - minX) / 2, (maxZ - minZ) / 2, 50) + 75;
    this.defaultRadius = maxRadius;

    // Hide vehicle in preview mode
    this.vehicle.mesh.visible = false;
    
    // Initial camera position
    const cam = this.engine.camera;
    if (PreviewMode.isRebuilding) {
      this.pitch = PreviewMode.lastPitch;
      this.yaw = PreviewMode.lastYaw;
      PreviewMode.isRebuilding = false; // Reset flag
    } else {
      cam.up.set(0, 1, 0);
      cam.position.set(this.centerPt.x, maxRadius * 0.8, this.centerPt.z + maxRadius * 0.8);
      this.pitch = -Math.PI / 4;
      this.yaw = 0;
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }

    // Set up interactive 3D editor helpers
    if (this.engine.editorState.activeMode === 'editor') {
      // Add grid helper
      this.ensureGrid();

      // Add visual node markers group
      this.scene.add(this.nodesVisualGroup);
      this.rebuildNodeMarkers();
      this.scene.add(this.spurVisualGroup);
      this.scene.add(this.spurGuideGroup);
      this.rebuildSpurMarkers();
      this.updateSpurGuides();

      // Add placement hover cursor
      const cursorGeom = new THREE.SphereGeometry(1.2, 12, 12);
      const cursorMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
        wireframe: true
      });
      this.hoverCursor = new THREE.Mesh(cursorGeom, cursorMat);
      this.scene.add(this.hoverCursor);

      // Terrain brush footprint. Two rings drawn as line loops: the outer one is
      // where the brush stops having any effect, the inner one is roughly where
      // its strength has halved, so the falloff is readable and not just a circle.
      this.brushCursor = new THREE.Group();
      this.brushCursor.visible = false;
      for (const opacity of [0.95, 0.45]) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array(BRUSH_RING_SEGMENTS * 3), 3)
        );
        const ring = new THREE.LineLoop(
          geom,
          new THREE.LineBasicMaterial({ color: 0xffb020, transparent: true, opacity, depthTest: false })
        );
        ring.renderOrder = 999;
        this.brushCursor.add(ring);
      }
      this.scene.add(this.brushCursor);
    }

    // Add event listeners
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('blur', this.onWindowBlur);
  }

  private updateSceneryOutline() {
    const state = this.engine.editorState;
    if (state.selectedSceneryIndex !== this.lastSelectedSceneryIndex) {
      this.lastSelectedSceneryIndex = state.selectedSceneryIndex;
      
      // Remove old outline
      if (this.sceneryOutlineHelper) {
        this.scene.remove(this.sceneryOutlineHelper);
        this.sceneryOutlineHelper.dispose();
        this.sceneryOutlineHelper = null;
      }

      if (state.activeMode !== 'editor' || state.selectedSceneryIndex === null) return;

      // Find the object
      let targetObj: THREE.Object3D | null = null;
      this.environmentGroup.traverse((child) => {
        if (child.userData && child.userData.isScenery && child.userData.sceneryIndex === state.selectedSceneryIndex) {
          targetObj = child;
        }
      });

      if (targetObj) {
        this.sceneryOutlineHelper = new THREE.BoxHelper(targetObj, 0xd946ef); // Glowing fuchsia outline
        this.scene.add(this.sceneryOutlineHelper);
      }
    }
  }

  public update(deltaTime: number) {
    this.updateScrollingFloor();
    this.updateGrass(deltaTime);
    this.particles.update(deltaTime);

    // Update scenery selection outline indicator
    this.updateSceneryOutline();
    if (this.sceneryOutlineHelper) {
      this.sceneryOutlineHelper.update();
    }

    if (this.engine.editorState.activeMode === 'editor') {
      // Handles follow the live node list, so a drag reads immediately, and the grid
      // follows the snap and map size the panel is set to.
      this.ensureGrid();
      this.syncNodeMarkers();
      this.syncSpurMarkers();
      this.updateSpurGuides();
    }

    const cam = this.engine.camera;
    const speed = this.keys['shift'] ? 150 : 50;
    
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'));
    
    if (this.keys['w'] || this.keys['arrowup']) cam.position.addScaledVector(forward, speed * deltaTime);
    if (this.keys['s'] || this.keys['arrowdown']) cam.position.addScaledVector(forward, -speed * deltaTime);
    if (this.keys['a'] || this.keys['arrowleft']) cam.position.addScaledVector(right, -speed * deltaTime);
    if (this.keys['d'] || this.keys['arrowright']) cam.position.addScaledVector(right, speed * deltaTime);
    if (this.keys['q'] || this.keys[' ']) cam.position.y += speed * deltaTime;
    if (this.keys['e']) cam.position.y -= speed * deltaTime;

    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // Save camera orientation in static variables so they persist if we rebuild
    PreviewMode.lastPitch = this.pitch;
    PreviewMode.lastYaw = this.yaw;
  }

  public cleanup() {
    this.clearEnvironment();
    this.vehicle.mesh.visible = true;

    // Remove editor markers and helpers
    if (this.gridHelper) {
      this.gridHelper.geometry.dispose();
      (this.gridHelper.material as THREE.Material).dispose();
      this.scene.remove(this.gridHelper);
      this.gridHelper = null;
      this.gridSignature = '';
    }
    this.scene.remove(this.nodesVisualGroup);
    this.scene.remove(this.spurVisualGroup);
    this.scene.remove(this.spurGuideGroup);
    this.spurGuideSignature = '';
    this.hoveredNodeIdx = null;
    this.draggedSceneryObject = null;
    this.draggedSpurPoint = null;
    if (this.hoverCursor) {
      this.scene.remove(this.hoverCursor);
      this.hoverCursor = null;
    }
    if (this.brushCursor) {
      this.brushCursor.children.forEach((child) => {
        const line = child as THREE.LineLoop;
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
      this.scene.remove(this.brushCursor);
      this.brushCursor = null;
    }
    if (this.sceneryOutlineHelper) {
      this.scene.remove(this.sceneryOutlineHelper);
      this.sceneryOutlineHelper.dispose();
      this.sceneryOutlineHelper = null;
    }
    this.lastSelectedSceneryIndex = null;

    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onWindowBlur);
  }

  public reset() {
    this.init();
  }
}
