import * as THREE from 'three';
import { BaseMode } from './BaseMode';
import { Obstacle } from '../objects/Obstacle';
import { Ramp } from '../objects/Ramp';
import { Crystal } from '../objects/Crystal';

export class FreeRoamMode extends BaseMode {
  private buildings: Obstacle[] = [];
  private ramps: Ramp[] = [];
  private crystals: Crystal[] = [];

  // For collision bounce cooldowns
  private collisionCooldown = 0;

  public init() {
    this.clearEnvironment();
    this.particles.clear();
    
    // Position car facing backwards to admire the background sun
    this.vehicle.reset(new THREE.Vector3(0, 0, 0), Math.PI);

    // Create standard neon grid floor & sun
    this.createGridFloor();

    // Spawn 45 skyscrapers
    this.buildings = [];
    for (let i = 0; i < 45; i++) {
      let x = (Math.random() - 0.5) * 260;
      let z = (Math.random() - 0.5) * 260;
      
      // Avoid spawning directly on top of the starting pedestal
      if (Math.abs(x) < 25) x += x > 0 ? 25 : -25;
      if (Math.abs(z) < 25) z += z > 0 ? 25 : -25;

      const building = new Obstacle(new THREE.Vector3(x, 0, z), true);
      this.environmentGroup.add(building.mesh);
      this.buildings.push(building);
    }

    // Spawn 5 Ramps
    this.ramps = [];
    const rampPositions = [
      new THREE.Vector3(0, 0, -40),
      new THREE.Vector3(45, 0, 60),
      new THREE.Vector3(-60, 0, -80),
      new THREE.Vector3(90, 0, -30),
      new THREE.Vector3(-75, 0, 45)
    ];
    rampPositions.forEach(pos => {
      const ramp = new Ramp(pos);
      this.environmentGroup.add(ramp.mesh);
      this.ramps.push(ramp);
    });

    // Spawn 25 Crystals
    this.crystals = [];
    for (let i = 0; i < 25; i++) {
      const x = (Math.random() - 0.5) * 260;
      const z = (Math.random() - 0.5) * 260;
      // Hover height
      const y = 1.0 + Math.random() * 2.0;

      const crystal = new Crystal(new THREE.Vector3(x, y, z));
      this.environmentGroup.add(crystal.mesh);
      this.crystals.push(crystal);
    }

    // Let React UI know
    this.engine.callbacks.onGameStatus('playing', 'Explore the world! Collect crystals and drift for points.');
  }

  public update(deltaTime: number) {
    // 1. Grid scroll repositioning
    this.updateScrollingFloor();

    // 2. Cooldown timer for crashes
    if (this.collisionCooldown > 0) {
      this.collisionCooldown -= deltaTime;
    }

    // 3. Movement update
    const previousPos = this.vehicle.pos.clone();
    this.vehicle.update(deltaTime, this.keys);

    // 4. Drift point accumulation & smoke
    if (this.vehicle.isDrifting) {
      this.particles.emitSmoke(this.vehicle.mesh.matrixWorld);
      this.accumulateDriftingPoints(deltaTime);
    } else {
      this.finishDriftCheck();
    }

    // 5. Fire boosters at high speed throttle
    if (Math.abs(this.vehicle.speed) > 20 && (this.keys['w'] || this.keys['arrowup'])) {
      this.particles.emitBoosters(this.vehicle.mesh.matrixWorld, this.vehicle.yaw, this.vehicle.speed, this.vehicle.boosterColor);
    }

    // 6. Update visual particles
    this.particles.update(deltaTime);

    // 7. Ramp physics interaction
    let onAnyRamp = false;
    for (const ramp of this.ramps) {
      const collision = ramp.checkCollision(this.vehicle.pos);
      if (collision.isOnRamp) {
        onAnyRamp = true;
        
        // If car was airborne, don't land until we slide off or fall
        if (this.vehicle.isGrounded) {
          this.vehicle.pos.y = collision.rampHeight;
          this.vehicle.pitch = collision.slantAngle;
          
          // Launch off the lip of the ramp!
          if (collision.progress > 0.95 && this.vehicle.speed > 15) {
            this.vehicle.isGrounded = false;
            // Launch velocity based on speed and slant angle
            this.vehicle.yVelocity = this.vehicle.speed * Math.sin(-collision.slantAngle) * 0.95 + 3.0;
          }
        }
        break;
      }
    }

    // Fall back to ground level if not on any ramp and grounded
    if (!onAnyRamp && this.vehicle.isGrounded) {
      if (this.vehicle.pos.y > 0) {
        // Slid off the side or back, make airborne
        this.vehicle.isGrounded = false;
        this.vehicle.yVelocity = 0;
      }
    }

    // 8. Obstacle collision detection (Bounce back)
    if (this.collisionCooldown <= 0) {
      for (const building of this.buildings) {
        if (building.checkCollision(this.vehicle.pos)) {
          // Bounce back to previous position
          this.vehicle.pos.copy(previousPos);
          
          // Emit sparks
          this.particles.emitSparks(15, this.vehicle.pos, 0xff00ff);
          
          // Reduce speed significantly and reverse direction
          this.vehicle.speed = -this.vehicle.speed * 0.4;
          this.collisionCooldown = 0.5; // half second immunity
          
          // Reset drift multiplier
          this.vehicle.isDrifting = false;
          this.finishDriftCheck();
          break;
        }
      }
    }

    // 9. Collect crystals
    for (const crystal of this.crystals) {
      if (crystal.checkCollection(this.vehicle.pos)) {
        // Play pickup sparks
        this.particles.emitSparks(10, crystal.pos, 0xfacc15);
        this.scene.remove(crystal.mesh);
        
        // Award credits to player
        this.engine.addCredits(crystal.value);
      }
      crystal.update(deltaTime);
    }
  }

  private accumulateDriftingPoints(deltaTime: number) {
    const points = Math.round(Math.abs(this.vehicle.speed) * Math.abs(this.vehicle.driftAngle) * 5 * deltaTime);
    if (points > 0) {
      this.engine.accumulateDrift(points);
    }
  }

  private finishDriftCheck() {
    this.engine.finishDrift(this.vehicle.isDrifting);
  }

  public cleanup() {
    this.clearEnvironment();
    this.crystals.forEach(c => this.scene.remove(c.mesh));
    this.buildings.forEach(b => this.scene.remove(b.mesh));
    this.ramps.forEach(r => this.scene.remove(r.mesh));
    this.crystals = [];
    this.buildings = [];
    this.ramps = [];
  }

  public reset() {
    this.init();
  }
}
