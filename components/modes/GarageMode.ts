import * as THREE from 'three';
import { BaseMode } from './BaseMode';

export class GarageMode extends BaseMode {
  private grid?: THREE.GridHelper;
  private stand?: THREE.Mesh;
  private ring?: THREE.Mesh;
  private roomGroup?: THREE.Group;
  private tuningSpot?: THREE.SpotLight;
  private wasTuningState = 'closed';
  private tuningIntroTime = 0;

  public init() {
    this.clearEnvironment();
    this.particles.clear();

    this.vehicle.reset(new THREE.Vector3(0, 0, 0), 0);

    // Grid floor for the garage
    const size = 40;
    const divisions = 20;
    this.grid = new THREE.GridHelper(size, divisions, 0x00ffff, 0x111133);
    this.grid.position.y = 0;
    this.environmentGroup.add(this.grid);

    // Glowing circular stand for the car
    const standGeom = new THREE.CylinderGeometry(4.5, 4.6, 0.15, 32);
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x111122,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x001122,
    });
    this.stand = new THREE.Mesh(standGeom, standMat);
    this.stand.position.y = 0.075;
    this.stand.receiveShadow = true;
    this.environmentGroup.add(this.stand);

    const ringGeom = new THREE.RingGeometry(4.5, 4.7, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      side: THREE.DoubleSide
    });
    this.ring = new THREE.Mesh(ringGeom, ringMat);
    this.ring.position.y = 0.16;
    this.environmentGroup.add(this.ring);

    // Spotlights
    const spot = new THREE.SpotLight(0xffffff, 15, 30, Math.PI / 6, 0.4, 1);
    spot.position.set(0, 10, 0);
    spot.target = this.vehicle.mesh;
    spot.castShadow = (this.engine.postProcessing ? this.engine.postProcessing.getQuality() !== 'low' : true);
    spot.shadow.mapSize.width = 1024;
    spot.shadow.mapSize.height = 1024;
    spot.shadow.bias = -0.001;
    this.environmentGroup.add(spot);

    // Create tuning room meshes
    this.roomGroup = new THREE.Group();

    // Floor
    const floorGeom = new THREE.PlaneGeometry(50, 50);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x111115,
      roughness: 0.8,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    // Back wall
    const wallGeom = new THREE.PlaneGeometry(50, 20);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0c,
      roughness: 0.95,
      metalness: 0.05,
    });
    const backWall = new THREE.Mesh(wallGeom, wallMat);
    backWall.position.set(0, 10, -15);
    backWall.receiveShadow = true;
    this.roomGroup.add(backWall);

    // Left wall
    const leftWall = new THREE.Mesh(wallGeom, wallMat);
    leftWall.position.set(-25, 10, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    this.roomGroup.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(wallGeom, wallMat);
    rightWall.position.set(25, 10, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    this.roomGroup.add(rightWall);

    // Ceiling
    const ceiling = new THREE.Mesh(floorGeom, wallMat);
    ceiling.position.set(0, 20, 0);
    ceiling.rotation.x = Math.PI / 2;
    this.roomGroup.add(ceiling);

    // Dedicated tuning spotlight (separate from garage spot) — softer to avoid metallic glare
    this.tuningSpot = new THREE.SpotLight(0xffffff, 4.5, 10, Math.PI / 3, 0.5, 0.5);
    this.tuningSpot.position.set(0, 3.2, 0);
    this.tuningSpot.target = this.vehicle.mesh;
    this.tuningSpot.castShadow = (this.engine.postProcessing ? this.engine.postProcessing.getQuality() !== 'low' : true);
    this.tuningSpot.shadow.mapSize.width = 1024;
    this.tuningSpot.shadow.mapSize.height = 1024;
    this.tuningSpot.shadow.bias = -0.001;
    this.tuningSpot.visible = false;
    this.roomGroup.add(this.tuningSpot);

    // Add to environmentGroup, but make it initially hidden
    this.roomGroup.visible = false;
    this.environmentGroup.add(this.roomGroup);

    // Set callback state in React
    this.engine.callbacks.onGameStatus('idle');
  }

  public update(deltaTime: number) {
    const tuningState = (this.engine as any).tuningState || 'closed';
    const isTuning = tuningState !== 'closed';
    const progress = (this.engine as any).tuningCameraProgress || 0;

    if (isTuning) {
      // Keep vehicle stationary facing the camera directly
      this.vehicle.mesh.rotation.y = 0;
      this.vehicle.mesh.position.set(0, 0, 0);

      // Hide showroom background components, show room background
      if (this.grid) this.grid.visible = false;
      if (this.stand) this.stand.visible = false;
      if (this.ring) this.ring.visible = false;
      if (this.roomGroup) this.roomGroup.visible = true;

      // Hide sky dome and set clear color / background to black
      if (this.engine.sky) this.engine.sky.setVisible(false);
      if (this.engine.renderer) this.engine.renderer.setClearColor(0x000000, 1);
      if (this.engine.scene) this.engine.scene.background = new THREE.Color(0x000000);

      // Calculate dynamic dimensions of the vehicle to position lights correctly
      const box = new THREE.Box3().setFromObject(this.vehicle.mesh);
      const size = box.getSize(new THREE.Vector3());
      const carHeight = size.y > 0.5 ? size.y : 1.2;

      // Disable headlights and tail lights to see paint color clearly
      this.vehicle.mesh.traverse((child) => {
        if (child instanceof THREE.Light) {
          child.visible = false;
        }
        if (child instanceof THREE.Mesh) {
          if (child.material && (child.material as THREE.MeshStandardMaterial).emissive) {
            if ((child as any).originalEmissiveIntensity === undefined) {
              (child as any).originalEmissiveIntensity = (child.material as THREE.MeshStandardMaterial).emissiveIntensity;
            }
            (child.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
          }
        }
      });

      // Lit up (fade-in) the scene lights based on progress
      if (this.engine.ambientLight) {
        this.engine.ambientLight.intensity = 0.5 * progress;
      }
      if (this.engine.dirLight) {
        this.engine.dirLight.intensity = 0.6 * progress;
      }
      // Hide the garage spotlight, use the dedicated tuning light instead
      this.environmentGroup.traverse((child) => {
        if (child instanceof THREE.SpotLight && child !== this.tuningSpot) {
          child.visible = false;
        }
      });

      // Configure and show the tuning spotlight
      if (this.tuningSpot) {
        const lightY = carHeight + 2.0;
        this.tuningSpot.position.set(0, lightY, 0);
        this.tuningSpot.distance = lightY + 5;
        this.tuningSpot.intensity = 4.5 * progress;

        // Use car's half-length so the cone covers bumper-to-bumper
        const coneRadius = (size.z / 2) + 2.0;
        this.tuningSpot.angle = Math.atan2(coneRadius, lightY);
        this.tuningSpot.penumbra = 0.5;
        this.tuningSpot.visible = true;
      }
    } else {
      this.vehicle.mesh.position.set(0, 0, 0);
      // Slowly rotate the car group
      this.vehicle.mesh.rotation.y += 0.1 * deltaTime;

      // Restore visibility of showroom components, hide room
      if (this.grid) this.grid.visible = true;
      if (this.stand) this.stand.visible = true;
      if (this.ring) this.ring.visible = true;
      if (this.roomGroup) this.roomGroup.visible = false;

      // Restore sky dome and scene background
      if (this.engine.sky) this.engine.sky.setVisible(true);
      if (this.engine.scene) this.engine.scene.background = null;

      // Restore lights and emissive glows
      this.vehicle.mesh.traverse((child) => {
        if (child instanceof THREE.Light) {
          child.visible = true;
        }
        if (child instanceof THREE.Mesh) {
          if (child.material && (child.material as THREE.MeshStandardMaterial).emissive && (child as any).originalEmissiveIntensity !== undefined) {
            (child.material as THREE.MeshStandardMaterial).emissiveIntensity = (child as any).originalEmissiveIntensity;
          }
        }
      });

      // Restore light intensities and positions when not in tuning
      if (this.engine.ambientLight) {
        this.engine.ambientLight.intensity = 1.0;
      }
      if (this.engine.dirLight) {
        this.engine.dirLight.intensity = 1.2;
      }
      // Restore garage spotlight, hide tuning light
      this.environmentGroup.traverse((child) => {
        if (child instanceof THREE.SpotLight && child !== this.tuningSpot) {
          child.visible = true;
        }
      });
      if (this.tuningSpot) {
        this.tuningSpot.visible = false;
      }
    }
  }

  public cleanup() {
    this.clearEnvironment();
  }

  public reset() {
    this.init();
  }
}
