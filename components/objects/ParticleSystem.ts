import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private smokeParticles: Particle[] = [];
  private sparkParticles: Particle[] = [];
  private boosterParticles: Particle[] = [];

  // Reusable geometry to optimize performance
  private smokeGeom = new THREE.SphereGeometry(0.3, 4, 4);
  private smokeMat = new THREE.MeshBasicMaterial({
    color: 0x94a3b8, // slate-400
    transparent: true,
    opacity: 0.35
  });

  private sparkGeom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  private boosterGeom = new THREE.BoxGeometry(0.15, 0.15, 0.15);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public emitSmoke(carWorldMatrix: THREE.Matrix4) {
    const rearLeftPos = new THREE.Vector3(-1.25, 0.2, -1.6).applyMatrix4(carWorldMatrix);
    const rearRightPos = new THREE.Vector3(1.25, 0.2, -1.6).applyMatrix4(carWorldMatrix);

    [rearLeftPos, rearRightPos].forEach(pos => {
      const mesh = new THREE.Mesh(this.smokeGeom, this.smokeMat.clone());
      mesh.position.copy(pos);
      this.scene.add(mesh);

      this.smokeParticles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          1.0 + Math.random() * 2.0,
          (Math.random() - 0.5) * 1.5
        ),
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4
      });
    });
  }

  public emitSparks(count: number, startPos: THREE.Vector3, colorHex: number = 0xffaa00) {
    const pos = startPos.clone();
    pos.y += 0.2; // ground level sparks
    
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95
    });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sparkGeom, mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      this.sparkParticles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 10.0,
          2.0 + Math.random() * 8.0,
          (Math.random() - 0.5) * 10.0
        ),
        life: 0,
        maxLife: 0.3 + Math.random() * 0.4
      });
    }
  }

  public emitBoosters(carWorldMatrix: THREE.Matrix4, carYaw: number, speed: number, boosterColorHex?: number) {
    const fireColors = [0xff4500, 0xff8c00]; // orange, gold
    const color = boosterColorHex !== undefined ? boosterColorHex : fireColors[Math.floor(Math.random() * 2)];
    
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9
    });

    const boosterPos = new THREE.Vector3(0, 0.35, -2.55).applyMatrix4(carWorldMatrix);
    const mesh = new THREE.Mesh(this.boosterGeom, mat);
    mesh.position.copy(boosterPos);
    this.scene.add(mesh);

    // Blast backwards relative to car orientation
    const backVector = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), carYaw).multiplyScalar(8 + Math.abs(speed) * 0.4);
    
    this.boosterParticles.push({
      mesh,
      velocity: new THREE.Vector3(
        backVector.x + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 1.5,
        backVector.z + (Math.random() - 0.5) * 2
      ),
      life: 0,
      maxLife: 0.12 + Math.random() * 0.1
    });
  }

  public update(deltaTime: number) {
    // 1. Smoke particles update
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += deltaTime;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.smokeParticles.splice(i, 1);
      } else {
        p.mesh.position.addScaledVector(p.velocity, deltaTime);
        p.mesh.scale.multiplyScalar(1 - deltaTime * 0.8);
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.35 * (1 - p.life / p.maxLife);
      }
    }

    // 2. Spark particles update
    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i];
      p.life += deltaTime;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.sparkParticles.splice(i, 1);
      } else {
        p.velocity.y -= 9.8 * deltaTime;
        p.mesh.position.addScaledVector(p.velocity, deltaTime);
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 1 - p.life / p.maxLife;
      }
    }

    // 3. Exhaust particles update
    for (let i = this.boosterParticles.length - 1; i >= 0; i--) {
      const p = this.boosterParticles[i];
      p.life += deltaTime;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.boosterParticles.splice(i, 1);
      } else {
        p.mesh.position.addScaledVector(p.velocity, deltaTime);
        p.mesh.scale.multiplyScalar(1 - deltaTime * 1.5);
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.9 * (1 - p.life / p.maxLife);
      }
    }
  }

  public clear() {
    this.smokeParticles.forEach(p => this.scene.remove(p.mesh));
    this.sparkParticles.forEach(p => this.scene.remove(p.mesh));
    this.boosterParticles.forEach(p => this.scene.remove(p.mesh));
    this.smokeParticles = [];
    this.sparkParticles = [];
    this.boosterParticles = [];
  }
}
