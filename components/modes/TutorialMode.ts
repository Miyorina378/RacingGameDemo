import * as THREE from 'three';
import { BaseMode } from './BaseMode';
import { Ramp } from '../objects/Ramp';
import { Crystal } from '../objects/Crystal';

export class TutorialMode extends BaseMode {
  private ramp: Ramp | null = null;
  private crystal: Crystal | null = null;

  public init() {
    this.clearEnvironment();
    this.particles.clear();
    
    // Start slightly forward facing ahead
    this.vehicle.reset(new THREE.Vector3(0, 0.5, 30), 0);

    this.createGridFloor();

    // Spawn 1 ramp directly ahead at Z = -45
    this.ramp = new Ramp(new THREE.Vector3(0, 0, -45));
    this.environmentGroup.add(this.ramp.mesh);

    // Spawn 1 crystal far behind the ramp at Z = -110
    this.crystal = new Crystal(new THREE.Vector3(0, 1.2, -110), 200); // 200 credits reward
    this.environmentGroup.add(this.crystal.mesh);

    // Tutorial mode starts playing immediately without countdown timer
    this.engine.callbacks.onGameStatus('playing');
  }

  public update(deltaTime: number) {
    this.updateScrollingFloor();

    // Standard physics updates (active keyboard keys)
    this.vehicle.update(deltaTime, this.keys);

    // Tire smoke sparks
    if (this.vehicle.isDrifting) {
      this.particles.emitSmoke(this.vehicle.mesh.matrixWorld);
    }
    
    // Jet exhausts
    if (Math.abs(this.vehicle.speed) > 20 && (this.keys['w'] || this.keys['arrowup'])) {
      this.particles.emitBoosters(this.vehicle.mesh.matrixWorld, this.vehicle.yaw, this.vehicle.speed, this.vehicle.boosterColor);
    }
    this.particles.update(deltaTime);

    // Check ramp interactions
    let onRamp = false;
    if (this.ramp) {
      const collision = this.ramp.checkCollision(this.vehicle.pos);
      if (collision.isOnRamp) {
        onRamp = true;
        if (this.vehicle.isGrounded) {
          this.vehicle.pos.y = collision.rampHeight;
          this.vehicle.pitch = collision.slantAngle;
          
          if (collision.progress > 0.95 && this.vehicle.speed > 15) {
            this.vehicle.isGrounded = false;
            this.vehicle.yVelocity = this.vehicle.speed * Math.sin(-collision.slantAngle) * 0.95 + 3.0;
          }
        }
      }
    }

    if (!onRamp && this.vehicle.isGrounded && this.vehicle.pos.y > 0) {
      this.vehicle.isGrounded = false;
      this.vehicle.yVelocity = 0;
    }

    // Check crystal collections
    if (this.crystal && this.crystal.checkCollection(this.vehicle.pos)) {
      this.particles.emitSparks(15, this.crystal.pos, 0xfacc15);
      this.scene.remove(this.crystal.mesh);
      // Success will trigger automatically from React's step-5 checker, which monitors crystalCollected status
    }

    if (this.crystal) {
      this.crystal.update(deltaTime);
    }
  }

  // Exports status variables to sync React tutorial steps
  public getTutorialStatus() {
    const turnKeyPressed = 
      this.keys['a'] || 
      this.keys['d'] || 
      this.keys['arrowleft'] || 
      this.keys['arrowright'];

    return {
      turnKeyPressed: !!turnKeyPressed,
      isDrifting: this.vehicle.isDrifting,
      isGrounded: this.vehicle.isGrounded,
      carPosY: this.vehicle.pos.y,
      crystalCollected: !this.crystal || !this.crystal.active
    };
  }

  public cleanup() {
    this.clearEnvironment();
    if (this.crystal) this.scene.remove(this.crystal.mesh);
    this.ramp = null;
    this.crystal = null;
  }

  public reset() {
    this.init();
  }
}
