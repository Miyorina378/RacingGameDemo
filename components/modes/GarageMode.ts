import * as THREE from 'three';
import { BaseMode } from './BaseMode';

export class GarageMode extends BaseMode {
  private grid?: THREE.GridHelper;
  private stand?: THREE.Mesh;
  private ring?: THREE.Mesh;
  private roomGroup?: THREE.Group;
  private showroomGroup?: THREE.Group;
  private srKeySpot?: THREE.SpotLight;
  private srFillSpot?: THREE.SpotLight;
  private srTopSpot?: THREE.SpotLight;
  private mainGarageSpot?: THREE.SpotLight;
  private tuningSpot?: THREE.SpotLight;
  private wasTuningState = 'closed';
  private srOuterRingMat?: THREE.MeshBasicMaterial;
  private srCenterPoint?: THREE.PointLight;
  private purchaseCelebrationTimer = 0;
  private quickPlayLeftLight?: THREE.DirectionalLight;
  private quickPlayRightLight?: THREE.DirectionalLight;
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

    // --- DEDICATED 3D SHOWROOM ENVIRONMENT (ULTRA-LUXURY STUDIO ATMOSPHERE) ---
    this.showroomGroup = new THREE.Group();

    // 1. Matte Non-Reflective Showroom Floor (Zero shiny reflections)
    const srFloorGeom = new THREE.PlaneGeometry(120, 120);
    const srFloorMat = new THREE.MeshStandardMaterial({
      color: 0x0f1115,
      roughness: 0.95,
      metalness: 0.0,
    });
    const srFloor = new THREE.Mesh(srFloorGeom, srFloorMat);
    srFloor.rotation.x = -Math.PI / 2;
    srFloor.receiveShadow = true;
    this.showroomGroup.add(srFloor);

    // 2. Matte Charcoal Stage Pedestal
    const srStageGeom = new THREE.CylinderGeometry(5.2, 5.5, 0.22, 64);
    const srStageMat = new THREE.MeshStandardMaterial({
      color: 0x12151c,
      roughness: 0.95,
      metalness: 0.0,
    });
    const srStage = new THREE.Mesh(srStageGeom, srStageMat);
    srStage.position.y = 0.11;
    srStage.receiveShadow = true;
    this.showroomGroup.add(srStage);

    // Dual Concentric Glowing Stage Rings (Subtle Cyber Cyan Outer + Rose Accent Inner)
    const srOuterRingGeom = new THREE.RingGeometry(5.2, 5.35, 64);
    srOuterRingGeom.rotateX(-Math.PI / 2);
    this.srOuterRingMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      side: THREE.DoubleSide,
    });
    const srOuterRing = new THREE.Mesh(srOuterRingGeom, this.srOuterRingMat);
    srOuterRing.position.y = 0.225;
    this.showroomGroup.add(srOuterRing);

    const srInnerRingGeom = new THREE.RingGeometry(4.4, 4.48, 64);
    srInnerRingGeom.rotateX(-Math.PI / 2);
    const srInnerRingMat = new THREE.MeshBasicMaterial({
      color: 0xe11d48,
      side: THREE.DoubleSide,
    });
    const srInnerRing = new THREE.Mesh(srInnerRingGeom, srInnerRingMat);
    srInnerRing.position.y = 0.226;
    this.showroomGroup.add(srInnerRing);

    // 3. Soft Overhead Halo Ring
    const srHaloGeom = new THREE.TorusGeometry(6.5, 0.14, 16, 64);
    srHaloGeom.rotateX(Math.PI / 2);
    const srHaloMat = new THREE.MeshBasicMaterial({
      color: 0x334155,
    });
    const srHalo = new THREE.Mesh(srHaloGeom, srHaloMat);
    srHalo.position.set(0, 8.0, 0);
    this.showroomGroup.add(srHalo);

    // 4. Rear Architectural Studio Wall with Soft LED Accent Columns
    const wallBack = new THREE.Group();
    wallBack.position.set(0, 0, -14);

    const backWallGeom = new THREE.PlaneGeometry(60, 22);
    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x030406,
      roughness: 0.95,
      metalness: 0.0,
    });
    const backWallMesh = new THREE.Mesh(backWallGeom, backWallMat);
    backWallMesh.position.y = 11;
    wallBack.add(backWallMesh);

    // Soft Glowing Vertical Columns
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      const pillarGeom = new THREE.BoxGeometry(0.15, 16, 0.15);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x0369a1 : 0x1e40af,
      });
      const pillar = new THREE.Mesh(pillarGeom, pillarMat);
      pillar.position.set(i * 4.5, 8, 0.1);
      wallBack.add(pillar);
    }
    this.showroomGroup.add(wallBack);

    // 5. Overhead Soft Studio Lighting Rig
    const srTopDir = new THREE.DirectionalLight(0xffffff, 0.4);
    srTopDir.position.set(0, 40, 0);
    const srTopDirTarget = new THREE.Object3D();
    srTopDirTarget.position.set(0, 0, 0);
    this.showroomGroup.add(srTopDirTarget);
    srTopDir.target = srTopDirTarget;
    this.showroomGroup.add(srTopDir);

    // Soft Low-Intensity Spotlight
    this.srTopSpot = new THREE.SpotLight(0xffffff, 3.5, 30, Math.PI / 3, 0.8, 0.5);
    this.srTopSpot.position.set(0, 12, 0);
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0, 0);
    this.showroomGroup.add(spotTarget);
    this.srTopSpot.target = spotTarget;
    this.srTopSpot.castShadow = true;
    this.srTopSpot.shadow.mapSize.width = 2048;
    this.srTopSpot.shadow.mapSize.height = 2048;
    this.srTopSpot.shadow.bias = -0.0008;
    this.showroomGroup.add(this.srTopSpot);

    // Soft Overhead Fill Light
    this.srCenterPoint = new THREE.PointLight(0xffffff, 5.0, 20, 0);
    this.srCenterPoint.position.set(0, 7.0, 0);
    this.showroomGroup.add(this.srCenterPoint);

    (this.engine as any).triggerPurchaseCelebration = () => {
      this.purchaseCelebrationTimer = 2.5;
    };

    this.showroomGroup.visible = false;
    this.environmentGroup.add(this.showroomGroup);

    // Main Garage Spotlights
    this.mainGarageSpot = new THREE.SpotLight(0xffffff, 15, 30, Math.PI / 6, 0.4, 1);
    this.mainGarageSpot.position.set(0, 10, 0);
    this.mainGarageSpot.target = this.vehicle.mesh;
    this.mainGarageSpot.castShadow = (this.engine.postProcessing ? this.engine.postProcessing.getQuality() !== 'low' : true);
    this.mainGarageSpot.shadow.mapSize.width = 1024;
    this.mainGarageSpot.shadow.mapSize.height = 1024;
    this.mainGarageSpot.shadow.bias = -0.001;
    this.environmentGroup.add(this.mainGarageSpot);

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

    // Cyber lights for Quick Play interactable mode
    this.quickPlayLeftLight = new THREE.DirectionalLight(0x06b6d4, 3.5); // cyber cyan
    this.quickPlayLeftLight.position.set(-5, 4, 5);
    this.quickPlayLeftLight.visible = false;
    this.environmentGroup.add(this.quickPlayLeftLight);

    this.quickPlayRightLight = new THREE.DirectionalLight(0xf43f5e, 3.0); // cyber rose
    this.quickPlayRightLight.position.set(5, 3, -5);
    this.quickPlayRightLight.visible = false;
    this.environmentGroup.add(this.quickPlayRightLight);

    // Set callback state in React
    this.engine.callbacks.onGameStatus('idle');
  }

  public update(deltaTime: number) {
    const tuningState = (this.engine as any).tuningState || 'closed';
    const isTuning = tuningState !== 'closed';
    const progress = (this.engine as any).tuningCameraProgress || 0;
    const isQuickPlay = (this.engine as any).isQuickPlayCarSelect;
    const isShowroomMode = isQuickPlay || ((this.engine as any).activeGarageTab === 'dealer' && (this.engine as any).dealerMarketMode !== null);

    if (isTuning) {
      // Keep vehicle stationary facing the camera directly
      this.vehicle.mesh.rotation.y = 0;
      this.vehicle.mesh.position.set(0, 0, 0);

      // Hide showroom & garage background components, show tuning room background
      if (this.showroomGroup) this.showroomGroup.visible = false;
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
      const activeProgress = progress;
      if (this.engine.ambientLight) {
        this.engine.ambientLight.intensity = 0.35 * activeProgress; // lower ambient for rich contrast
      }
      if (this.engine.dirLight) {
        this.engine.dirLight.intensity = 0.45 * activeProgress;
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
        this.tuningSpot.intensity = 4.0 * activeProgress;

        // Use car's half-length so the cone covers bumper-to-bumper
        const coneRadius = (size.z / 2) + 2.0;
        this.tuningSpot.angle = Math.atan2(coneRadius, lightY);
        this.tuningSpot.penumbra = 0.5;
        this.tuningSpot.visible = true;
      }

      // Hide cyber lights in tuning mode
      if (this.quickPlayLeftLight) this.quickPlayLeftLight.visible = false;
      if (this.quickPlayRightLight) this.quickPlayRightLight.visible = false;
    } else if (isShowroomMode) {
      // DEDICATED 3D SHOWROOM MODE (Quick Play Car Select OR Dealer Car Showroom)
      this.vehicle.mesh.rotation.y = 0;
      this.vehicle.mesh.position.set(0, 0, 0);

      // Show 3D Showroom background, hide standard garage grid/stand/room
      if (this.showroomGroup) this.showroomGroup.visible = true;
      if (this.grid) this.grid.visible = false;
      if (this.stand) this.stand.visible = false;
      if (this.ring) this.ring.visible = false;
      if (this.roomGroup) this.roomGroup.visible = false;

      // Keep sky dome visible
      if (this.engine.sky) this.engine.sky.setVisible(true);
      if (this.engine.scene) this.engine.scene.background = null;

      // Calculate dynamic dimensions of the vehicle to position top spotlight correctly
      const box = new THREE.Box3().setFromObject(this.vehicle.mesh);
      const size = box.getSize(new THREE.Vector3());
      const carHeight = size.y > 0.5 ? size.y : 1.2;
      const targetLightY = Math.max(10, carHeight + 9.0);

      // Handle Purchase Celebration Lighting Animation
      if (this.purchaseCelebrationTimer > 0) {
        this.purchaseCelebrationTimer -= deltaTime;
        const progress = Math.max(0, this.purchaseCelebrationTimer / 2.5);
        const pulse = Math.sin(progress * Math.PI * 6) * 0.5 + 0.5;

        if (this.srTopSpot) {
          this.srTopSpot.position.set(0, targetLightY, 0);
          this.srTopSpot.intensity = 10.0 + pulse * 15.0;
        }
        if (this.srCenterPoint) {
          this.srCenterPoint.intensity = 18.0 + pulse * 30.0;
        }
        if (this.srOuterRingMat) {
          this.srOuterRingMat.color.setHex(pulse > 0.5 ? 0x06b6d4 : 0xf59e0b);
        }
        if (this.engine.ambientLight) {
          this.engine.ambientLight.intensity = 0.25 + pulse * 0.2;
        }
      } else {
        if (this.srTopSpot) {
          this.srTopSpot.position.set(0, targetLightY, 0);
          this.srTopSpot.intensity = 3.5;
        }
        if (this.srCenterPoint) {
          this.srCenterPoint.intensity = 5.0;
        }
        if (this.srOuterRingMat) {
          this.srOuterRingMat.color.setHex(0x0284c7);
        }
        if (this.engine.ambientLight) {
          this.engine.ambientLight.color.setHex(0xd1d5db);
          this.engine.ambientLight.intensity = 0.25;
        }
      }

      if (this.engine.dirLight) {
        this.engine.dirLight.intensity = 0; // ZERO light from camera direction!
      }

      if (this.mainGarageSpot) this.mainGarageSpot.visible = false;
      if (this.tuningSpot) this.tuningSpot.visible = false;
      if (this.srTopSpot) this.srTopSpot.visible = true;

      // Hide cyber lights
      if (this.quickPlayLeftLight) this.quickPlayLeftLight.visible = false;
      if (this.quickPlayRightLight) this.quickPlayRightLight.visible = false;

      // Restore vehicle lights and emissives
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
    } else {
      // DEFAULT MAIN GARAGE MODE
      this.vehicle.mesh.position.set(0, 0, 0);
      this.vehicle.mesh.rotation.y = 0;

      // Show standard garage components, hide showroom and room
      if (this.showroomGroup) this.showroomGroup.visible = false;
      if (this.grid) this.grid.visible = true;
      if (this.stand) this.stand.visible = true;
      if (this.ring) this.ring.visible = true;
      if (this.roomGroup) this.roomGroup.visible = false;

      // Hide cyber lights
      if (this.quickPlayLeftLight) this.quickPlayLeftLight.visible = false;
      if (this.quickPlayRightLight) this.quickPlayRightLight.visible = false;

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
      if (this.mainGarageSpot) this.mainGarageSpot.visible = true;
      if (this.tuningSpot) this.tuningSpot.visible = false;
      if (this.srTopSpot) this.srTopSpot.visible = false;
      if (this.srKeySpot) this.srKeySpot.visible = false;
      if (this.srFillSpot) this.srFillSpot.visible = false;
    }
  }

  public cleanup() {
    this.clearEnvironment();
  }

  public reset() {
    this.init();
  }
}
