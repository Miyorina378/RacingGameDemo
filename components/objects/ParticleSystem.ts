import * as THREE from 'three';

interface ParticleState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
  scale: number;
  startScale: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private smokeParticles: ParticleState[] = [];
  private sparkParticles: ParticleState[] = [];
  private boosterParticles: ParticleState[] = [];

  // Instanced Meshes
  private smokeMesh!: THREE.InstancedMesh;
  private sparkMesh!: THREE.InstancedMesh;
  private boosterMesh!: THREE.InstancedMesh;

  private readonly maxSmoke = 1500;
  private readonly maxSparks = 1500;
  private readonly maxBoosters = 1000;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initParticleMeshes();
  }

  private initParticleMeshes() {
    // 1. Smoke Setup (Low-poly spheres)
    const smokeGeom = new THREE.DodecahedronGeometry(0.35, 0); // lightweight sphere shape
    const smokeOpacityArray = new Float32Array(this.maxSmoke);
    const smokeOpacityAttr = new THREE.InstancedBufferAttribute(smokeOpacityArray, 1);
    smokeGeom.setAttribute('aOpacity', smokeOpacityAttr);

    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8, // slate-400
      transparent: true,
      depthWrite: false, // Prevents bounding box overlap artifacting
    });
    this.injectOpacityShader(smokeMat);

    this.smokeMesh = new THREE.InstancedMesh(smokeGeom, smokeMat, this.maxSmoke);
    this.smokeMesh.receiveShadow = false;
    this.smokeMesh.castShadow = false;
    this.scene.add(this.smokeMesh);

    // 2. Spark Setup (Small cubes)
    const sparkGeom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const sparkOpacityArray = new Float32Array(this.maxSparks);
    const sparkOpacityAttr = new THREE.InstancedBufferAttribute(sparkOpacityArray, 1);
    sparkGeom.setAttribute('aOpacity', sparkOpacityAttr);

    const sparkMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending // Glow additive blending for sparks
    });
    this.injectOpacityShader(sparkMat);

    this.sparkMesh = new THREE.InstancedMesh(sparkGeom, sparkMat, this.maxSparks);
    this.sparkMesh.receiveShadow = false;
    this.sparkMesh.castShadow = false;
    this.scene.add(this.sparkMesh);

    // 3. Booster Flame Setup (Small rectangular prisms)
    const boosterGeom = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const boosterOpacityArray = new Float32Array(this.maxBoosters);
    const boosterOpacityAttr = new THREE.InstancedBufferAttribute(boosterOpacityArray, 1);
    boosterGeom.setAttribute('aOpacity', boosterOpacityAttr);

    const boosterMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.injectOpacityShader(boosterMat);

    this.boosterMesh = new THREE.InstancedMesh(boosterGeom, boosterMat, this.maxBoosters);
    this.boosterMesh.receiveShadow = false;
    this.boosterMesh.castShadow = false;
    this.scene.add(this.boosterMesh);

    // Initialize all scales to 0 and position far away to hide them
    this.clear();
  }

  private injectOpacityShader(material: THREE.MeshBasicMaterial) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         attribute float aOpacity;
         varying float vOpacity;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vOpacity = aOpacity;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying float vOpacity;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity * vOpacity );`
      );
    };
  }

  public emitSmoke(carWorldMatrix: THREE.Matrix4) {
    const rearLeftPos = new THREE.Vector3(-1.25, 0.2, -1.6).applyMatrix4(carWorldMatrix);
    const rearRightPos = new THREE.Vector3(1.25, 0.2, -1.6).applyMatrix4(carWorldMatrix);

    [rearLeftPos, rearRightPos].forEach(pos => {
      if (this.smokeParticles.length >= this.maxSmoke) {
        this.smokeParticles.shift(); // Evict oldest
      }
      this.smokeParticles.push({
        position: pos.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          1.0 + Math.random() * 2.0,
          (Math.random() - 0.5) * 1.5
        ),
        color: new THREE.Color(0x94a3b8),
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4,
        scale: 0.8 + Math.random() * 0.4,
        startScale: 0.35 // Initial opacity multiplier
      });
    });
  }

  public emitSparks(count: number, startPos: THREE.Vector3, colorHex: number = 0xffaa00) {
    const pos = startPos.clone();
    pos.y += 0.2; // slight elevation to avoid ground z-fighting

    const sparkColor = new THREE.Color(colorHex);

    for (let i = 0; i < count; i++) {
      if (this.sparkParticles.length >= this.maxSparks) {
        this.sparkParticles.shift();
      }
      this.sparkParticles.push({
        position: pos.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 10.0,
          2.0 + Math.random() * 8.0,
          (Math.random() - 0.5) * 10.0
        ),
        color: sparkColor,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.4,
        scale: 0.6 + Math.random() * 0.6,
        startScale: 0.95
      });
    }
  }

  public emitBoosters(carWorldMatrix: THREE.Matrix4, carYaw: number, speed: number, boosterColorHex?: number) {
    const fireColors = [0xff4500, 0xff8c00];
    const color = boosterColorHex !== undefined ? boosterColorHex : fireColors[Math.floor(Math.random() * 2)];
    
    const boosterColor = new THREE.Color(color);
    const boosterPos = new THREE.Vector3(0, 0.35, -2.55).applyMatrix4(carWorldMatrix);

    // Scale engine blast length with speed
    const backVector = new THREE.Vector3(0, 0, -1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), carYaw)
      .multiplyScalar(8 + Math.abs(speed) * 1.44);

    if (this.boosterParticles.length >= this.maxBoosters) {
      this.boosterParticles.shift();
    }
    this.boosterParticles.push({
      position: boosterPos.clone(),
      velocity: new THREE.Vector3(
        backVector.x + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 1.5,
        backVector.z + (Math.random() - 0.5) * 2
      ),
      color: boosterColor,
      life: 0,
      maxLife: 0.12 + Math.random() * 0.1,
      scale: 1.0,
      startScale: 0.9
    });
  }

  public update(deltaTime: number) {
    // 1. Update Smoke
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += deltaTime;
      if (p.life >= p.maxLife) {
        this.smokeParticles.splice(i, 1);
      } else {
        p.position.addScaledVector(p.velocity, deltaTime);
        p.scale *= (1.0 - deltaTime * 0.85); // Expand / shrink
      }
    }

    // 2. Update Sparks
    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i];
      p.life += deltaTime;
      if (p.life >= p.maxLife) {
        this.sparkParticles.splice(i, 1);
      } else {
        p.velocity.y -= 9.8 * deltaTime; // gravity effect
        p.position.addScaledVector(p.velocity, deltaTime);
      }
    }

    // 3. Update Boosters
    for (let i = this.boosterParticles.length - 1; i >= 0; i--) {
      const p = this.boosterParticles[i];
      p.life += deltaTime;
      if (p.life >= p.maxLife) {
        this.boosterParticles.splice(i, 1);
      } else {
        p.position.addScaledVector(p.velocity, deltaTime);
        p.scale *= (1.0 - deltaTime * 1.6);
      }
    }

    // 4. Update GPU buffers
    this.syncInstancedMesh(this.smokeMesh, this.smokeParticles, this.maxSmoke);
    this.syncInstancedMesh(this.sparkMesh, this.sparkParticles, this.maxSparks);
    this.syncInstancedMesh(this.boosterMesh, this.boosterParticles, this.maxBoosters);
  }

  private syncInstancedMesh(mesh: THREE.InstancedMesh, particles: ParticleState[], maxCount: number) {
    const dummy = new THREE.Object3D();
    const opacityAttr = mesh.geometry.getAttribute('aOpacity') as THREE.InstancedBufferAttribute;

    const count = Math.min(particles.length, maxCount);
    mesh.count = count; // WebGL optimization: only draws active instances

    for (let i = 0; i < maxCount; i++) {
      if (i < count) {
        const p = particles[i];
        dummy.position.copy(p.position);
        dummy.scale.set(p.scale, p.scale, p.scale);
        dummy.updateMatrix();

        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, p.color);

        const lifeRatio = p.life / p.maxLife;
        const opacity = p.startScale * (1.0 - lifeRatio);
        opacityAttr.setX(i, opacity);
      } else {
        // Position hidden far away
        dummy.position.set(99999, 99999, 99999);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        opacityAttr.setX(i, 0.0);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    opacityAttr.needsUpdate = true;
  }

  public clear() {
    this.smokeParticles = [];
    this.sparkParticles = [];
    this.boosterParticles = [];
    this.syncInstancedMesh(this.smokeMesh, this.smokeParticles, this.maxSmoke);
    this.syncInstancedMesh(this.sparkMesh, this.sparkParticles, this.maxSparks);
    this.syncInstancedMesh(this.boosterMesh, this.boosterParticles, this.maxBoosters);
  }
}
