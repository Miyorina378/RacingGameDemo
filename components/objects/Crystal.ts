import * as THREE from 'three';

export class Crystal {
  public mesh: THREE.Mesh;
  public pos: THREE.Vector3;
  public value: number;
  public active = true;

  constructor(pos: THREE.Vector3, value: number = 50) {
    this.pos = pos.clone();
    this.value = value;
    
    const geom = new THREE.OctahedronGeometry(0.8);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xfacc15, // yellow-400
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.95, // Highly transmissive glass-like
      ior: 2.4, // Diamond-like refractive index
      thickness: 0.5,
      transparent: true,
      opacity: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03
    });

    mat.onBeforeCompile = (shader) => {
      mat.userData.shader = shader;
      shader.uniforms.uTime = { value: 0.0 };
      
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;`
      );
      
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         // Holographic pulse / refraction rainbow effect
         float pulse = sin(uTime * 4.5) * 0.35 + 0.65;
         gl_FragColor.rgb += vec3(0.35, 0.22, 0.0) * pulse;`
      );
    };

    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.copy(this.pos);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  public update(deltaTime: number) {
    if (!this.active) return;
    
    // Floating and rotating effect
    this.mesh.rotation.y += 1.2 * deltaTime;
    this.mesh.rotation.x += 0.4 * deltaTime;
    this.mesh.position.y = this.pos.y + Math.sin(Date.now() * 0.003) * 0.15;

    // Update shader uniforms
    const mat = this.mesh.material as THREE.Material;
    if (mat.userData && mat.userData.shader) {
      mat.userData.shader.uniforms.uTime.value += deltaTime;
    }
  }

  public checkCollection(carPos: THREE.Vector3): boolean {
    if (!this.active) return false;
    const dist = carPos.distanceTo(this.mesh.position);
    if (dist < 2.5) {
      this.active = false;
      return true;
    }
    return false;
  }
}
