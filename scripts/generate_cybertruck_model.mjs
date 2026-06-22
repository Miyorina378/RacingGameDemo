import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class NodeFileReader {
  result = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      queueMicrotask(() => this.onloadend?.());
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      queueMicrotask(() => this.onloadend?.());
    });
  }
}

globalThis.FileReader = NodeFileReader;

const scene = new THREE.Scene();
scene.name = 'tesla_cybertruck_premium_awd';

const stainless = new THREE.MeshStandardMaterial({
  name: 'car_paint_stainless',
  color: 0xa9adb0,
  roughness: 0.28,
  metalness: 0.92
});
const darkMetal = new THREE.MeshStandardMaterial({
  name: 'chassis_dark_metal',
  color: 0x202326,
  roughness: 0.5,
  metalness: 0.7
});
const blackPlastic = new THREE.MeshStandardMaterial({
  name: 'exterior_black_trim',
  color: 0x111315,
  roughness: 0.72,
  metalness: 0.15
});
const glass = new THREE.MeshStandardMaterial({
  name: 'windshield_glass',
  color: 0x18242c,
  roughness: 0.08,
  metalness: 0.05,
  transparent: true,
  opacity: 0.62
});
const tireMaterial = new THREE.MeshStandardMaterial({
  name: 'tire_rubber',
  color: 0x101112,
  roughness: 0.92,
  metalness: 0.02
});
const rimMaterial = new THREE.MeshStandardMaterial({
  name: 'rim_dark_alloy',
  color: 0x303438,
  roughness: 0.3,
  metalness: 0.9
});
const lightMaterial = new THREE.MeshStandardMaterial({
  name: 'headlight',
  color: 0xe8f2ff,
  emissive: 0xe8f2ff,
  emissiveIntensity: 3
});
const tailMaterial = new THREE.MeshStandardMaterial({
  name: 'taillight_brake_light',
  color: 0x660000,
  emissive: 0x330000,
  emissiveIntensity: 1.5
});
const caliperMaterial = new THREE.MeshStandardMaterial({
  name: 'caliper_red',
  color: 0x8b1010,
  roughness: 0.4,
  metalness: 0.65
});

function addBox(name, size, position, material, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    material
  );
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  scene.add(mesh);
  return mesh;
}

function createExtrudedProfile(name, width, profile, material) {
  const halfWidth = width * 0.5;
  const vertices = [];
  for (const x of [-halfWidth, halfWidth]) {
    for (const [z, y] of profile) vertices.push(x, y, z);
  }

  const count = profile.length;
  const indices = [];
  for (let i = 1; i < count - 1; i++) {
    indices.push(0, i + 1, i);
    indices.push(count, count + i, count + i + 1);
  }
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    indices.push(i, next, count + next);
    indices.push(i, count + next, count + i);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  scene.add(mesh);
  return mesh;
}

// Real exterior envelope: 5.683 m long, 2.032 m body width, 1.794 m tall.
createExtrudedProfile(
  'cybertruck_body_exterior',
  2.032,
  [
    [2.8415, 0.55],
    [2.8415, 0.92],
    [1.65, 1.08],
    [0.42, 1.79],
    [-0.72, 1.73],
    [-1.42, 1.20],
    [-2.8415, 1.02],
    [-2.8415, 0.55]
  ],
  stainless
);

addBox('battery_pack_dark', [1.86, 0.22, 4.35], [0, 0.43, 0], darkMetal);
addBox('front_bumper_black', [2.05, 0.28, 0.20], [0, 0.62, 2.78], blackPlastic);
addBox('rear_bumper_black', [2.05, 0.26, 0.20], [0, 0.61, -2.78], blackPlastic);
addBox('bed_tonneau_exterior', [1.92, 0.07, 1.55], [0, 1.16, -1.73], stainless, [-0.10, 0, 0]);
addBox('front_light_bar_headlight', [1.84, 0.055, 0.045], [0, 1.00, 2.75], lightMaterial);
addBox('rear_light_bar_taillight', [1.88, 0.06, 0.045], [0, 1.00, -2.75], tailMaterial);

// Glass panels are slightly proud of body to avoid z-fighting.
addBox('windshield_glass', [1.88, 0.025, 1.43], [0, 1.43, 1.02], glass, [-0.52, 0, 0]);
addBox('roof_glass', [1.82, 0.025, 1.05], [0, 1.765, -0.12], glass, [0.04, 0, 0]);

for (const side of [-1, 1]) {
  const x = side * 1.022;
  addBox(
    side < 0 ? 'glass_side_left_front' : 'glass_side_right_front',
    [0.025, 0.56, 0.92],
    [x, 1.40, 0.55],
    glass,
    [0, side * 0.03, -0.08]
  );
  addBox(
    side < 0 ? 'glass_side_left_rear' : 'glass_side_right_rear',
    [0.025, 0.50, 0.75],
    [x, 1.40, -0.46],
    glass,
    [0, side * 0.03, 0.02]
  );
  addBox(
    side < 0 ? 'trim_fender_left_front' : 'trim_fender_right_front',
    [0.10, 0.42, 1.08],
    [side * 1.01, 0.66, 1.80],
    blackPlastic
  );
  addBox(
    side < 0 ? 'trim_fender_left_rear' : 'trim_fender_right_rear',
    [0.10, 0.42, 1.08],
    [side * 1.01, 0.66, -1.80],
    blackPlastic
  );
}

const wheelRadius = 0.43925; // 285/65R20
const wheelWidth = 0.285;
const trackHalf = 1.772 * 0.5;
const axleHalf = 3.635 * 0.5;

function addWheel(name, x, z) {
  const wheel = new THREE.Group();
  wheel.name = name;
  wheel.position.set(x, wheelRadius, z);

  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 32),
    tireMaterial
  );
  tire.name = `${name}_tire`;
  tire.rotation.z = Math.PI * 0.5;
  wheel.add(tire);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.254, 0.254, wheelWidth * 1.02, 16),
    rimMaterial
  );
  rim.name = `${name}_rim`;
  rim.rotation.z = Math.PI * 0.5;
  wheel.add(rim);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, wheelWidth * 1.08, 12),
    darkMetal
  );
  hub.name = `${name}_hub`;
  hub.rotation.z = Math.PI * 0.5;
  wheel.add(hub);

  scene.add(wheel);

  const caliper = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.16, 0.08),
    caliperMaterial
  );
  caliper.name = name.replace('wheel', 'caliper');
  caliper.position.set(x + Math.sign(x) * 0.01, wheelRadius, z - 0.06);
  scene.add(caliper);
}

addWheel('wheel_front_left', -trackHalf, axleHalf);
addWheel('wheel_front_right', trackHalf, axleHalf);
addWheel('wheel_rear_left', -trackHalf, -axleHalf);
addWheel('wheel_rear_right', trackHalf, -axleHalf);

scene.traverse((node) => {
  if (node instanceof THREE.Mesh) {
    node.castShadow = true;
    node.receiveShadow = true;
  }
});

const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(scene, {
  binary: true,
  trs: true,
  onlyVisible: true
});

const outputPath = path.resolve('public/models/tesla_cybertruck_awd.glb');
await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
console.log(`Wrote ${outputPath} (${arrayBuffer.byteLength} bytes)`);
