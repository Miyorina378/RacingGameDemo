import * as THREE from 'three';

/**
 * Gran Turismo style replay director.
 *
 * A broadcast replay is not one camera glued behind the car. It is a cut list:
 * mostly static trackside cameras on long lenses that pan as the car arrives and
 * leaves, punctuated by cranes, a low chase, a helicopter, a passing dolly and
 * the occasional onboard. This class owns that cut list and the framing rules,
 * and only ever reads the replay state it is handed.
 */

export interface ReplayCameraTrack {
  /** Canonical closed centreline of the active course. */
  path: THREE.Vector3[];
  /** Half extent of the road plus verge, used to stand cameras clear of the track. */
  boundary: number;
  getGroundHeight?: (x: number, z: number, yHint?: number) => number;
}

/** Anything with a transform the director can frame, including Vehicle. */
export interface ReplayCameraActor {
  pos: THREE.Vector3;
  yaw: number;
  speed: number;
}

type ShotType =
  | 'trackside'
  | 'crane'
  | 'chase'
  | 'helicopter'
  | 'dolly'
  | 'onboard'
  | 'battle';

interface TracksideAnchor {
  position: THREE.Vector3;
  distanceAlong: number;
  crane: boolean;
}

interface ActiveShot {
  type: ShotType;
  duration: number;
  anchor?: TracksideAnchor;
  side: number;
  height: number;
  distance: number;
  drift: number;
}

interface PathProjection {
  distanceAlong: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
}

interface Framing {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
  /** Static shots pan instead of flying, so their position must not be smoothed. */
  anchored: boolean;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CAR_LENGTH = 4.8;

export class ReplayCameraDirector {
  private path: THREE.Vector3[] = [];
  private cumulativeDistances: number[] = [];
  private segmentLengths: number[] = [];
  private totalLength = 0;
  private boundary = 12;
  private getGroundHeight?: (x: number, z: number, yHint?: number) => number;
  private anchors: TracksideAnchor[] = [];

  private shot: ActiveShot | null = null;
  private shotTime = 0;
  private time = 0;
  private previousType: ShotType | null = null;
  private randomState = 0x9e3779b9;

  private cameraPosition = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private currentFov = 65;
  private currentRoll = 0;
  private hasFrame = false;

  private searchIndex = 0;
  private previousYaw = 0;
  private yawRate = 0;
  private hasYaw = false;

  /** Deterministic noise, so the same replay is always cut the same way. */
  private random(): number {
    this.randomState = (this.randomState + 0x6d2b79f5) | 0;
    let t = Math.imul(this.randomState ^ (this.randomState >>> 15), 1 | this.randomState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private randomBetween(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  public configure(track: ReplayCameraTrack | null): void {
    this.reset();

    if (!track || track.path.length < 4) {
      this.path = [];
      this.anchors = [];
      this.totalLength = 0;
      return;
    }

    const cleaned: THREE.Vector3[] = [];
    for (const point of track.path) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
        continue;
      }
      if (cleaned.length === 0 || cleaned[cleaned.length - 1].distanceToSquared(point) > 1e-6) {
        cleaned.push(point.clone());
      }
    }
    if (cleaned.length > 2 && cleaned[0].distanceToSquared(cleaned[cleaned.length - 1]) < 1e-4) {
      cleaned.pop();
    }
    if (cleaned.length < 4) {
      this.path = [];
      this.anchors = [];
      this.totalLength = 0;
      return;
    }

    this.path = cleaned;
    this.boundary = Math.max(8, track.boundary || 12);
    this.getGroundHeight = track.getGroundHeight;

    const count = this.path.length;
    this.segmentLengths = new Array(count).fill(0);
    this.cumulativeDistances = new Array(count).fill(0);
    this.totalLength = 0;
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      const length = Math.max(this.path[i].distanceTo(this.path[next]), 0.001);
      this.segmentLengths[i] = length;
      if (i < count - 1) {
        this.cumulativeDistances[i + 1] = this.cumulativeDistances[i] + length;
      }
      this.totalLength += length;
    }

    this.buildAnchors();
  }

  public reset(): void {
    this.shot = null;
    this.shotTime = 0;
    this.time = 0;
    this.previousType = null;
    this.randomState = 0x9e3779b9;
    this.hasFrame = false;
    this.searchIndex = 0;
    this.yawRate = 0;
    this.hasYaw = false;
    this.currentRoll = 0;
  }

  /** Stand a ring of camera positions around the course, alternating sides. */
  private buildAnchors(): void {
    this.anchors = [];
    if (this.totalLength <= 0) return;

    const spacing = THREE.MathUtils.clamp(this.totalLength / 20, 95, 230);
    let side = 1;

    for (let distance = 0; distance < this.totalLength; distance += spacing) {
      const sample = this.sampleAt(distance);
      // Mostly alternate sides so consecutive shots reverse the car's screen
      // direction, which is what stops a cut list feeling repetitive.
      if (this.random() > 0.22) side = -side;

      const crane = this.random() < 0.24;
      const lateral = crane
        ? this.boundary + this.randomBetween(12, 30)
        : this.boundary + this.randomBetween(6, 20);
      const height = crane
        ? this.randomBetween(14, 27)
        : this.randomBetween(3.4, 7.2);

      const position = sample.point
        .clone()
        .addScaledVector(sample.normal, side * lateral);
      position.y = this.groundAt(position.x, position.z, sample.point.y) + height;

      this.anchors.push({
        position,
        distanceAlong: this.normalizeDistance(distance),
        crane
      });
    }
  }

  private groundAt(x: number, z: number, yHint: number): number {
    if (!this.getGroundHeight) return yHint;
    const height = this.getGroundHeight(x, z, yHint);
    return Number.isFinite(height) ? height : yHint;
  }

  private normalizeDistance(distance: number): number {
    if (this.totalLength <= 0) return 0;
    const wrapped = distance % this.totalLength;
    return wrapped < 0 ? wrapped + this.totalLength : wrapped;
  }

  /** Signed shortest way round the loop from `from` to `to`. */
  private forwardGap(from: number, to: number): number {
    if (this.totalLength <= 0) return 0;
    return this.normalizeDistance(to - from);
  }

  private normalizeAngle(angle: number): number {
    return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
  }

  private segmentAt(distance: number): { index: number; fraction: number } {
    const wrapped = this.normalizeDistance(distance);
    const count = this.path.length;
    let low = 0;
    let high = count - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (this.cumulativeDistances[middle] <= wrapped) low = middle + 1;
      else high = middle - 1;
    }
    const index = THREE.MathUtils.clamp(low - 1, 0, count - 1);
    const start = this.cumulativeDistances[index] ?? 0;
    const length = this.segmentLengths[index] || 0.001;
    return {
      index,
      fraction: THREE.MathUtils.clamp((wrapped - start) / length, 0, 1)
    };
  }

  private sampleAt(distance: number): PathProjection {
    const { index, fraction } = this.segmentAt(distance);
    const next = (index + 1) % this.path.length;
    const point = new THREE.Vector3().lerpVectors(this.path[index], this.path[next], fraction);
    const tangent = new THREE.Vector3(
      this.path[next].x - this.path[index].x,
      0,
      this.path[next].z - this.path[index].z
    );
    if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
    tangent.normalize();
    return {
      distanceAlong: this.normalizeDistance(distance),
      point,
      tangent,
      normal: new THREE.Vector3(-tangent.z, 0, tangent.x)
    };
  }

  private projectSegment(index: number, position: THREE.Vector3): {
    fraction: number;
    distanceSq: number;
  } {
    const count = this.path.length;
    const from = this.path[index];
    const to = this.path[(index + 1) % count];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthSq = dx * dx + dz * dz;
    let fraction = 0;
    if (lengthSq > 1e-8) {
      fraction = THREE.MathUtils.clamp(
        ((position.x - from.x) * dx + (position.z - from.z) * dz) / lengthSq,
        0,
        1
      );
    }
    const px = from.x + dx * fraction;
    const pz = from.z + dz * fraction;
    const py = THREE.MathUtils.lerp(from.y, to.y, fraction);
    const offsetX = position.x - px;
    const offsetZ = position.z - pz;
    const offsetY = position.y - py;
    return {
      fraction,
      distanceSq: offsetX * offsetX + offsetZ * offsetZ + offsetY * offsetY * 1.5
    };
  }

  private project(position: THREE.Vector3): PathProjection {
    const count = this.path.length;
    let bestIndex = this.searchIndex;
    let bestFraction = 0;
    let bestDistanceSq = Infinity;

    const scan = (radius: number) => {
      for (let offset = -radius; offset <= radius; offset++) {
        const index = (this.searchIndex + offset + count) % count;
        const candidate = this.projectSegment(index, position);
        if (candidate.distanceSq < bestDistanceSq) {
          bestDistanceSq = candidate.distanceSq;
          bestIndex = index;
          bestFraction = candidate.fraction;
        }
      }
    };

    scan(Math.min(count - 1, 26));
    if (bestDistanceSq > 90 * 90) {
      bestDistanceSq = Infinity;
      for (let index = 0; index < count; index++) {
        const candidate = this.projectSegment(index, position);
        if (candidate.distanceSq < bestDistanceSq) {
          bestDistanceSq = candidate.distanceSq;
          bestIndex = index;
          bestFraction = candidate.fraction;
        }
      }
    }

    this.searchIndex = bestIndex;
    const distanceAlong =
      (this.cumulativeDistances[bestIndex] ?? 0) +
      (this.segmentLengths[bestIndex] ?? 0) * bestFraction;
    return this.sampleAt(distanceAlong);
  }

  private findNearestRival(
    subject: ReplayCameraActor,
    rivals: ReplayCameraActor[]
  ): { actor: ReplayCameraActor; distance: number } | null {
    let closest: ReplayCameraActor | null = null;
    let closestDistance = Infinity;
    for (const rival of rivals) {
      const distance = rival.pos.distanceTo(subject.pos);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = rival;
      }
    }
    return closest ? { actor: closest, distance: closestDistance } : null;
  }

  /** Pick a trackside camera the car is driving toward, not one it already passed. */
  private pickAnchor(subjectDistance: number, crane: boolean): TracksideAnchor | undefined {
    if (this.anchors.length === 0) return undefined;

    const candidates = this.anchors.filter((anchor) => {
      if (anchor.crane !== crane) return false;
      const gap = this.forwardGap(subjectDistance, anchor.distanceAlong);
      return gap > 60 && gap < 300;
    });
    const pool = candidates.length > 0
      ? candidates
      : this.anchors.filter((anchor) => {
          const gap = this.forwardGap(subjectDistance, anchor.distanceAlong);
          return gap > 45 && gap < 420;
        });
    if (pool.length === 0) return undefined;

    pool.sort(
      (a, b) =>
        this.forwardGap(subjectDistance, a.distanceAlong) -
        this.forwardGap(subjectDistance, b.distanceAlong)
    );
    const index = Math.min(pool.length - 1, Math.floor(this.random() * Math.min(3, pool.length)));
    return pool[index];
  }

  private startShot(
    subject: ReplayCameraActor,
    rivals: ReplayCameraActor[],
    projection: PathProjection
  ): void {
    const rival = this.findNearestRival(subject, rivals);
    const speed = Math.abs(subject.speed);

    const weights: Array<{ type: ShotType; weight: number }> = [
      { type: 'trackside', weight: this.anchors.length > 0 ? 4.2 : 0 },
      { type: 'crane', weight: this.anchors.some((a) => a.crane) ? 1.5 : 0 },
      { type: 'chase', weight: 1.5 },
      { type: 'helicopter', weight: 1.0 },
      { type: 'dolly', weight: this.path.length > 0 ? 1.4 : 0 },
      { type: 'onboard', weight: speed > 8 ? 1.1 : 0.3 },
      { type: 'battle', weight: rival && rival.distance < 26 ? 3.0 : 0 }
    ];

    // A cut back to the shot we just left reads as a mistake, so damp repeats.
    const total = weights.reduce(
      (sum, entry) => sum + (entry.type === this.previousType ? entry.weight * 0.2 : entry.weight),
      0
    );
    let roll = this.random() * Math.max(total, 0.0001);
    let chosen: ShotType = 'chase';
    for (const entry of weights) {
      const weight = entry.type === this.previousType ? entry.weight * 0.2 : entry.weight;
      if (weight <= 0) continue;
      roll -= weight;
      if (roll <= 0) {
        chosen = entry.type;
        break;
      }
    }

    let anchor: TracksideAnchor | undefined;
    if (chosen === 'trackside' || chosen === 'crane') {
      anchor = this.pickAnchor(projection.distanceAlong, chosen === 'crane');
      if (!anchor) chosen = 'dolly';
    }

    const durations: Record<ShotType, [number, number]> = {
      trackside: [3.4, 5.6],
      crane: [4.2, 6.2],
      chase: [2.8, 4.4],
      helicopter: [4.4, 6.4],
      dolly: [3.2, 4.8],
      onboard: [3.4, 5.0],
      battle: [3.2, 5.0]
    };
    const [minDuration, maxDuration] = durations[chosen];

    this.shot = {
      type: chosen,
      duration: this.randomBetween(minDuration, maxDuration),
      anchor,
      side: this.random() < 0.5 ? -1 : 1,
      height: this.randomBetween(0.85, 1.25),
      distance: this.randomBetween(0.85, 1.2),
      drift: this.randomBetween(-1, 1)
    };
    this.shotTime = 0;
    this.previousType = chosen;
    this.hasFrame = false;
  }

  private shouldCutEarly(
    shot: ActiveShot,
    subject: ReplayCameraActor,
    rivals: ReplayCameraActor[],
    projection: PathProjection
  ): boolean {
    if (shot.anchor) {
      const passed = this.forwardGap(shot.anchor.distanceAlong, projection.distanceAlong);
      const beyond = passed > 0 && passed < this.totalLength * 0.45;
      const passBy = shot.anchor.crane ? 110 : 70;
      if (beyond && passed > passBy) return true;
      if (subject.pos.distanceTo(shot.anchor.position) > 330) return true;
      return false;
    }
    if (shot.type === 'battle') {
      const rival = this.findNearestRival(subject, rivals);
      return !rival || rival.distance > 48;
    }
    return false;
  }

  /** Long lens when far, wide when the car is on top of the lens. */
  private framingFov(distance: number, coverage: number, min: number, max: number): number {
    const frameHeight = CAR_LENGTH / THREE.MathUtils.clamp(coverage, 0.05, 0.9);
    const fov = THREE.MathUtils.radToDeg(
      2 * Math.atan(frameHeight / (2 * Math.max(distance, 1)))
    );
    return THREE.MathUtils.clamp(fov, min, max);
  }

  private computeFraming(
    shot: ActiveShot,
    subject: ReplayCameraActor,
    rivals: ReplayCameraActor[],
    projection: PathProjection
  ): Framing {
    const forward = new THREE.Vector3(Math.sin(subject.yaw), 0, Math.cos(subject.yaw));
    const right = new THREE.Vector3(Math.cos(subject.yaw), 0, -Math.sin(subject.yaw));
    const speed = Math.abs(subject.speed);
    const lead = THREE.MathUtils.clamp(speed * 0.16, 0, 9);

    if (shot.anchor) {
      const position = shot.anchor.position.clone();
      const distance = position.distanceTo(subject.pos);
      // Lead the car only while it is far enough away for the pan to stay smooth.
      const leadScale = THREE.MathUtils.clamp((distance - 14) / 40, 0, 1);
      const target = subject.pos
        .clone()
        .addScaledVector(forward, lead * leadScale);
      target.y += 0.8;

      // A hint of operator float, so a static camera does not feel like a tripod
      // welded to the world.
      const wobble = Math.sin(this.time * 0.9 + shot.drift * 3) * 0.05;
      target.x += wobble;
      target.z += wobble * 0.6;

      return {
        position,
        target,
        fov: shot.anchor.crane
          ? this.framingFov(distance, 0.16, 26, 55)
          : this.framingFov(distance, 0.26, 22, 58),
        roll: 0,
        anchored: true
      };
    }

    if (shot.type === 'chase') {
      const back = 8.4 * shot.distance;
      const position = subject.pos
        .clone()
        .addScaledVector(forward, -back)
        .addScaledVector(right, shot.side * 1.8);
      position.y = Math.max(
        this.groundAt(position.x, position.z, subject.pos.y) + 1.05 * shot.height,
        subject.pos.y + 0.75
      );
      const target = subject.pos.clone().addScaledVector(forward, 7 + lead * 0.4);
      target.y += 0.85;
      return {
        position,
        target,
        fov: THREE.MathUtils.clamp(58 + speed * 0.16, 58, 76),
        roll: THREE.MathUtils.clamp(-this.yawRate * 0.16, -0.09, 0.09),
        anchored: false
      };
    }

    if (shot.type === 'helicopter') {
      const orbit = this.time * 0.14 * (shot.drift >= 0 ? 1 : -1);
      const back = 30 * shot.distance;
      const position = subject.pos
        .clone()
        .addScaledVector(forward, -back * Math.cos(orbit))
        .addScaledVector(right, back * 0.55 * Math.sin(orbit));
      position.y = this.groundAt(position.x, position.z, subject.pos.y) + 26 * shot.height;
      const target = subject.pos.clone().addScaledVector(forward, lead * 0.5);
      return {
        position,
        target,
        fov: this.framingFov(position.distanceTo(subject.pos), 0.13, 30, 55),
        roll: 0,
        anchored: false
      };
    }

    if (shot.type === 'dolly') {
      const lateral = (this.boundary + 9) * shot.distance;
      const position = subject.pos
        .clone()
        .addScaledVector(projection.normal, shot.side * lateral)
        .addScaledVector(projection.tangent, 3.5 * shot.drift);
      position.y = this.groundAt(position.x, position.z, subject.pos.y) + 2.6 * shot.height;
      const target = subject.pos.clone();
      target.y += 0.7;
      return {
        position,
        target,
        fov: this.framingFov(position.distanceTo(subject.pos), 0.3, 30, 62),
        roll: 0,
        anchored: false
      };
    }

    if (shot.type === 'onboard') {
      const position = subject.pos
        .clone()
        .addScaledVector(forward, 1.35)
        .addScaledVector(right, shot.side * 0.55);
      position.y = subject.pos.y + 0.72;
      const target = subject.pos.clone().addScaledVector(forward, 26);
      target.y += 0.9;
      const shake = Math.sin(this.time * 22) * 0.006 * THREE.MathUtils.clamp(speed / 30, 0, 1);
      position.y += shake;
      return {
        position,
        target,
        fov: THREE.MathUtils.clamp(66 + speed * 0.2, 66, 84),
        roll: THREE.MathUtils.clamp(-this.yawRate * 0.1, -0.06, 0.06),
        anchored: false
      };
    }

    // battle: frame the car and whoever it is fighting inside one shot.
    const rival = this.findNearestRival(subject, rivals);
    const midpoint = rival
      ? subject.pos.clone().add(rival.actor.pos).multiplyScalar(0.5)
      : subject.pos.clone();
    const pairDistance = rival ? rival.distance : 0;
    const position = midpoint
      .clone()
      .addScaledVector(projection.normal, shot.side * (this.boundary + 7))
      .addScaledVector(projection.tangent, -6 * shot.distance);
    position.y = this.groundAt(position.x, position.z, midpoint.y) + 2.2 * shot.height;
    const target = midpoint.clone();
    target.y += 0.75;
    return {
      position,
      target,
      fov: this.framingFov(
        position.distanceTo(midpoint),
        THREE.MathUtils.clamp(0.32 - pairDistance * 0.004, 0.16, 0.32),
        34,
        68
      ),
      roll: 0,
      anchored: false
    };
  }

  /** Shot currently on air. Exposed for diagnostics and headless checks. */
  public getActiveShotType(): string | null {
    return this.shot ? this.shot.type : null;
  }

  /** Smallest vertical FOV that still keeps the subject inside the middle of frame. */
  private fovToHold(subjectPosition: THREE.Vector3): number {
    const view = this.lookTarget.clone().sub(this.cameraPosition);
    const toSubject = subjectPosition.clone().sub(this.cameraPosition);
    if (view.lengthSq() < 1e-6 || toSubject.lengthSq() < 1e-6) return 0;
    const angle = view.normalize().angleTo(toSubject.normalize());
    return THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg((angle * 2) / 0.7) + 2,
      0,
      86
    );
  }

  /**
   * Advance the director one rendered frame and drive the camera.
   * Returns false when there is no usable track, so the caller can fall back.
   */
  public update(
    deltaTime: number,
    subject: ReplayCameraActor,
    rivals: ReplayCameraActor[],
    camera: THREE.PerspectiveCamera
  ): boolean {
    if (this.path.length < 4 || this.totalLength <= 0) return false;

    const step = Math.max(deltaTime, 0);
    this.time += step;

    if (this.hasYaw && step > 0) {
      const delta = this.normalizeAngle(subject.yaw - this.previousYaw) / step;
      this.yawRate = THREE.MathUtils.lerp(this.yawRate, delta, 0.2);
    }
    this.previousYaw = subject.yaw;
    this.hasYaw = true;

    const projection = this.project(subject.pos);

    let cut = false;
    if (
      !this.shot ||
      this.shotTime >= this.shot.duration ||
      this.shouldCutEarly(this.shot, subject, rivals, projection)
    ) {
      this.startShot(subject, rivals, projection);
      cut = true;
    }
    if (!this.shot) return false;
    this.shotTime += step;

    const framing = this.computeFraming(this.shot, subject, rivals, projection);

    if (cut || !this.hasFrame) {
      // Broadcast cameras cut. They never fly from one shot into the next.
      this.cameraPosition.copy(framing.position);
      this.lookTarget.copy(framing.target);
      this.currentFov = framing.fov;
      this.currentRoll = framing.roll;
      this.hasFrame = true;
    } else {
      const positionBlend = framing.anchored ? 1 : 1 - Math.exp(-6.5 * step);
      // A pass close to the lens needs a much faster pan than a distant approach,
      // exactly like a real operator swinging through as the car goes by.
      const proximity = THREE.MathUtils.clamp(
        70 / Math.max(this.cameraPosition.distanceTo(subject.pos), 1),
        0.7,
        3.4
      );
      const targetBlend = 1 - Math.exp(-(framing.anchored ? 9 : 12) * proximity * step);
      this.cameraPosition.lerp(framing.position, positionBlend);
      this.lookTarget.lerp(framing.target, targetBlend);
      // Zooming out to hold a subject is urgent; tightening back in is leisurely.
      const fovRate = framing.fov > this.currentFov ? 9 : 2.8;
      this.currentFov = THREE.MathUtils.lerp(
        this.currentFov,
        framing.fov,
        1 - Math.exp(-fovRate * step)
      );
      this.currentRoll = THREE.MathUtils.lerp(
        this.currentRoll,
        framing.roll,
        1 - Math.exp(-5 * step)
      );
    }

    // Keep every off-car lens clear of the ground, including mid-move, so a shot
    // that tracks over rising terrain cannot scrape through it.
    if (this.shot.type !== 'onboard') {
      const floor =
        this.groundAt(this.cameraPosition.x, this.cameraPosition.z, this.cameraPosition.y) + 1.15;
      if (this.cameraPosition.y < floor) this.cameraPosition.y = floor;
    }

    // Whatever the shot wanted, an external shot has to keep the car on screen.
    // Onboard is exempt: that lens is mounted on the car and frames the road ahead,
    // so the car's own centre is behind it and must not drag the lens wide open.
    if (this.shot.type !== 'onboard') {
      this.currentFov = Math.max(this.currentFov, this.fovToHold(subject.pos));
    }

    camera.up.copy(WORLD_UP);
    camera.position.copy(this.cameraPosition);
    camera.lookAt(this.lookTarget);
    if (Math.abs(this.currentRoll) > 1e-4) {
      camera.rotateZ(this.currentRoll);
    }
    if (Math.abs(camera.fov - this.currentFov) > 0.01) {
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }
    return true;
  }
}
