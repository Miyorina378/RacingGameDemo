/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Headless check for editor clicks. Run with:  npx tsx scripts/editor-input-check.ts
 *
 * Drives PreviewMode's real mouse handler with synthetic events, so "I clicked and
 * nothing happened" is a question the code can answer instead of a guess. Covers the
 * track-node tool, the blocked-spur tool, and the grass brush.
 *
 * Dev tool only, not shipped and not imported by the app.
 */
import * as THREE from 'three';
import { PreviewMode } from '../components/modes/PreviewMode';
import { Vehicle } from '../components/objects/Vehicle';
import { TRACKS_DATABASE, TrackConfig } from '../components/config/TrackDatabase';
import {
  createDefaultEditorState,
  removeEditorSpurAt,
  remapEditorSpursForInsertedNode,
  remapEditorSpursForRemovedNode,
  setEditorSpurRacedInLayout
} from '../components/engine/types';
import type { EditorScenery, EditorSpur } from '../components/engine/types';

(Vehicle.prototype as any).buildGltfMesh = function () {
  (this as any).buildProceduralMesh();
};

// Browser bits PreviewMode and createScenery reach for.
const listeners: Record<string, ((e: any) => void)[]> = {};
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: (type: string, fn: (e: any) => void) => {
      listeners[type] = [...(listeners[type] ?? []), fn];
    },
    removeEventListener: () => {}
  };
}
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: '', fillRect: () => {} })
    })
  };
}

const VIEW = { width: 800, height: 600 };

const camera = new THREE.PerspectiveCamera(65, VIEW.width / VIEW.height, 0.1, 4000);
const scene = new THREE.Scene();
const environmentGroup = new THREE.Group();
scene.add(environmentGroup);

const editorState = createDefaultEditorState();
editorState.activeMode = 'editor';
editorState.editLayer = 'track';

const engine: any = {
  camera,
  scene,
  editorState,
  renderer: {
    domElement: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: VIEW.width, height: VIEW.height })
    }
  },
  postProcessing: null,
  sky: null
};

// Wire the callbacks the editor UI normally provides, straight into editorState so
// the next click sees the previous one, exactly like the React round trip does.
editorState.onUpdateNodes = (nodes) => {
  editorState.nodes = nodes;
};
editorState.onUpdateScenery = (scenery) => {
  editorState.scenery = scenery;
};
editorState.onUpdateSpurs = (spurs) => {
  editorState.spurs = spurs;
};
editorState.onSelectSpurPoint = (selection) => {
  editorState.selectedSpurPoint = selection;
  if (selection) editorState.activeSpurIndex = selection.spur;
};
editorState.onSelectNode = (idx) => {
  editorState.selectedNodeIndex = idx;
};
editorState.onSelectScenery = (idx) => {
  editorState.selectedSceneryIndex = idx;
};

const vehicleStub: any = { mesh: new THREE.Object3D(), pos: new THREE.Vector3() };

const mode = new PreviewMode(
  engine,
  scene,
  vehicleStub,
  { clear: () => {}, update: () => {} } as any,
  environmentGroup,
  {},
  'sprint_circuit'
);
mode.init();

/** Look straight down from above, so screen centre is the world origin. */
const lookDown = (height = 260) => {
  camera.position.set(0, height, 0);
  camera.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
};
lookDown();

/** Where a ground point lands on screen, so a click can be aimed at it. */
const toScreen = (x: number, z: number) => {
  const projected = new THREE.Vector3(x, 0, z).project(camera);
  return {
    clientX: ((projected.x + 1) / 2) * VIEW.width,
    clientY: ((1 - projected.y) / 2) * VIEW.height
  };
};

const mouseEvent = (x: number, z: number, extra: Record<string, unknown> = {}) => ({
  button: 0,
  shiftKey: false,
  ...toScreen(x, z),
  target: { closest: () => null, tagName: 'CANVAS' },
  preventDefault: () => {},
  ...extra
});

const clickGround = (x: number, z: number) => {
  (mode as any).onMouseDown(mouseEvent(x, z));
  (mode as any).onMouseUp();
};

let failed = false;
const fail = (message: string) => {
  failed = true;
  console.log(`FAIL: ${message}`);
};

// --- attachment topology helpers ---
const linkedSpurs: EditorSpur[] = [
  { nodeIndex: 1, endNodeIndex: 4, nodes: [{ x: 0, z: 0 }] },
  { nodes: [{ x: 10, z: 0 }] },
  { startSpurIndex: 0, endSpurIndex: 1, blocked: false, nodes: [{ x: 20, z: 0 }] }
];
const withoutMiddleSpur = removeEditorSpurAt(linkedSpurs, 1);
if (
  withoutMiddleSpur.length !== 2 ||
  withoutMiddleSpur[1].startSpurIndex !== 0 ||
  withoutMiddleSpur[1].endSpurIndex !== undefined ||
  withoutMiddleSpur[1].blocked !== true
) {
  fail('deleting a spur retargeted or left a stale branch-to-branch attachment');
}
const afterNodeInsert = remapEditorSpursForInsertedNode(withoutMiddleSpur, 2);
if (afterNodeInsert[0].nodeIndex !== 1 || afterNodeInsert[0].endNodeIndex !== 5) {
  fail('inserting a track node did not preserve spur node attachments');
}
const afterNodeRemove = remapEditorSpursForRemovedNode(afterNodeInsert, 1);
if (afterNodeRemove[0].nodeIndex !== undefined || afterNodeRemove[0].endNodeIndex !== 4) {
  fail('deleting a track node retargeted a spur instead of clearing/shifting its references');
}
const afterRacedEndpointRemove = remapEditorSpursForRemovedNode(
  [
    {
      nodeIndex: 1,
      endNodeIndex: 4,
      nodes: [{ x: 0, z: 0 }],
      raceLayouts: ['short']
    }
  ],
  4
);
if (afterRacedEndpointRemove[0].raceLayouts !== undefined) {
  fail('deleting a raced spur endpoint left a course assignment that cannot resolve');
}
const oneRacedSpur = setEditorSpurRacedInLayout(
  [
    { nodes: [{ x: 0, z: 0 }], raceLayouts: ['short'] },
    { nodes: [{ x: 1, z: 0 }] }
  ],
  1,
  'short',
  true
);
if (
  oneRacedSpur[0].raceLayouts?.includes('short') ||
  !oneRacedSpur[1].raceLayouts?.includes('short')
) {
  fail('one layout can still assign more than one raced spur');
}

// --- track node tool ---
editorState.tool = 'node';
const nodesBefore = editorState.nodes.length;
clickGround(-260, -40);
clickGround(-260, 60);
console.log(`node tool: ${nodesBefore} -> ${editorState.nodes.length} nodes after two clicks`);
if (editorState.nodes.length !== nodesBefore + 2) fail('the node tool did not place nodes');

// --- blocked spur tool ---
editorState.tool = 'spur';
clickGround(-300, -120);
clickGround(-340, -180);
clickGround(-380, -240);
const spurs: EditorSpur[] = editorState.spurs;
console.log(
  `spur tool: ${spurs.length} spur(s), points ${spurs.map((s) => s.nodes.length).join('/')}, ` +
    `anchored to node ${spurs[0]?.nodeIndex}, active ${editorState.activeSpurIndex}`
);
if (spurs.length !== 1) fail('three clicks with the spur tool should build exactly one spur');
if ((spurs[0]?.nodes.length ?? 0) !== 3) fail('the spur tool did not append a point per click');
if (editorState.activeSpurIndex !== 0) fail('the first spur should become the active one');
// These are the fields the side panel writes. Keeping them on the real clicked
// object proves later handle edits and the editor-to-runtime conversion do not drop
// the new spur options.
Object.assign(spurs[0], {
  width: 16,
  leftCurb: true,
  rightCurb: false,
  leftGrassWidth: 5,
  rightGrassWidth: 0,
  leftFence: true,
  rightFence: false,
  elevationMode: 'authored' as const
});
spurs[0].nodes = spurs[0].nodes.map((point, index) => ({ ...point, y: 3 + index }));
// A branch has to hang off the circuit, and off the node nearest where it started.
if (spurs[0]?.nodeIndex === undefined) fail('the spur was not attached to a track node');
const anchorNode = editorState.nodes[spurs[0].nodeIndex ?? -1];
if (!anchorNode) fail('the spur points at a node that does not exist');
else {
  const otherNode = editorState.nodes.find((n) => n !== anchorNode);
  const anchorDist = Math.hypot(anchorNode.x - -300, anchorNode.z - -120);
  const otherDist = otherNode ? Math.hypot(otherNode.x - -300, otherNode.z - -120) : Infinity;
  console.log(
    `anchor is ${anchorDist.toFixed(0)}m from the first click, the other node is ${otherDist.toFixed(0)}m`
  );
  if (anchorDist > otherDist) fail('the spur attached to a further node than the nearest one');
}

// One frame of the render loop is what builds the handles, so run it before the
// drag test, then restore the view it overwrites. The matrix update is what the
// renderer normally does every frame; without it every handle raycasts at the origin.
(mode as any).update(0.016);
lookDown();
scene.updateMatrixWorld(true);

// Points must land where the cursor was, not snapped away to the origin.
const first = spurs[0].nodes[0];
if (Math.hypot(first.x - -300, first.z - -120) > 12) {
  fail(`the first spur point landed at ${first.x.toFixed(0)},${first.z.toFixed(0)} instead of -300,-120`);
}

// Dragging a spur handle should move that point and nothing else.
(mode as any).onMouseDown(mouseEvent(-300, -120));
(mode as any).onMouseMove(mouseEvent(-280, -100));
(mode as any).onMouseUp();
const dragged = editorState.spurs[0].nodes[0];
console.log(`after dragging the mouth handle: ${dragged.x.toFixed(0)},${dragged.z.toFixed(0)}`);
if (Math.hypot(dragged.x - -280, dragged.z - -100) > 12) fail('dragging a spur handle did not move it');
if (dragged.y !== 3) fail('dragging a spur handle lost its authored elevation');
if (
  editorState.spurs[0].leftCurb !== true ||
  editorState.spurs[0].rightCurb !== false ||
  editorState.spurs[0].leftGrassWidth !== 5 ||
  editorState.spurs[0].rightGrassWidth !== 0 ||
  editorState.spurs[0].leftFence !== true ||
  editorState.spurs[0].rightFence !== false ||
  editorState.spurs[0].elevationMode !== 'authored'
) {
  fail('dragging a spur handle lost its side or elevation settings');
}
if (editorState.spurs[0].nodes.length !== 3) fail('dragging a spur handle changed the point count');

// A second spur starts only when asked for.
editorState.activeSpurIndex = null;
clickGround(300, 200);
console.log(`after clearing the active spur: ${editorState.spurs.length} spurs`);
if (editorState.spurs.length !== 2) fail('clearing the active spur should start a new one');

// --- grass brush ---
editorState.editLayer = 'terrain';
editorState.terrainBrush = 'grass';
editorState.terrainBrushRadius = 30;
(mode as any).onMouseDown(mouseEvent(120, 300));
(mode as any).onMouseMove(mouseEvent(190, 300));
(mode as any).onMouseMove(mouseEvent(260, 300));
(mode as any).onMouseUp();
const painted = (editorState.scenery as EditorScenery[]).filter((s) => s.type === 'grass_patch');
console.log(`grass brush: painted ${painted.length} patches across a 140m drag`);
if (painted.length < 2) fail('the grass brush painted almost nothing along a drag');

// --- the whole chain: clicked points become built meshes ---
// This is the part the user actually sees, so it is worth proving end to end rather
// than trusting that the state update alone means something appeared on screen.
const customTrack: TrackConfig = {
  id: 'custom',
  name: 'Input Check',
  description: '',
  timeLimit: 60,
  roadWidth: 18,
  hasObstacles: false,
  requiresLicense: false,
  baseReward: 0,
  path: editorState.nodes.length >= 3
    ? editorState.nodes.map((n) => ({ pos: new THREE.Vector3(n.x, n.y ?? 0, n.z) }))
    : (TRACKS_DATABASE.find((t) => t.id === 'sprint_circuit') as TrackConfig).path,
  spurs: editorState.spurs
    .filter((spur) => spur.nodes.length >= 1)
    .map((spur) => ({
      nodeIndex: spur.nodeIndex,
      endNodeIndex: spur.endNodeIndex,
      startSpurIndex: spur.startSpurIndex,
      endSpurIndex: spur.endSpurIndex,
      raceLayouts: spur.raceLayouts,
      path: spur.nodes.map((p) => new THREE.Vector3(p.x, p.y ?? 0, p.z)),
      width: spur.width,
      leftCurb: spur.leftCurb,
      rightCurb: spur.rightCurb,
      leftFence: spur.leftFence,
      rightFence: spur.rightFence,
      leftGrassWidth: spur.leftGrassWidth,
      rightGrassWidth: spur.rightGrassWidth,
      elevationMode: spur.elevationMode,
      blocked: spur.blocked
    })),
  scenery: editorState.scenery.map((s) => ({
    type: s.type,
    position: new THREE.Vector3(s.x, s.y ?? 0, s.z),
    scale: s.scale
  })),
  HaveCrub: true,
  HaveFence: false,
  HaveGrass: false,
  GrassWidth: 0
};

const convertedSpur = customTrack.spurs?.[0];
if (
  !convertedSpur ||
  convertedSpur.leftCurb !== true ||
  convertedSpur.rightCurb !== false ||
  convertedSpur.leftGrassWidth !== 5 ||
  convertedSpur.rightGrassWidth !== 0 ||
  convertedSpur.leftFence !== true ||
  convertedSpur.rightFence !== false ||
  convertedSpur.elevationMode !== 'authored' ||
  convertedSpur.path[0]?.y !== 3
) {
  fail('spur side options or authored height did not survive editor-to-runtime conversion');
}

const existing = TRACKS_DATABASE.findIndex((t) => t.id === 'custom');
if (existing === -1) TRACKS_DATABASE.push(customTrack);
else TRACKS_DATABASE[existing] = customTrack;

const rebuiltGroup = new THREE.Group();
const rebuiltEngine: any = { ...engine, editorState };
const rebuilt = new PreviewMode(
  rebuiltEngine,
  new THREE.Scene(),
  vehicleStub,
  { clear: () => {}, update: () => {} } as any,
  rebuiltGroup,
  {},
  'custom'
);
rebuilt.init();

const spurObjects = rebuiltGroup.children.filter((c) => c.userData?.isSpur);
const grassObjects = rebuiltGroup.children.filter((c) => c.userData?.isGrassPatch);
console.log(
  `rebuild from clicked data: ${customTrack.spurs?.length ?? 0} spur(s) in config -> ` +
    `${spurObjects.length} spur objects, ${grassObjects.length} grass patches`
);
if ((customTrack.spurs?.length ?? 0) === 0) fail('clicked spurs never reached the track config');
if (spurObjects.length < 3) fail('a spur in the config produced no ribbon or barriers');
if (grassObjects.length !== painted.length) fail('painted grass did not survive the rebuild');

console.log(
  failed
    ? 'FAIL: editor clicks are not landing where they should.'
    : 'PASS: node, spur and grass tools all respond, and what was clicked gets built.'
);
process.exit(failed ? 1 : 0);
