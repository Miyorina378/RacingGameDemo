/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Headless vehicle-physics harness. Run with:  npx tsx scripts/physics-check.ts
 *
 * Drives real Vehicle instances with scripted inputs and prints behaviour that should
 * hold for any plausible car: framerate independence, braking distance, steady-state
 * cornering grip, whether downforce does anything, whether slides are recoverable, and
 * that no state ever goes non-finite. Dev tool only, not shipped and not imported by
 * the app; it reaches into private fields deliberately, hence the disable above.
 */
import * as THREE from 'three';
import { Vehicle } from '../components/objects/Vehicle';

type Keys = { [k: string]: boolean | number | undefined };

// GLTF models cannot load in Node, and the mesh is irrelevant to physics, so route
// every car through the procedural body.
(Vehicle.prototype as any).buildGltfMesh = function () {
  (this as any).buildProceduralMesh();
};

function makeCar(carId = 'starter'): Vehicle {
  const v = new Vehicle(carId, '#ff0000');
  v.getGroundHeight = () => 0;
  v.isOnGrass = () => false;
  v.reset(new THREE.Vector3(0, 0, 0), 0);
  return v;
}

function run(v: Vehicle, keys: Keys, seconds: number, fps: number) {
  const dt = 1 / fps;
  const steps = Math.round(seconds * fps);
  for (let i = 0; i < steps; i++) v.update(dt, keys);
}

function kph(v: Vehicle) {
  return v.speed * 3.6;
}

const results: string[] = [];
const log = (s: string) => {
  results.push(s);
  console.log(s);
};

// ---------------------------------------------------------------- acceleration
{
  const v = makeCar();
  const dt = 1 / 120;
  let t = 0;
  let to100 = -1;
  while (t < 30) {
    v.update(dt, { w: true });
    t += dt;
    if (to100 < 0 && kph(v) >= 100) to100 = t;
  }
  log(`accel: 0-100 km/h in ${to100.toFixed(2)} s, top after 30 s = ${kph(v).toFixed(1)} km/h`);
}

// ------------------------------------------------------- framerate independence
{
  const fpsList = [30, 60, 120, 144];
  const out: string[] = [];
  for (const fps of fpsList) {
    const v = makeCar();
    let substeps = 0;
    const stepFn = (v as any).stepPhysics;
    if (typeof stepFn === 'function') {
      const orig = stepFn.bind(v);
      (v as any).stepPhysics = (...a: any[]) => { substeps++; return orig(...a); };
    }
    run(v, { w: true }, 8, fps);
    out.push(
      `${fps}fps -> ${kph(v).toFixed(2)} km/h [${substeps} steps, gear ${v.currentGear}, rpm ${v.rpm.toFixed(0)}]`
    );
  }
  log(`framerate (8 s full throttle):\n  ${out.join('\n  ')}`);
}

// ----------------------------------------------------------- braking distance
{
  const v = makeCar();
  run(v, { w: true }, 20, 120);
  const startSpeed = kph(v);
  const x0 = v.pos.x, z0 = v.pos.z;
  let t = 0;
  const dt = 1 / 120;
  while (v.speed > 0.5 && t < 20) {
    v.update(dt, { s: true });
    t += dt;
  }
  const dist = Math.hypot(v.pos.x - x0, v.pos.z - z0);
  log(
    `brake: ${startSpeed.toFixed(1)} km/h -> stop in ${dist.toFixed(1)} m over ${t.toFixed(2)} s ` +
    `(avg ${((startSpeed / 3.6) / t / 9.81).toFixed(2)} g), brake temp F=${v.brakeTemperatureFront.toFixed(0)} C`
  );
}

// ------------------------------------------------------ steady-state cornering
{
  const v = makeCar();
  run(v, { w: true }, 12, 120);
  const entry = kph(v);
  run(v, { w: true, d: true }, 4, 120);
  const latG = Math.abs(v.speed * v.yawRate) / 9.81;
  log(
    `corner: entry ${entry.toFixed(0)} km/h -> ${kph(v).toFixed(0)} km/h, ` +
    `yawRate ${v.yawRate.toFixed(3)} rad/s, lat ${latG.toFixed(2)} g, ` +
    `drift ${(v.driftAngle * 57.3).toFixed(1)} deg, spinning=${v.isSpinning}`
  );
}

// --------------------------------------------------- cornering costs you speed
{
  const straight = makeCar();
  run(straight, { w: true }, 12, 120);
  run(straight, {}, 3, 120);

  const turning = makeCar();
  run(turning, { w: true }, 12, 120);
  run(turning, { d: true }, 3, 120);

  log(
    `coast 3 s: straight ${kph(straight).toFixed(1)} km/h vs steered ${kph(turning).toFixed(1)} km/h ` +
    `(cornering drag = ${(kph(straight) - kph(turning)).toFixed(1)} km/h)`
  );
}

// ------------------------------------------------------------- low-speed grip
{
  const v = makeCar();
  run(v, { w: true }, 2, 120);
  const before = kph(v);
  run(v, { w: true, d: true }, 2.5, 120);
  log(
    `slow corner: ${before.toFixed(1)} -> ${kph(v).toFixed(1)} km/h, ` +
    `yawRate ${v.yawRate.toFixed(3)}, drift ${(v.driftAngle * 57.3).toFixed(1)} deg`
  );
}

// ------------------------------------------------------ standstill must settle
{
  const v = makeCar();
  run(v, {}, 3, 120);
  log(
    `parked 3 s: speed ${kph(v).toFixed(4)} km/h, groundSpeed ${v.groundSpeed.toFixed(4)}, ` +
    `pos drift ${Math.hypot(v.pos.x, v.pos.z).toFixed(4)} m`
  );
}

// ------------------------------------------------------------------- burnout
{
  const v = makeCar();
  run(v, { w: true }, 1.5, 120);
  log(
    `launch: speed ${kph(v).toFixed(1)} km/h, rear wheel speed ${v.rearWheelSpeed.toFixed(1)} m/s, ` +
    `slip ratio ~${((v.rearWheelSpeed - v.speed) / Math.max(Math.abs(v.speed), 2)).toFixed(2)}`
  );
}

// ------------------------------------------------- handbrake flick + recovery
{
  for (const hold of [0.25, 0.5, 1.5]) {
    const v = makeCar();
    run(v, { w: true }, 12, 120);
    run(v, { ' ': true, d: true }, hold, 120);
    const peak = v.yawRate;
    const driftAtRelease = v.driftAngle * 57.3;
    // Release handbrake, countersteer, mild throttle: can the driver save it?
    run(v, { w: 0.3, a: true }, 2.0, 120);
    log(
      `handbrake ${hold}s hold: peak yaw ${peak.toFixed(2)} rad/s, drift ${driftAtRelease.toFixed(0)} deg ` +
      `-> after 2 s countersteer: yaw ${v.yawRate.toFixed(2)}, drift ${(v.driftAngle * 57.3).toFixed(0)} deg, ` +
      `spinning=${v.isSpinning}, speed ${kph(v).toFixed(0)} km/h`
    );
  }
}

// ------------------------------------------------------------- ABS must matter
{
  const stop = (abs: boolean, brakeLevel: number) => {
    const v = makeCar();
    v.upgrades.brake.hasABS = abs;
    v.upgrades.brake.level = brakeLevel;
    run(v, { w: true }, 20, 120);
    const start = v.speed;
    const x0 = v.pos.x, z0 = v.pos.z;
    let t = 0;
    while (v.speed > 0.5 && t < 20) { v.update(1 / 120, { s: true, d: 0.4 }); t += 1 / 120; }
    return {
      dist: Math.hypot(v.pos.x - x0, v.pos.z - z0),
      start: start * 3.6,
      yaw: Math.abs(v.yaw)
    };
  };
  const noAbs = stop(false, 0);
  const withAbs = stop(true, 0);
  log(
    `braking while steering from ~${noAbs.start.toFixed(0)} km/h: ` +
    `no ABS ${noAbs.dist.toFixed(1)} m (turned ${(noAbs.yaw * 57.3).toFixed(0)} deg) | ` +
    `ABS ${withAbs.dist.toFixed(1)} m (turned ${(withAbs.yaw * 57.3).toFixed(0)} deg)`
  );
}

// ---------------------------------------------------------------- brake fade
{
  const v = makeCar();
  const temps: number[] = [];
  for (let stopNumber = 0; stopNumber < 6; stopNumber++) {
    run(v, { w: true }, 14, 120);
    let t = 0;
    while (v.speed > 3 && t < 12) { v.update(1 / 120, { s: true }); t += 1 / 120; }
    temps.push(v.brakeTemperatureFront);
  }
  log(`brake temp over 6 back-to-back stops: ${temps.map(t => t.toFixed(0)).join(' -> ')} C`);
}

// ------------------------------------------- powerful car: wheelspin & donuts
{
  const v = makeCar('ford_gt_2006');
  v.getGroundHeight = () => 0;
  v.isOnGrass = () => false;
  run(v, { w: true }, 1.2, 120);
  log(
    `hi-po launch: speed ${kph(v).toFixed(1)} km/h, rear wheel ${v.rearWheelSpeed.toFixed(1)} m/s, ` +
    `slip ratio ${((v.rearWheelSpeed - v.speed) / Math.max(Math.abs(v.speed), 2)).toFixed(2)}`
  );

  const donut = makeCar('ford_gt_2006');
  donut.getGroundHeight = () => 0;
  donut.isOnGrass = () => false;
  run(donut, { w: true, d: true }, 4, 120);
  log(
    `hi-po power-on cornering: speed ${kph(donut).toFixed(0)} km/h, yaw ${donut.yawRate.toFixed(2)}, ` +
    `drift ${(donut.driftAngle * 57.3).toFixed(0)} deg, rear slip ratio ` +
    `${((donut.rearWheelSpeed - donut.speed) / Math.max(Math.abs(donut.speed), 2)).toFixed(2)}`
  );
}

// ----------------------------- aero: downforce must raise grip with speed
// A gentle, sustained steer input -- the only valid way to read steady-state grip.
// Holding full lock at 250 km/h spins any car, real or simulated.
{
  const sweep = (carId: string, cruiseSeconds: number, steer: number, cl?: number) => {
    const v = makeCar(carId);
    v.upgrades.tireCompound = 'sport' as never;
    (v as any).tireState.compound = 'sport';
    if (cl !== undefined) v.liftCoefficient = cl;
    run(v, { w: true }, cruiseSeconds, 120);
    const entry = kph(v);
    run(v, { throttleAnalog: 0.55, steerAnalog: steer }, 2.5, 120);
    return {
      entry,
      speed: kph(v),
      latG: Math.abs(v.speed * v.yawRate) / 9.81,
      frontSlip: (v as any).relaxedFrontSlipAngle as number,
      spinning: v.isSpinning
    };
  };

  const slow = sweep('ford_gt_2006', 6, -0.30);
  const fast = sweep('ford_gt_2006', 40, -0.14);
  const fastNoAero = sweep('ford_gt_2006', 40, -0.14, 0.02);
  log(
    `aero: ${slow.speed.toFixed(0)} km/h lat ${slow.latG.toFixed(2)} g | ` +
    `${fast.speed.toFixed(0)} km/h lat ${fast.latG.toFixed(2)} g with downforce | ` +
    `${fastNoAero.speed.toFixed(0)} km/h lat ${fastNoAero.latG.toFixed(2)} g downforce removed`
  );
  log(
    `   front slip angles: ${(slow.frontSlip * 57.3).toFixed(1)} / ${(fast.frontSlip * 57.3).toFixed(1)} deg, ` +
    `spinning ${slow.spinning}/${fast.spinning}`
  );
}

// ---------------------------------------- high-speed stability (must not spin)
{
  const v = makeCar('ford_gt_2006');
  v.upgrades.tireCompound = 'sport' as never;
  (v as any).tireState.compound = 'sport';
  run(v, { w: true }, 25, 120);
  const entry = kph(v);
  let maxYaw = 0;
  let everSpun = false;
  // Slalom: alternate moderate steer every 0.8 s at speed, throttle held.
  for (let leg = 0; leg < 8; leg++) {
    const dir = leg % 2 === 0 ? -0.4 : 0.4;
    for (let i = 0; i < 96; i++) {
      v.update(1 / 120, { throttleAnalog: 0.7, steerAnalog: dir });
      maxYaw = Math.max(maxYaw, Math.abs(v.yawRate));
      everSpun = everSpun || v.isSpinning;
    }
  }
  log(
    `slalom from ${entry.toFixed(0)} km/h: ended ${kph(v).toFixed(0)} km/h, peak yaw ${maxYaw.toFixed(2)} rad/s, ` +
    `drift ${(v.driftAngle * 57.3).toFixed(0)} deg, ever spun = ${everSpun}`
  );
}

// ------------------------------------------------ all drive types must behave
{
  // starter = FWD, sport = RWD, super = AWD, cybertruck = AWD electric truck.
  for (const carId of ['starter', 'sport', 'super', 'cybertruck']) {
    const v = makeCar(carId);
    v.upgrades.tireCompound = 'sport' as never;
    (v as any).tireState.compound = 'sport';
    run(v, { w: true }, 10, 120);
    const straight = kph(v);
    // A moderate, sustained steer input. Full lock at 100+ km/h asks for a corner no
    // car can take and only measures how it loses control.
    run(v, { throttleAnalog: 0.6, steerAnalog: -0.25 }, 3, 120);
    const latG = Math.abs(v.speed * v.yawRate) / 9.81;
    log(
      `${carId.padEnd(11)} (${v.driveType}): ${straight.toFixed(0)} km/h straight -> ` +
      `cornering ${kph(v).toFixed(0)} km/h, lat ${latG.toFixed(2)} g, ` +
      `drift ${(v.driftAngle * 57.3).toFixed(0)} deg, spun ${v.isSpinning}, ` +
      `Fwheel ${v.frontWheelSpeed.toFixed(1)} Rwheel ${v.rearWheelSpeed.toFixed(1)}`
    );
  }
}

// --------------------------------------------------------------- NaN sweep
{
  const v = makeCar();
  const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for (let i = 0; i < 6000; i++) {
    v.update(1 / 120, {
      throttleAnalog: rnd(),
      reverseAnalog: rnd() > 0.7 ? rnd() : 0,
      steerAnalog: rnd() * 2 - 1,
      ' ': rnd() > 0.92
    });
  }
  const bad = [
    ['speed', v.speed], ['yaw', v.yaw], ['yawRate', v.yawRate],
    ['posX', v.pos.x], ['posZ', v.pos.z], ['rpm', v.rpm],
    ['frontWheelSpeed', v.frontWheelSpeed], ['rearWheelSpeed', v.rearWheelSpeed],
    ['brakeTempF', v.brakeTemperatureFront]
  ].filter(([, n]) => !Number.isFinite(n as number));
  log(
    `random 50 s: ${bad.length === 0 ? 'all state finite' : 'NON-FINITE: ' + JSON.stringify(bad)}` +
    `, speed ${kph(v).toFixed(1)} km/h, brakeTempF ${v.brakeTemperatureFront.toFixed(0)} C`
  );
}

