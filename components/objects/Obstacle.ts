import * as THREE from 'three';

export class Obstacle {
  public mesh: THREE.Mesh;
  public pos: THREE.Vector3;
  public width: number;
  public depth: number;
  public isBuilding: boolean;

  constructor(pos: THREE.Vector3, isBuilding: boolean = true, buildingHeight?: number) {
    this.pos = pos.clone();
    this.isBuilding = isBuilding;

    if (isBuilding) {
      const height = buildingHeight || (15 + Math.random() * 60);
      this.width = 10;
      this.depth = 10;

      const geometry = new THREE.BoxGeometry(this.width, height, this.depth);
      const neonColors = [0x00ffff, 0xff00ff, 0x8b5cf6, 0x3b82f6]; // cyan, magenta, violet, blue
      const color = neonColors[Math.floor(Math.random() * neonColors.length)];

      const material = new THREE.MeshStandardMaterial({
        color: 0x050510, // Deep dark metallic body
        roughness: 0.4,
        metalness: 0.9,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.15,
      });

      // Inject building window shader and corner glow lines
      material.onBeforeCompile = (shader) => {
        material.userData.shader = shader;
        
        // Self-updating time uniform using a JS getter
        shader.uniforms.uTime = {
          get value() {
            return performance.now() * 0.001;
          }
        };
        shader.uniforms.uNeonColor = { value: new THREE.Color(color) };

        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
           varying vec3 vWorldPosition;`
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform vec3 uNeonColor;
           varying vec3 vWorldPosition;

           // Pseudo-random hash
           float hash3D(vec3 p) {
             return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
           }`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           // 1. Procedural window grids (only on vertical sides)
           vec3 gridSpace = vWorldPosition * vec3(0.4, 0.32, 0.4);
           vec3 cell = floor(gridSpace);
           vec3 cellFract = fract(gridSpace);
           
           // Margin of window slots
           float wX = step(0.18, cellFract.x) * step(cellFract.x, 0.82);
           float wY = step(0.25, cellFract.y) * step(cellFract.y, 0.75);
           float wZ = step(0.18, cellFract.z) * step(cellFract.z, 0.82);

           // Determine if window is active (25% active rate)
           float rand = hash3D(cell);
           float activeWindow = step(0.75, rand);
           
           // Slow flickering pulse for active windows
           float flickerSpeed = 0.5 + rand * 3.5;
           float flicker = sin(uTime * flickerSpeed + rand * 10.0) * 0.12 + 0.88;
           float windowIntensity = activeWindow * flicker;

           // Window shape pattern (vertical columns on X/Z faces)
           float windowPattern = wY * (wX + wZ);
           
           if (windowPattern > 0.01) {
             // Mix window colors between building neon base and warm yellow lights
             vec3 winColor = mix(uNeonColor, vec3(1.0, 0.82, 0.45), rand * 0.5);
             gl_FragColor.rgb += winColor * windowPattern * windowIntensity * 1.6;
           }

           // 2. Neon edge glow lines (replaces LineSegments overlay with a clean shader edge)
           // Calculate distance to nearest corner in world space
           float dx = min(fract(vWorldPosition.x / 10.0), 1.0 - fract(vWorldPosition.x / 10.0)) * 10.0;
           float dz = min(fract(vWorldPosition.z / 10.0), 1.0 - fract(vWorldPosition.z / 10.0)) * 10.0;
           
           // Draw neon lines along the vertical edges of the building
           if (dx < 0.18 && dz < 0.18) {
             float edgePulse = sin(uTime * 2.0 + vWorldPosition.y * 0.05) * 0.2 + 0.8;
             gl_FragColor.rgb = mix(gl_FragColor.rgb, uNeonColor * 2.0, edgePulse);
           }`
        );
      };

      this.mesh = new THREE.Mesh(geometry, material);
      this.mesh.position.set(pos.x, height / 2, pos.z);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;

      // Add a glowing wireframe edge overlay for extra depth
      const wireframe = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
      const wireframeLines = new THREE.LineSegments(wireframe, lineMat);
      this.mesh.add(wireframeLines);
    } else {
      // Cylinder obstacles in high-tier Race (e.g. concrete barrier cones)
      this.width = 2.4;
      this.depth = 2.4;

      const geometry = new THREE.CylinderGeometry(1.2, 1.2, 5, 8);
      const material = new THREE.MeshStandardMaterial({
        color: 0xff0033, // Vibrant crimson
        emissive: 0x440000,
        roughness: 0.15,
        metalness: 0.8
      });

      // Pulsing warning bands on the cone
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = {
          get value() {
            return performance.now() * 0.001;
          }
        };

        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
           varying vec3 vLocalPos;`
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vLocalPos = position;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           varying vec3 vLocalPos;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           // Vertical neon banding
           float band = step(0.1, sin(vLocalPos.y * 3.5 - uTime * 6.0));
           gl_FragColor.rgb += vec3(1.0, 0.0, 0.0) * band * 0.35;`
        );
      };

      this.mesh = new THREE.Mesh(geometry, material);
      this.mesh.position.copy(pos);
      this.mesh.position.y = 2.5;
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;

      // Glowing red rings around it
      const borderGeom = new THREE.BoxGeometry(3, 0.2, 3);
      const borderMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
      const border = new THREE.Mesh(borderGeom, borderMat);
      border.position.y = -2.4;
      this.mesh.add(border);
    }
  }

  public checkCollision(carPos: THREE.Vector3): boolean {
    const dx = Math.abs(carPos.x - this.mesh.position.x);
    const dz = Math.abs(carPos.z - this.mesh.position.z);

    if (this.isBuilding) {
      return dx < (this.width / 2 + 1.2) && dz < (this.depth / 2 + 2.0);
    } else {
      return dx < (1.2 + 1.2) && dz < (1.2 + 2.0);
    }
  }
}
