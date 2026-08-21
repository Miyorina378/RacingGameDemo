import * as THREE from 'three';
import { BaseMode } from './BaseMode';
import { TRACKS_DATABASE, TrackScenery } from '../config/TrackDatabase';
import { GameEngine } from '../gameEngine';
import { Vehicle } from '../objects/Vehicle';
import { ParticleSystem } from '../objects/ParticleSystem';
import { getMinNodeSpacing } from '../engine/types';
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
  private lastMouseX = 0;
  private lastMouseY = 0;

  // 3D Editor drag state
  private draggedNodeIdx: number | null = null;
  private draggedSceneryIdx: number | null = null;
  private isSculpting = false;
  private flattenTarget: number | undefined;
  
  // Visual markers and helpers
  private nodesVisualGroup = new THREE.Group();
  private hoverCursor: THREE.Mesh | null = null;
  private brushCursor: THREE.Group | null = null;
  private gridHelper: THREE.GridHelper | null = null;
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

    // Bind event listeners
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onDoubleClick = this.onDoubleClick.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
  }

  private onContextMenu(e: MouseEvent) {
    e.preventDefault();
  }

  private getRaycastIntersection(e: MouseEvent): THREE.Vector3 | null {
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    const mouse = new THREE.Vector2(
      (clientX / rect.width) * 2 - 1,
      -(clientY / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.engine.camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0 ground plane
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, target)) {
      return target;
    }
    return null;
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

    // Digging reads red, building up reads amber, levelling reads blue.
    const color = brush === 'lower' ? 0xff5c5c : brush === 'raise' ? 0xffb020 : 0x5cc8ff;

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

  private getDefaultScale(tool: string): number {
    if (tool.startsWith('tree')) return 2;
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
    const targetEl = e.target as HTMLElement;
    // Ignore mouse actions meant for floating HTML UI panels
    if (
      targetEl.closest('.pointer-events-auto') || 
      targetEl.closest('button') || 
      targetEl.closest('input') || 
      targetEl.closest('select') ||
      targetEl.closest('textarea')
    ) {
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
      const rect = this.engine.renderer.domElement.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      
      const mouse = new THREE.Vector2(
        (clientX / rect.width) * 2 - 1,
        -(clientY / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.engine.camera);

      const state = this.engine.editorState;
      if (state.activeMode !== 'editor') return;

      // Terrain sculpting owns the whole canvas while it is the active layer,
      // so a stroke never accidentally grabs a node or a prop.
      if (state.editLayer === 'terrain') {
        const hit = this.getRaycastIntersection(e);
        if (hit) {
          this.isSculpting = true;
          // A flatten stroke locks onto the height it started on, so dragging
          // levels ground to where you first clicked rather than chasing itself.
          this.flattenTarget =
            state.terrainBrush === 'flatten' ? this.terrain.sampleAt(hit.x, hit.z) : undefined;
          this.sculptAt(hit.x, hit.z);
        }
        return;
      }

      // 1. Raycast against node spheres directly
      const nodeIntersects = raycaster.intersectObjects(this.nodesVisualGroup.children, true);
      let clickedNodeIdx = -1;
      if (nodeIntersects.length > 0) {
        const match = nodeIntersects[0].object.name.match(/^node-(\d+)$/);
        if (match) {
          clickedNodeIdx = parseInt(match[1], 10);
        }
      }

      // 2. Raycast against scenery. Only the nearest hit counts: the environment
      //    group also holds the terrain and road, so scanning past the first hit
      //    would let a click on open ground reach through and grab a prop stood
      //    somewhere behind it.
      const sceneryIntersects = raycaster.intersectObjects(this.environmentGroup.children, true);
      let clickedSceneryIdx = -1;
      if (sceneryIntersects.length > 0) {
        let current: THREE.Object3D | null = sceneryIntersects[0].object;
        while (current && current !== this.environmentGroup) {
          if (current.userData && current.userData.isScenery) {
            clickedSceneryIdx = current.userData.sceneryIndex;
            break;
          }
          current = current.parent;
        }
      }

      // 3. Ground plane raycast fallback for placing new objects
      const target = this.getRaycastIntersection(e);

      // If we clicked on an existing element, select and start dragging it
      if (clickedNodeIdx !== -1) {
        this.draggedNodeIdx = clickedNodeIdx;
        state.onSelectNode?.(clickedNodeIdx);
        state.onDragNodeStart?.(clickedNodeIdx);
      } else if (clickedSceneryIdx !== -1) {
        this.draggedSceneryIdx = clickedSceneryIdx;
        state.onSelectScenery?.(clickedSceneryIdx);
        state.onDragSceneryStart?.(clickedSceneryIdx);
      } else if (target) {
        // Empty space click - place new element according to the active tool.
        // Decoration can opt out of the grid so it can sit anywhere; track nodes
        // always snap, since the road geometry relies on tidy spacing.
        const snapped = this.applyGridSnap(state, target, state.tool !== 'node' && state.sceneryFreeMove);
        const finalX = snapped.x;
        const finalZ = snapped.z;

        if (state.tool === 'node') {
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

    const state = this.engine.editorState;
    if (this.isSculpting) {
      this.isSculpting = false;
      this.flattenTarget = undefined;
      // Persist once per stroke rather than per dab.
      state.onTerrainChange?.();
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
    }
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

    const state = this.engine.editorState;
    if (state.activeMode !== 'editor') return;

    const hideCursors = () => {
      if (this.hoverCursor) this.hoverCursor.visible = false;
      if (this.brushCursor) this.brushCursor.visible = false;
    };

    const target = this.getRaycastIntersection(e);
    if (!target) {
      hideCursors();
      return;
    }

    // The panel check has to come before any editing, or dragging a brush slider
    // would keep painting terrain under the panel.
    const targetEl = e.target as HTMLElement;
    if (
      targetEl.closest('.pointer-events-auto') ||
      targetEl.closest('button') ||
      targetEl.closest('input') ||
      targetEl.closest('select') ||
      targetEl.closest('textarea')
    ) {
      hideCursors();
      return;
    }

    if (state.editLayer === 'terrain') {
      // Show the footprint whether or not a stroke is in progress, so the size
      // can be judged before committing to it.
      this.updateBrushCursor(target.x, target.z, state.terrainBrushRadius, state.terrainBrush);
      if (this.hoverCursor) this.hoverCursor.visible = false;
      if (this.isSculpting) this.sculptAt(target.x, target.z);
      return;
    }
    if (this.brushCursor) this.brushCursor.visible = false;

    // Snapping. Decoration can move freely; nodes always stay on the grid.
    const movingScenery = this.draggedSceneryIdx !== null || (this.draggedNodeIdx === null && state.tool !== 'node');
    const snapped = this.applyGridSnap(state, target, movingScenery && state.sceneryFreeMove);
    const finalX = snapped.x;
    const finalZ = snapped.z;

    // Update hover cursor positioning
    if (this.hoverCursor) {
      this.hoverCursor.position.set(finalX, state.tool === 'node' ? state.cornerHeight : 0.1, finalZ);
      this.hoverCursor.visible = true;
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
      }
    }
  }

  private onDoubleClick(e: MouseEvent) {
    const targetEl = e.target as HTMLElement;
    if (
      targetEl.closest('.pointer-events-auto') || 
      targetEl.closest('button') || 
      targetEl.closest('input') || 
      targetEl.closest('select') ||
      targetEl.closest('textarea')
    ) {
      return;
    }

    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    const mouse = new THREE.Vector2(
      (clientX / rect.width) * 2 - 1,
      -(clientY / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.engine.camera);

    const state = this.engine.editorState;
    if (state.activeMode !== 'editor') return;

    // Check if double clicked a node to delete it
    const nodeIntersects = raycaster.intersectObjects(this.nodesVisualGroup.children, true);
    let clickedNodeIdx = -1;
    if (nodeIntersects.length > 0) {
      const match = nodeIntersects[0].object.name.match(/^node-(\d+)$/);
      if (match) {
        clickedNodeIdx = parseInt(match[1], 10);
      }
    }

    if (clickedNodeIdx !== -1) {
      const newNodes = state.nodes.filter((_, idx) => idx !== clickedNodeIdx);
      state.onUpdateNodes?.(newNodes);
      state.onSelectNode?.(null);
      return;
    }

    // Check if double clicked scenery to delete it
    const sceneryIntersects = raycaster.intersectObjects(this.environmentGroup.children, true);
    let clickedSceneryIdx = -1;
    if (sceneryIntersects.length > 0) {
      let current: THREE.Object3D | null = sceneryIntersects[0].object;
      while (current && current !== this.environmentGroup) {
        if (current.userData && current.userData.isScenery) {
          clickedSceneryIdx = current.userData.sceneryIndex;
          break;
        }
        current = current.parent;
      }
    }

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
      this.nodesVisualGroup.remove(child);
    }

    const state = this.engine.editorState;
    const selectedIdx = state.selectedNodeIndex;

    state.nodes.forEach((n, idx) => {
      const geom = new THREE.SphereGeometry(1.2, 12, 12);
      const isSelected = selectedIdx === idx;
      
      const mat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0xd946ef : 0x06b6d4, // glowing fuchsia for selected, cyan for normal
        transparent: true,
        opacity: 0.85,
        depthTest: false // render on top of the road surface
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(n.x, n.y ?? 0, n.z);
      mesh.name = `node-${idx}`;
      this.nodesVisualGroup.add(mesh);
    });
  }

  public init() {
    this.clearEnvironment();
    this.particles.clear();
    
    // Create standard neon grid floor & sun
    this.createGridFloor();

    const trackConfig = TRACKS_DATABASE.find(t => t.id === this.trackId) || TRACKS_DATABASE[1];
    
    // Create visual road mesh with curbs and fences
    this.createTerrain(trackConfig, trackConfig.time);
    this.createRacetrackRoad(trackConfig);
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

    this.centerPt.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    
    const maxRadius = Math.max((maxX - minX) / 2, (maxZ - minZ) / 2, 50) + 75;

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
      const state = this.engine.editorState;
      // Add grid helper
      this.gridHelper = new THREE.GridHelper(state.snapToGrid * 500, 50, 0x8b5cf6, 0x334155);
      this.gridHelper.position.y = 0.05;
      this.scene.add(this.gridHelper);

      // Add visual node markers group
      this.scene.add(this.nodesVisualGroup);
      this.rebuildNodeMarkers();

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
      this.scene.remove(this.gridHelper);
      this.gridHelper = null;
    }
    this.scene.remove(this.nodesVisualGroup);
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
  }

  public reset() {
    this.init();
  }
}
