const fs = require('fs');
const path = require('path');

const glbPath = path.join(__dirname, 'public', 'models', 'honda_s2000.glb');
const buffer = fs.readFileSync(glbPath);
const chunkLength = buffer.readUInt32LE(12);
const jsonBuffer = buffer.slice(20, 20 + chunkLength);
const gltf = JSON.parse(jsonBuffer.toString('utf8'));

const parents = new Array(gltf.nodes.length).fill(-1);
gltf.nodes.forEach((node, idx) => {
  if (node.children) {
    node.children.forEach(childIdx => {
      parents[childIdx] = idx;
    });
  }
});

const posRegex = /\b(front|rear|back|left|right|fl|fr|rl|rr|lf|rf|lr|rr)\b|[_ -](l|r|f|b)(?:\b|[_ -]|\d)/i;

function isActualWheelNode(name) {
  const lower = name.toLowerCase();
  // Must contain wheel, tire, or rim
  if (!lower.includes('wheel') && !lower.includes('tire') && !lower.includes('rim')) {
    return false;
  }
  return posRegex.test(name);
}

const candidates = [];
gltf.nodes.forEach((node, idx) => {
  const name = node.name || '';
  if (isActualWheelNode(name)) {
    candidates.push(idx);
  }
});

// Filter to keep only the highest candidate (no ancestor is a candidate)
const wheels = candidates.filter(idx => {
  let curr = parents[idx];
  while (curr !== -1) {
    if (candidates.includes(curr)) {
      return false;
    }
    curr = parents[curr];
  }
  return true;
});

console.log("Filtered actual wheels (highest candidates):");
console.log("Wheels count:", wheels.length);
wheels.forEach(idx => {
  console.log(`- "${gltf.nodes[idx].name}" [index ${idx}]`);
});
