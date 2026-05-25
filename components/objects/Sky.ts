import * as THREE from 'three';

export class Sky {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;
  private starsMesh?: THREE.Points;
  private cloudsMesh?: THREE.Group;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, ambientLight: THREE.AmbientLight, dirLight: THREE.DirectionalLight) {
    this.scene = scene;
    this.renderer = renderer;
    this.ambientLight = ambientLight;
    this.dirLight = dirLight;

    this.createStarfield();
    this.createClouds();
    this.updateTimeOfDay('night'); // Default to night initially
  }

  private createStarfield() {
    const starCount = 1500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 300 + Math.random() * 200;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = Math.abs(r * Math.sin(phi) * Math.sin(theta));
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const randColor = Math.random();
      if (randColor < 0.4) {
        colors[i * 3] = 0.0;
        colors[i * 3 + 1] = 0.8;
        colors[i * 3 + 2] = 1.0;
      } else if (randColor < 0.8) {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.05;
        colors[i * 3 + 2] = 0.6;
      } else {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 1.0;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      fog: false, // Ensure stars are not hidden by fog
    });

    const stars = new THREE.Points(geometry, material);
    this.scene.add(stars);
    this.starsMesh = stars;
  }

  private createClouds() {
    this.cloudsMesh = new THREE.Group();
    const cloudGeo = new THREE.IcosahedronGeometry(10, 0); // Low poly sphere
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      flatShading: true,
      transparent: true,
      opacity: 0.9
    });

    // Create 30 cloud clusters
    for (let i = 0; i < 30; i++) {
      const cluster = new THREE.Group();
      
      const puffs = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < puffs; j++) {
        const puff = new THREE.Mesh(cloudGeo, cloudMat);
        puff.position.set(
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 100
        );
        const scale = 2.0 + Math.random() * 4.0;
        puff.scale.set(scale, scale, scale);
        puff.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        cluster.add(puff);
      }

      // Position in the sky
      const angle = Math.random() * Math.PI * 2;
      const radius = 600 + Math.random() * 1000;
      const height = 40 + Math.random() * 80;

      cluster.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );
      
      this.cloudsMesh.add(cluster);
    }
    
    this.scene.add(this.cloudsMesh);
  }

  public updateTimeOfDay(time: 'afternoon' | 'evening' | 'night') {
    // Completely remove fog
    this.scene.fog = null;

    switch (time) {
      case 'afternoon':
        // Bright blue sky
        this.renderer.setClearColor(0x87CEEB, 1);
        this.ambientLight.color.setHex(0xffffff);
        this.ambientLight.intensity = 0.8;
        this.dirLight.color.setHex(0xffffff);
        this.dirLight.intensity = 1.2;
        if (this.starsMesh) this.starsMesh.visible = false;
        if (this.cloudsMesh) this.cloudsMesh.visible = true;
        break;

      case 'evening':
        // Orange-ish sky
        this.renderer.setClearColor(0xFF7F50, 1); // Coral/Orange
        this.ambientLight.color.setHex(0xffd1b3); // Warmer ambient
        this.ambientLight.intensity = 0.6;
        this.dirLight.color.setHex(0xffaa55); // Orange directional
        this.dirLight.intensity = 1.0;
        if (this.starsMesh) this.starsMesh.visible = false;
        if (this.cloudsMesh) this.cloudsMesh.visible = true;
        break;

      case 'night':
      default:
        // Dark blue / indigo sky (original cyber theme)
        this.renderer.setClearColor(0x0a0a14, 1);
        this.ambientLight.color.setHex(0x24244d);
        this.ambientLight.intensity = 1.0;
        this.dirLight.color.setHex(0xffffff);
        this.dirLight.intensity = 1.2;
        if (this.starsMesh) this.starsMesh.visible = true;
        if (this.cloudsMesh) this.cloudsMesh.visible = false;
        break;
    }
  }

  public updateSkyPosition(cameraPosition: THREE.Vector3) {
    if (this.starsMesh && this.starsMesh.visible) {
      this.starsMesh.position.copy(cameraPosition);
    }
    if (this.cloudsMesh && this.cloudsMesh.visible) {
      // Keep clouds at the same relative height, but follow camera X/Z so they feel far away
      this.cloudsMesh.position.set(cameraPosition.x, 0, cameraPosition.z);
    }
  }
}
