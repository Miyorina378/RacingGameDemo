import * as THREE from 'three';

export class Checkpoint {
  public mesh: THREE.Mesh;
  public pos: THREE.Vector3;
  public index: number;
  public passed = false;
  private arrow: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private isRace: boolean;
  private radius: number;

  public collectionRadius = 5.0;

  constructor(
    pos: THREE.Vector3,
    index: number,
    nextPos: THREE.Vector3,
    isActive: boolean = false,
    isRace: boolean = false,
    customRadius?: number
  ) {
    this.pos = pos.clone();
    this.index = index;
    this.isRace = isRace;

    const heading = Math.atan2(nextPos.x - pos.x, nextPos.z - pos.z);
    const radius = customRadius !== undefined ? customRadius : (isRace ? 4.0 : 3.5);
    this.radius = radius;
    const tube = customRadius !== undefined ? (customRadius * 0.08) : (isRace ? 0.3 : 0.25);
    this.collectionRadius = customRadius !== undefined ? (customRadius * 1.2) : 5.0;

    const torusGeom = new THREE.TorusGeometry(radius, tube, 12, 32);
    
    const activeColor = isRace ? 0x00ff00 : 0x00ffff;
    const inactiveColor = isRace ? 0xff0055 : 0xff00ff;
    const color = isActive ? activeColor : inactiveColor;
    
    this.material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: isActive ? 2.5 : 0.6,
      transparent: true,
      opacity: isActive ? 0.95 : 0.4,
      roughness: 0.1,
      metalness: 0.8
    });

    this.material.onBeforeCompile = (shader) => {
      this.material.userData.shader = shader;
      shader.uniforms.uTime = { value: 0.0 };
      
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
         // Animated scrolling holographic bands along the torus ring
         float angle = atan(vLocalPos.y, vLocalPos.x);
         float band = sin(angle * 8.0 - uTime * 4.5) * 0.5 + 0.5;
         
         // Bright neon banding overlay
         gl_FragColor.rgb += gl_FragColor.rgb * band * 0.8;`
      );
    };

    this.mesh = new THREE.Mesh(torusGeom, this.material);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Floating arrow
    const coneHeight = isRace ? 2.0 : 1.8;
    const coneRadius = isRace ? 0.9 : 0.8;
    const coneGeom = new THREE.ConeGeometry(coneRadius, coneHeight, 4);
    coneGeom.rotateX(Math.PI);
    
    const coneMat = new THREE.MeshStandardMaterial({ 
      color: color,
      emissive: color,
      emissiveIntensity: isActive ? 2.5 : 0.6,
      transparent: true,
      opacity: isActive ? 0.95 : 0.4,
      roughness: 0.1
    });

    coneMat.onBeforeCompile = (shader) => {
      coneMat.userData.shader = shader;
      shader.uniforms.uTime = { value: 0.0 };
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float pulse = sin(uTime * 5.0) * 0.18 + 0.82;
         gl_FragColor.rgb *= pulse;`
      );
    };

    this.arrow = new THREE.Mesh(coneGeom, coneMat);
    this.arrow.position.set(0, isRace ? (radius * 1.25) : 4.5, 0);
    this.arrow.castShadow = true;
    this.arrow.receiveShadow = true;
    this.mesh.add(this.arrow);
  }

  public update(deltaTime: number) {
    if (this.passed) return;

    // Hover / float animation on the floating arrow
    const time = Date.now() * 0.003;
    const baseHeight = this.isRace ? (this.radius * 1.25) : 4.5;
    this.arrow.position.y = baseHeight + Math.sin(time * 1.2) * 0.16;
    
    // Rotate arrow slowly
    this.arrow.rotation.y += 1.0 * deltaTime;

    // Update shader uniforms
    if (this.material.userData && this.material.userData.shader) {
      this.material.userData.shader.uniforms.uTime.value += deltaTime;
    }
    const arrowMat = this.arrow.material as THREE.Material;
    if (arrowMat.userData && arrowMat.userData.shader) {
      arrowMat.userData.shader.uniforms.uTime.value += deltaTime;
    }
  }

  public activate() {
    this.mesh.visible = true;
    const activeColor = this.isRace ? 0x00ff00 : 0x00ffff;
    this.material.color.setHex(activeColor);
    if (this.material.emissive) {
      this.material.emissive.setHex(activeColor);
      this.material.emissiveIntensity = 2.5;
    }
    this.material.opacity = 0.95;

    const arrowMat = this.arrow.material as THREE.MeshStandardMaterial;
    arrowMat.color.setHex(activeColor);
    if (arrowMat.emissive) {
      arrowMat.emissive.setHex(activeColor);
      arrowMat.emissiveIntensity = 2.5;
    }
    arrowMat.opacity = 0.95;
    this.arrow.visible = true;
  }

  public deactivate() {
    this.passed = false;
    const inactiveColor = this.isRace ? 0xff0055 : 0xff00ff;
    this.material.color.setHex(inactiveColor);
    if (this.material.emissive) {
      this.material.emissive.setHex(inactiveColor);
      this.material.emissiveIntensity = 0.6;
    }
    this.material.opacity = 0.4;
    this.arrow.visible = true;

    const arrowMat = this.arrow.material as THREE.MeshStandardMaterial;
    arrowMat.color.setHex(inactiveColor);
    if (arrowMat.emissive) {
      arrowMat.emissive.setHex(inactiveColor);
      arrowMat.emissiveIntensity = 0.6;
    }
    arrowMat.opacity = 0.4;
  }

  public markPassed() {
    this.passed = true;
    const passedColor = 0x00ff00;
    this.material.color.setHex(passedColor);
    if (this.material.emissive) {
      this.material.emissive.setHex(passedColor);
      this.material.emissiveIntensity = 0.2;
    }
    this.material.opacity = 0.1;

    const arrowMat = this.arrow.material as THREE.MeshStandardMaterial;
    arrowMat.color.setHex(passedColor);
    if (arrowMat.emissive) {
      arrowMat.emissive.setHex(passedColor);
      arrowMat.emissiveIntensity = 0.2;
    }
    this.arrow.visible = false;
  }

  public checkCollection(carPos: THREE.Vector3): boolean {
    if (this.passed) return false;
    const dist = carPos.distanceTo(this.mesh.position);
    if (dist < this.collectionRadius) {
      this.markPassed();
      return true;
    }
    return false;
  }
}
