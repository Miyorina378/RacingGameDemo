/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Headless gradient harness. Run with:  npx tsx scripts/slope-check.ts
 *
 * Everything about driving on ground that is not flat, on clean analytic ramps so
 * nothing here depends on track geometry or terrain sampling:
 *
 *   1. how the four corner loads sit on a tilted surface  — a car standing on a
 *      slope must still carry its normal static split, front to rear and side to
 *      side. Getting this wrong starves the driven axle and there is nothing the
 *      rest of the model can do about it.
 *   2. what every car in the database can climb        — gradeability
 *   3. pulling away, and recovering a roll-back        — hill starts
 *   4. cornering on a climb and across a camber        — turn-in on a slope
 *
 * Dev tool only, not shipped and not imported by the app.
 */
import * as THREE from 'three';
import { Vehicle } from '../components/objects/Vehicle';
import { CARS_DATABASE } from '../components/config/CarDatabase';

// GLTF models cannot load in Node, and the body mesh is irrelevant to physics.
(Vehicle.prototype as any).buildGltfMesh = function () {
  (this as any).buildProceduralMesh();
};

const DT = 1 / 60;
const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * A car on a perfectly smooth ramp. `climbDeg` tilts the ground up toward +z, so a
 * car at yaw 0 faces uphill; `camberDeg` tilts it up toward +x, across the car.
 */
const onRamp = (carId: string, climbDeg: number, camberDeg = 0) => {
  const climb = Math.tan(rad(climbDeg));
  const camber = Math.tan(rad(camberDeg));
  const height = (x: number, z: number) => z * climb + x * camber;
  const car = new Vehicle(carId, '#ff0000') as any;
  car.getGroundHeight = (x: number, z: number) => height(x, z);
  car.getSlopeHeight = (x: number, z: number) => height(x, z);
  car.isOnGrass = () => false;
  car.reset(new THREE.Vector3(0, 0, 0), 0);
  return car;
};

const drive = (car: any, keys: Record<string, number>, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) car.update(DT, keys);
};

const failures: string[] = [];

// ------------------------------------------------------------------ 1. loads
// A car does not lean into a hill; it sits parallel to it. Every spring keeps its
// static load, so the split must not move with the angle. When this drifts, the
// driven axle loses its grip and the car cannot climb, corner, or pull away.
console.log('--- standing on a tilted surface: where the weight sits ---');
console.log('  tilt | front/rear split | left/right split | total');
for (const tilt of [0, 5, 10, 15, 20]) {
  const climbing = onRamp('ford_gt_2006', tilt);
  const cambered = onRamp('ford_gt_2006', 0, tilt);
  drive(climbing, {}, 3);
  drive(cambered, {}, 3);

  const axle = (car: any) => {
    const c = car.suspensionOutput.corners;
    const front = c.frontLeft.normalLoad + c.frontRight.normalLoad;
    const rear = c.rearLeft.normalLoad + c.rearRight.normalLoad;
    return { front, rear, total: front + rear };
  };
  const side = (car: any) => {
    const c = car.suspensionOutput.corners;
    const left = c.frontLeft.normalLoad + c.rearLeft.normalLoad;
    const right = c.frontRight.normalLoad + c.rearRight.normalLoad;
    return { left, right, total: left + right };
  };

  const a = axle(climbing);
  const s = side(cambered);
  const frontPct = (100 * a.front) / a.total;
  const leftPct = (100 * s.left) / s.total;
  console.log(
    `  ${String(tilt).padStart(2)}deg |      ${frontPct.toFixed(0)} / ${(100 - frontPct).toFixed(0)}      |` +
      `      ${leftPct.toFixed(0)} / ${(100 - leftPct).toFixed(0)}      | ${(a.total / 1000).toFixed(1)} kN`
  );

  // A rear-drive car with nothing on the rear axle cannot move. Allow the real
  // shift a slope causes, but nothing like an axle emptying out.
  if (frontPct > 70 || frontPct < 30) {
    failures.push(`front/rear split is ${frontPct.toFixed(0)}/${(100 - frontPct).toFixed(0)} on a ${tilt}deg climb`);
  }
  if (leftPct > 65 || leftPct < 35) {
    failures.push(`left/right split is ${leftPct.toFixed(0)}/${(100 - leftPct).toFixed(0)} on a ${tilt}deg camber`);
  }
}
console.log('');

// ---------------------------------------------------------- 2. gradeability
// Every car, standing start, full throttle, 25 seconds. A road car manages 10deg
// (18%) without thinking about it; 20deg (36%) is a wall and is meant to be.
console.log('--- what each car can climb (km/h after 25s from a standing start) ---');
const GRADES = [0, 5, 10, 15, 20];
console.log('  car'.padEnd(26) + GRADES.map((g) => `${g}deg`.padStart(8)).join(''));
for (const config of CARS_DATABASE) {
  const speeds = GRADES.map((g) => {
    const car = onRamp(config.id, g);
    drive(car, { throttleAnalog: 1 }, 25);
    return car.speed * 3.6;
  });
  console.log(
    `  ${config.brand} ${config.name}`.slice(0, 25).padEnd(26) +
      speeds.map((s) => s.toFixed(0).padStart(8)).join('')
  );
  // 10 degrees is the line: below it, something in the drivetrain is broken
  // rather than the hill being hard.
  if (speeds[2] < 20) {
    failures.push(`${config.brand} ${config.name} manages only ${speeds[2].toFixed(0)} km/h up a 10deg grade`);
  }
}
console.log('');

// ------------------------------------------------------------ 3. hill starts
console.log('--- hill starts (km/h after 20s of full throttle) ---');
for (const gradeDeg of [5, 10, 15]) {
  const fromRest = onRamp('ford_gt_2006', gradeDeg);
  drive(fromRest, { throttleAnalog: 1 }, 20);

  const rollingBack = onRamp('ford_gt_2006', gradeDeg);
  rollingBack.setForwardSpeed(-5 / 3.6);
  drive(rollingBack, { throttleAnalog: 1 }, 20);

  console.log(
    `  ${String(gradeDeg).padStart(2)}deg: from rest ${(fromRest.speed * 3.6).toFixed(0).padStart(4)} km/h | ` +
      `already rolling back at 5 km/h ${(rollingBack.speed * 3.6).toFixed(0).padStart(4)} km/h`
  );
  if (rollingBack.speed * 3.6 < 5) {
    failures.push(`cannot recover a roll-back on a ${gradeDeg}deg grade`);
  }
}
console.log('');

// --------------------------------------------------------- 4. turn-in on tilt
// Steering has to keep working when the ground is not level. Held at full lock
// from 90 km/h, the car should come round on a slope much as it does on the flat.
console.log('--- full lock for 4s from 90 km/h ---');
const cornerCases: Array<{ label: string; climb: number; camber: number }> = [
  { label: 'flat', climb: 0, camber: 0 },
  { label: 'climbing 10deg', climb: 10, camber: 0 },
  { label: 'descending 10deg', climb: -10, camber: 0 },
  { label: 'cambered 10deg', climb: 0, camber: 10 }
];
let flatTurn = 0;
for (const c of cornerCases) {
  const car = onRamp('ford_gt_2006', c.climb, c.camber);
  car.setForwardSpeed(90 / 3.6);
  const startYaw = car.yaw;
  let peakLat = 0;
  for (let i = 0; i < 60 * 4; i++) {
    car.update(DT, { throttleAnalog: 0.3, steerAnalog: 1 } as any);
    peakLat = Math.max(peakLat, Math.abs(car.lateralAccel) / 9.81);
  }
  const turned = deg(car.yaw - startYaw);
  if (c.label === 'flat') flatTurn = turned;
  console.log(
    `  ${c.label.padEnd(17)} turned ${turned.toFixed(0).padStart(4)}deg | peak lateral ${peakLat.toFixed(2)}g | ` +
      `exit ${(car.speed * 3.6).toFixed(0)} km/h`
  );
  if (Math.abs(turned) < Math.abs(flatTurn) * 0.6) {
    failures.push(`only turns ${turned.toFixed(0)}deg ${c.label}, against ${flatTurn.toFixed(0)}deg on the flat`);
  }
}
console.log('');

if (failures.length === 0) {
  console.log('PASS: the car carries its weight, climbs, pulls away and turns on a slope.');
} else {
  console.log('FAIL:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
