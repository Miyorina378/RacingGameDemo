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
  private srInnerRingMat?: THREE.MeshBasicMaterial;
  private srFloorMat?: THREE.MeshStandardMaterial;
  private srStageMat?: THREE.MeshStandardMaterial;
  private srBackdropMat?: THREE.MeshStandardMaterial;
  private srPrimaryAccentMats: THREE.MeshBasicMaterial[] = [];
  private srBrandAccentMats: THREE.MeshBasicMaterial[] = [];
  private srCenterPoint?: THREE.PointLight;
  private showroomThemeKey = '';
  private showroomBackground = new THREE.Color(0x05080d);
  private currentShowroomPrimary = 0x22d3ee;
  private currentShowroomSecondary = 0xf43f5e;
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

    // --- DEDICATED 3D DEALER SHOWROOM ---
    this.showroomGroup = new THREE.Group();
    this.srPrimaryAccentMats = [];
    this.srBrandAccentMats = [];
    this.showroomThemeKey = '';

    this.srFloorMat = new THREE.MeshStandardMaterial({
      color: 0x080b10,
      roughness: 0.72,
      metalness: 0.08,
    });
    const srFloor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), this.srFloorMat);
    srFloor.rotation.x = -Math.PI / 2;
    srFloor.receiveShadow = true;
    this.showroomGroup.add(srFloor);

    // Low, wide turntable keeps the car as the visual focus.
    const srPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(5.9, 6.2, 0.18, 96),
      new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.7, metalness: 0.28 })
    );
    srPlinth.position.y = 0.09;
    srPlinth.receiveShadow = true;
    this.showroomGroup.add(srPlinth);

    this.srStageMat = new THREE.MeshStandardMaterial({
      color: 0x151a22,
      roughness: 0.42,
      metalness: 0.34,
    });
    const srStage = new THREE.Mesh(new THREE.CylinderGeometry(5.35, 5.65, 0.16, 96), this.srStageMat);
    srStage.position.y = 0.19;
    srStage.receiveShadow = true;
    this.showroomGroup.add(srStage);

    const primaryAccentStrong = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    const primaryAccentSoft = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.34,
      toneMapped: false,
    });
    const brandAccentStrong = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.82,
      toneMapped: false,
    });
    const brandAccentSoft = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.26,
      toneMapped: false,
    });
    this.srPrimaryAccentMats.push(primaryAccentStrong, primaryAccentSoft);
    this.srBrandAccentMats.push(brandAccentStrong, brandAccentSoft);

    const srOuterRingGeom = new THREE.RingGeometry(5.32, 5.48, 96);
    srOuterRingGeom.rotateX(-Math.PI / 2);
    this.srOuterRingMat = primaryAccentStrong;
    const srOuterRing = new THREE.Mesh(srOuterRingGeom, this.srOuterRingMat);
    srOuterRing.position.y = 0.285;
    this.showroomGroup.add(srOuterRing);

    const srInnerRingGeom = new THREE.RingGeometry(4.72, 4.78, 96);
    srInnerRingGeom.rotateX(-Math.PI / 2);
    this.srInnerRingMat = brandAccentStrong;
    const srInnerRing = new THREE.Mesh(srInnerRingGeom, this.srInnerRingMat);
    srInnerRing.position.y = 0.288;
    this.showroomGroup.add(srInnerRing);

    // Embedded floor rails pull the room toward the display platform.
    [-10.5, -7.5, 7.5, 10.5].forEach((x, index) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.025, 38),
        index % 2 === 0 ? primaryAccentSoft : brandAccentSoft
      );
      rail.position.set(x, 0.018, -1);
      this.showroomGroup!.add(rail);
    });

    // Deep architectural wall with a recessed central presentation bay.
    this.srBackdropMat = new THREE.MeshStandardMaterial({
      color: 0x080b11,
      roughness: 0.78,
      metalness: 0.12,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.035,
    });
    const srBackWall = new THREE.Mesh(new THREE.BoxGeometry(48, 20, 0.65), this.srBackdropMat);
    srBackWall.position.set(0, 10, -17);
    srBackWall.receiveShadow = true;
    this.showroomGroup.add(srBackWall);

    const srCenterBay = new THREE.Mesh(
      new THREE.BoxGeometry(19, 7.8, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x020305, roughness: 0.88, metalness: 0.05 })
    );
    srCenterBay.position.set(0, 7.4, -16.58);
    this.showroomGroup.add(srCenterBay);

    // Portal frame around the car reads clearly from every orbit angle.
    [-10.2, 10.2].forEach((x) => {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.16, 10.5, 0.18), primaryAccentStrong);
      upright.position.set(x, 7.2, -16.28);
      this.showroomGroup!.add(upright);
    });
    const portalHeader = new THREE.Mesh(new THREE.BoxGeometry(20.55, 0.16, 0.18), primaryAccentStrong);
    portalHeader.position.set(0, 12.45, -16.28);
    this.showroomGroup.add(portalHeader);

    // Alternating wall fins give the selected brand a secondary color identity.
    [-4, -3, -2, 2, 3, 4].forEach((slot, index) => {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 14.5, 0.16),
        index % 2 === 0 ? brandAccentStrong : primaryAccentSoft
      );
      fin.position.set(slot * 4.35, 8.2, -16.22);
      this.showroomGroup!.add(fin);
    });

    // Angled side galleries make the studio feel enclosed without a heavy vignette.
    const sideWallMaterial = new THREE.MeshStandardMaterial({
      color: 0x05070b,
      roughness: 0.82,
      metalness: 0.08,
    });
    [-1, 1].forEach((side) => {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 17, 34), sideWallMaterial);
      sideWall.position.set(side * 24, 8.5, -1);
      this.showroomGroup!.add(sideWall);

      const sideStrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 28), brandAccentSoft);
      sideStrip.position.set(side * 23.65, 5.2, -1);
      this.showroomGroup!.add(sideStrip);
    });

    // Floating ceiling canopy and light lanes frame the car from above.
    const canopyMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c1016,
      roughness: 0.58,
      metalness: 0.3,
    });
    [-11, -5.5, 0, 5.5, 11].forEach((x, index) => {
      const canopyBeam = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.22, 32), canopyMaterial);
      canopyBeam.position.set(x, 10.8, -1.5);
      this.showroomGroup!.add(canopyBeam);

      if (index !== 2) {
        const canopyLight = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.06, 26),
          index % 2 === 0 ? primaryAccentSoft : brandAccentSoft
        );
        canopyLight.position.set(x, 10.65, -1.5);
        this.showroomGroup!.add(canopyLight);
      }
    });

    const srHaloGeom = new THREE.TorusGeometry(6.8, 0.09, 16, 96);
    srHaloGeom.rotateX(Math.PI / 2);
    const srHalo = new THREE.Mesh(srHaloGeom, primaryAccentSoft);
    srHalo.position.set(0, 9.7, 0);
    this.showroomGroup.add(srHalo);

    const lightTarget = new THREE.Object3D();
    lightTarget.position.set(0, 0.8, 0);
    this.showroomGroup.add(lightTarget);

    this.srTopSpot = new THREE.SpotLight(0xffffff, 5.5, 34, Math.PI / 3.1, 0.72, 0.55);
    this.srTopSpot.position.set(0, 12, 1);
    this.srTopSpot.target = lightTarget;
    this.srTopSpot.castShadow = true;
    this.srTopSpot.shadow.mapSize.width = 2048;
    this.srTopSpot.shadow.mapSize.height = 2048;
    this.srTopSpot.shadow.bias = -0.0008;
    this.showroomGroup.add(this.srTopSpot);

    this.srKeySpot = new THREE.SpotLight(0x22d3ee, 7.2, 34, Math.PI / 3.4, 0.82, 0.65);
    this.srKeySpot.position.set(-10, 5.8, 7);
    this.srKeySpot.target = lightTarget;
    this.showroomGroup.add(this.srKeySpot);

    this.srFillSpot = new THREE.SpotLight(0xf43f5e, 5.8, 32, Math.PI / 3.2, 0.86, 0.7);
    this.srFillSpot.position.set(10, 4.6, 4);
    this.srFillSpot.target = lightTarget;
    this.showroomGroup.add(this.srFillSpot);

    this.srCenterPoint = new THREE.PointLight(0xffffff, 4.2, 18, 1.1);
    this.srCenterPoint.position.set(0, 6.8, 1.5);
    this.showroomGroup.add(this.srCenterPoint);

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

  public triggerPurchaseCelebration() {
    this.purchaseCelebrationTimer = 2.5;
  }

  private applyShowroomTheme(mode: string | null, brandColor: number) {
    const themes: Record<string, {
      primary: number;
      fallbackSecondary: number;
      background: number;
      floor: number;
      stage: number;
      wall: number;
    }> = {
      default: {
        primary: 0x22d3ee,
        fallbackSecondary: 0xf43f5e,
        background: 0x05080d,
        floor: 0x080b10,
        stage: 0x151a22,
        wall: 0x080b11,
      },
      new: {
        primary: 0x22d3ee,
        fallbackSecondary: 0x3b82f6,
        background: 0x041016,
        floor: 0x071116,
        stage: 0x10212a,
        wall: 0x07141b,
      },
      used: {
        primary: 0xf59e0b,
        fallbackSecondary: 0xfb923c,
        background: 0x120c04,
        floor: 0x151008,
        stage: 0x251b0d,
        wall: 0x171006,
      },
      race: {
        primary: 0xf43f5e,
        fallbackSecondary: 0xef4444,
        background: 0x120309,
        floor: 0x16070c,
        stage: 0x280d16,
        wall: 0x19060d,
      },
      museum: {
        primary: 0xa855f7,
        fallbackSecondary: 0xf59e0b,
        background: 0x0d0614,
        floor: 0x120a18,
        stage: 0x21122b,
        wall: 0x16091f,
      },
    };

    const theme = themes[mode || 'default'] || themes.default;
    const safeBrandColor = Number.isFinite(brandColor) ? brandColor : theme.fallbackSecondary;
    const themeKey = `${mode || 'default'}-${safeBrandColor}`;
    if (this.showroomThemeKey === themeKey) return;
    this.showroomThemeKey = themeKey;

    this.currentShowroomPrimary = theme.primary;
    this.currentShowroomSecondary = safeBrandColor;
    this.showroomBackground.setHex(theme.background);
    this.srFloorMat?.color.setHex(theme.floor);
    this.srStageMat?.color.setHex(theme.stage);
    if (this.srBackdropMat) {
      this.srBackdropMat.color.setHex(theme.wall);
      this.srBackdropMat.emissive.setHex(theme.primary);
    }
    this.srPrimaryAccentMats.forEach((material) => material.color.setHex(theme.primary));
    this.srBrandAccentMats.forEach((material) => material.color.setHex(safeBrandColor));
    this.srKeySpot?.color.setHex(theme.primary);
    this.srFillSpot?.color.setHex(safeBrandColor);
  }

  public update(deltaTime: number) {
    const tuningState = (this.engine as any).tuningState || 'closed';
    const isTuning = tuningState !== 'closed';
    const progress = (this.engine as any).tuningCameraProgress || 0;
    const isQuickPlay = (this.engine as any).isQuickPlayCarSelect;
    const dealerMarketMode = this.engine.dealerMarketMode;
    const isShowroomMode = isQuickPlay || (this.engine.activeGarageTab === 'dealer' && dealerMarketMode !== null);

    if (isShowroomMode) {
      this.applyShowroomTheme(
        isQuickPlay ? 'default' : dealerMarketMode,
        this.engine.dealerShowroomColor
      );
    }

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

      // Enclosed studio: no outdoor sky or dark vignette overlay is needed.
      if (this.engine.sky) this.engine.sky.setVisible(false);
      if (this.engine.renderer) this.engine.renderer.setClearColor(this.showroomBackground, 1);
      if (this.engine.scene) this.engine.scene.background = this.showroomBackground;

      // Calculate dynamic dimensions of the vehicle to position top spotlight correctly
      const box = new THREE.Box3().setFromObject(this.vehicle.mesh);
      const size = box.getSize(new THREE.Vector3());
      const carHeight = size.y > 0.5 ? size.y : 1.2;
      const targetLightY = Math.max(10, carHeight + 9.0);

      // Purchase celebration pulses the room accents without moving or scaling the view.
      if (this.purchaseCelebrationTimer > 0) {
        this.purchaseCelebrationTimer -= deltaTime;
        const celebrationProgress = Math.max(0, this.purchaseCelebrationTimer / 2.5);
        const pulse = Math.sin(celebrationProgress * Math.PI * 6) * 0.5 + 0.5;

        if (this.srTopSpot) {
          this.srTopSpot.position.set(0, targetLightY, 1);
          this.srTopSpot.intensity = 8.0 + pulse * 9.0;
        }
        if (this.srCenterPoint) {
          this.srCenterPoint.intensity = 6.0 + pulse * 10.0;
        }
        this.srPrimaryAccentMats.forEach((material) => {
          material.color.setHex(pulse > 0.5 ? this.currentShowroomPrimary : 0xfbbf24);
        });
        if (this.engine.ambientLight) {
          this.engine.ambientLight.intensity = 0.32 + pulse * 0.18;
        }
      } else {
        if (this.srTopSpot) {
          this.srTopSpot.position.set(0, targetLightY, 1);
          this.srTopSpot.intensity = 5.5;
        }
        if (this.srCenterPoint) {
          this.srCenterPoint.intensity = 4.2;
        }
        this.srPrimaryAccentMats.forEach((material) => {
          material.color.setHex(this.currentShowroomPrimary);
        });
        this.srBrandAccentMats.forEach((material) => {
          material.color.setHex(this.currentShowroomSecondary);
        });
        if (this.engine.ambientLight) {
          this.engine.ambientLight.color.setHex(0xdbeafe);
          this.engine.ambientLight.intensity = 0.32;
        }
      }

      if (this.engine.dirLight) {
        this.engine.dirLight.intensity = 0; // ZERO light from camera direction!
      }

      if (this.mainGarageSpot) this.mainGarageSpot.visible = false;
      if (this.tuningSpot) this.tuningSpot.visible = false;
      if (this.srTopSpot) this.srTopSpot.visible = true;
      if (this.srKeySpot) {
        this.srKeySpot.visible = true;
        this.srKeySpot.intensity = 7.2;
      }
      if (this.srFillSpot) {
        this.srFillSpot.visible = true;
        this.srFillSpot.intensity = 5.8;
      }

      // Hide quick-play-only exterior lights; the studio owns its light rig.
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
      if (this.vehicle && this.vehicle.mesh) {
        this.vehicle.mesh.visible = true;
        this.vehicle.mesh.position.set(0, 0, 0);
        this.vehicle.mesh.rotation.y = 0;
      }

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
      if (this.engine.renderer) this.engine.renderer.setClearColor(0x0a0a14, 1);

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
        this.engine.ambientLight.color.setHex(0x24244d);
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
