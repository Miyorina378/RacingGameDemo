import * as THREE from 'three';
import { BaseMode } from './BaseMode';
import { TRACKS_DATABASE } from '../config/TrackDatabase';
import { GameEngine } from '../gameEngine';
import { Vehicle } from '../objects/Vehicle';
import { ParticleSystem } from '../objects/ParticleSystem';

export class PreviewMode extends BaseMode {
  // Static state to preserve camera between track geometry rebuilds
  public static isRebuilding = false;
  private static lastPitch = -Math.PI / 4;
  private static lastYaw = 0;

  private trackId: string;
  private centerPt = new THREE.Vector3();

  // Free camera state
  private pitch = -Math.PI / 4;
  private yaw = 0;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  constructor(
    engine: GameEngine,
    scene: THREE.Scene,
    vehicle: Vehicle,
    particles: ParticleSystem,
    environmentGroup: THREE.Group,
    keys: { [key: string]: boolean },
    trackId: string
  ) {
    super(engine, scene, vehicle, particles, environmentGroup, keys);
    this.trackId = trackId;

    // Bind event listeners
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button === 0 || e.button === 2) {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
  }

  private onMouseUp() {
    this.isDragging = false;
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;

    this.yaw -= deltaX * 0.005;
    this.pitch -= deltaY * 0.005;

    // Clamp pitch to avoid flipping
    this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));

    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  public init() {
    this.clearEnvironment();
    this.particles.clear();
    
    // Create standard neon grid floor & sun
    this.createGridFloor();

    const trackConfig = TRACKS_DATABASE.find(t => t.id === this.trackId) || TRACKS_DATABASE[1];
    
    // Create visual road mesh with curbs and fences
    this.createRacetrackRoad(trackConfig);
    this.createScenery(trackConfig.scenery);

    // Calculate center point of the track
    const path = trackConfig.path;
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    path.forEach(pt => {
      const pos = ('isVector3' in pt ? pt : (pt as any).pos) as THREE.Vector3;
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.z < minZ) minZ = pos.z;
      if (pos.z > maxZ) maxZ = pos.z;
    });

    this.centerPt.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    
    const maxRadius = Math.max((maxX - minX) / 2, (maxZ - minZ) / 2, 50) + 75;

    // Hide vehicle in preview mode
    this.vehicle.mesh.visible = false;
    
    // Initial camera position
    const cam = this.engine.camera;
    if (PreviewMode.isRebuilding) {
      this.pitch = PreviewMode.lastPitch;
      this.yaw = PreviewMode.lastYaw;
      PreviewMode.isRebuilding = false; // Reset flag
    } else {
      cam.up.set(0, 1, 0);
      cam.position.set(this.centerPt.x, maxRadius * 0.8, this.centerPt.z + maxRadius * 0.8);
      this.pitch = -Math.PI / 4;
      this.yaw = 0;
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }

    // Add event listeners
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  public update(deltaTime: number) {
    this.updateScrollingFloor();
    this.updateGrass(deltaTime);
    this.particles.update(deltaTime);

    const cam = this.engine.camera;
    const speed = this.keys['shift'] ? 150 : 50;
    
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'));
    
    if (this.keys['w'] || this.keys['arrowup']) cam.position.addScaledVector(forward, speed * deltaTime);
    if (this.keys['s'] || this.keys['arrowdown']) cam.position.addScaledVector(forward, -speed * deltaTime);
    if (this.keys['a'] || this.keys['arrowleft']) cam.position.addScaledVector(right, -speed * deltaTime);
    if (this.keys['d'] || this.keys['arrowright']) cam.position.addScaledVector(right, speed * deltaTime);
    if (this.keys['q'] || this.keys[' ']) cam.position.y += speed * deltaTime;
    if (this.keys['e']) cam.position.y -= speed * deltaTime;

    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // Save camera orientation in static variables so they persist if we rebuild
    PreviewMode.lastPitch = this.pitch;
    PreviewMode.lastYaw = this.yaw;
  }

  public cleanup() {
    this.clearEnvironment();
    this.vehicle.mesh.visible = true;
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
  }

  public reset() {
    this.init();
  }
}
