import * as THREE from 'three';
import { TimeOfDay } from './types';

/* ============================================================================
   DAY / NIGHT
   ----------------------------------------------------------------------------
   One reading of the player's own clock, turned into everything a scene needs
   to look like that hour: sky and fog colour, where the sun is (so shadows
   point the right way), how bright each lamp in the rig should be, and whether
   the street lights are on.

   Nothing here touches a scene. Call sampleDayNight() and apply the result.
   ========================================================================== */

/** Local hours, sunrise and sunset. Shadows are longest at the two ends. */
export const SUNRISE_HOUR = 6.0;
export const SUNSET_HOUR = 18.6;

/**
 * Sun elevation at which the street lights switch. Two values, not one: a
 * single threshold would make the lamps stutter on and off while the sun sits
 * exactly on it. They snap - no fade - because dusk should feel like a switch
 * being thrown.
 */
const LAMP_ON_ELEVATION = 0.12;
const LAMP_OFF_ELEVATION = 0.17;

export type DayNightPhase = 'night' | 'dawn' | 'day' | 'dusk';

export interface DayNightSample {
  /** Local time of the reading, in fractional hours (13.5 = 13:30). */
  hours: number;
  /** -1 at the depth of night, 0 on the horizon, 1 at solar noon. */
  elevation: number;
  /** Unit vector pointing from the valley toward the sun (or moon). */
  sunDirection: THREE.Vector3;
  phase: DayNightPhase;
  /** Short label for the UI, e.g. "Dusk". */
  label: string;

  sky: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;

  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fillIntensity: number;
  bounceIntensity: number;
  exposure: number;

  /** True once it is dark enough that the street lights should be lit. */
  lampsOn: boolean;
  /** The nearest of the three authored track moods, for reusing scenery grading. */
  timeOfDay: TimeOfDay;
}

interface Keyframe {
  hour: number;
  sky: number;
  fog: number;
  fogDensity: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fill: number;
  bounce: number;
  exposure: number;
}

/**
 * The look of the valley through one day. Values between two keys are blended,
 * so the scene drifts rather than stepping. 16:00 is the old hand-tuned
 * late-afternoon rig, kept as the anchor everything else was balanced against.
 */
const KEYFRAMES: Keyframe[] = [
  { hour: 0.0, sky: 0x070b18, fog: 0x0b1224, fogDensity: 0.00165, sun: 0x9fb8e0, sunIntensity: 0.22,
    hemiSky: 0x24304f, hemiGround: 0x10160f, hemiIntensity: 0.22, fill: 0.06, bounce: 0.04, exposure: 0.82 },
  { hour: 4.6, sky: 0x101c39, fog: 0x172444, fogDensity: 0.00160, sun: 0x8fa5cf, sunIntensity: 0.26,
    hemiSky: 0x2b3a63, hemiGround: 0x141c14, hemiIntensity: 0.26, fill: 0.08, bounce: 0.05, exposure: 0.84 },
  { hour: 6.0, sky: 0x9a6f7e, fog: 0xa8808a, fogDensity: 0.00150, sun: 0xff9d6a, sunIntensity: 0.70,
    hemiSky: 0xc08fa0, hemiGround: 0x27331f, hemiIntensity: 0.40, fill: 0.16, bounce: 0.10, exposure: 0.88 },
  { hour: 7.2, sky: 0xe2a478, fog: 0xe8b895, fogDensity: 0.00140, sun: 0xffbb82, sunIntensity: 1.20,
    hemiSky: 0xffc79a, hemiGround: 0x35512b, hemiIntensity: 0.52, fill: 0.24, bounce: 0.15, exposure: 0.91 },
  // Orange straight to blue would blend through grey, so morning and evening
  // each get a step that keeps the sky a colour rather than a wash.
  { hour: 8.1, sky: 0xbcc3dc, fog: 0xd0dcea, fogDensity: 0.00130, sun: 0xffddb4, sunIntensity: 1.38,
    hemiSky: 0xdcd6e6, hemiGround: 0x35562c, hemiIntensity: 0.57, fill: 0.28, bounce: 0.17, exposure: 0.93 },
  { hour: 9.0, sky: 0x8ec0e8, fog: 0xb7d6ea, fogDensity: 0.00120, sun: 0xfff0d2, sunIntensity: 1.50,
    hemiSky: 0xbfe4ff, hemiGround: 0x33632f, hemiIntensity: 0.62, fill: 0.32, bounce: 0.19, exposure: 0.94 },
  { hour: 12.5, sky: 0x7fb4dd, fog: 0xa8cbe4, fogDensity: 0.00110, sun: 0xfff6e2, sunIntensity: 1.72,
    hemiSky: 0xcdeaff, hemiGround: 0x33632f, hemiIntensity: 0.68, fill: 0.36, bounce: 0.22, exposure: 0.95 },
  { hour: 16.0, sky: 0x7fb4dd, fog: 0xa8cbe4, fogDensity: 0.00110, sun: 0xffe9c4, sunIntensity: 1.55,
    hemiSky: 0xbfe4ff, hemiGround: 0x33632f, hemiIntensity: 0.62, fill: 0.34, bounce: 0.20, exposure: 0.94 },
  { hour: 17.1, sky: 0xb0aec4, fog: 0xcbbfba, fogDensity: 0.00120, sun: 0xffd9a6, sunIntensity: 1.44,
    hemiSky: 0xd2cfd8, hemiGround: 0x33562c, hemiIntensity: 0.58, fill: 0.30, bounce: 0.18, exposure: 0.93 },
  { hour: 18.0, sky: 0xcf9464, fog: 0xdbb391, fogDensity: 0.00130, sun: 0xffb974, sunIntensity: 1.25,
    hemiSky: 0xffd0a4, hemiGround: 0x2f4a24, hemiIntensity: 0.50, fill: 0.24, bounce: 0.15, exposure: 0.92 },
  { hour: 19.3, sky: 0x6a5078, fog: 0x7a5d80, fogDensity: 0.00148, sun: 0xff8f6b, sunIntensity: 0.52,
    hemiSky: 0x8a739c, hemiGround: 0x22301e, hemiIntensity: 0.34, fill: 0.14, bounce: 0.09, exposure: 0.88 },
  { hour: 20.6, sky: 0x1b2340, fog: 0x232d4c, fogDensity: 0.00160, sun: 0xa6bbe4, sunIntensity: 0.28,
    hemiSky: 0x2e3b60, hemiGround: 0x161d15, hemiIntensity: 0.26, fill: 0.08, bounce: 0.05, exposure: 0.84 },
  { hour: 24.0, sky: 0x070b18, fog: 0x0b1224, fogDensity: 0.00165, sun: 0x9fb8e0, sunIntensity: 0.22,
    hemiSky: 0x24304f, hemiGround: 0x10160f, hemiIntensity: 0.22, fill: 0.06, bounce: 0.04, exposure: 0.82 }
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Local time as fractional hours, e.g. 23:25 -> 23.4167. */
export const hoursOf = (date: Date): number =>
  date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;

/**
 * Sun elevation on a -1..1 scale.
 *
 * Positive between sunrise and sunset, peaking at solar noon; negative through
 * the night, deepest in the small hours. This is the one number the phase, the
 * lamps and the shadow pitch all read, so day and night never disagree.
 */
export const sunElevation = (hours: number): number => {
  if (hours >= SUNRISE_HOUR && hours <= SUNSET_HOUR) {
    const t = (hours - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR);
    return Math.sin(Math.PI * t);
  }
  // Night, measured from sunset round to sunrise.
  const nightLength = 24 - (SUNSET_HOUR - SUNRISE_HOUR);
  const since = hours > SUNSET_HOUR ? hours - SUNSET_HOUR : hours + (24 - SUNSET_HOUR);
  return -Math.sin(Math.PI * (since / nightLength));
};

/**
 * Where the light comes from, as a unit vector.
 *
 * The sun tracks east to west across the day and the moon does the same across
 * the night, so shadows sweep the valley instead of sitting still. Both keep a
 * push toward +Z, which throws shadows away from the camera - straight at it
 * they would just hide behind whatever cast them.
 */
export const lightDirection = (hours: number): THREE.Vector3 => {
  const daylight = hours >= SUNRISE_HOUR && hours <= SUNSET_HOUR;
  const travel = daylight
    ? (hours - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR)
    : (() => {
        const nightLength = 24 - (SUNSET_HOUR - SUNRISE_HOUR);
        const since = hours > SUNSET_HOUR ? hours - SUNSET_HOUR : hours + (24 - SUNSET_HOUR);
        return since / nightLength;
      })();

  const arc = Math.PI * travel;               // 0 at rise (east), PI at set (west)
  const height = Math.sin(arc);

  return new THREE.Vector3(
    Math.cos(arc),
    // Never let the source drop to the horizon exactly: a perfectly flat sun
    // stretches shadows to infinity and they smear across the whole valley.
    0.16 + height * 0.92,
    0.55
  ).normalize();
};

const phaseOf = (hours: number, elevation: number): { phase: DayNightPhase; label: string } => {
  if (elevation >= 0.34) return { phase: 'day', label: 'Day' };
  // Twilight runs a little way past the horizon on both sides - the sky is
  // still lit for a while after the sun has gone.
  if (elevation <= -0.18) return { phase: 'night', label: 'Night' };
  return hours < 12
    ? { phase: 'dawn', label: 'Dawn' }
    : { phase: 'dusk', label: 'Dusk' };
};

/** The authored track mood closest to this hour, for reusing scenery grading. */
const moodOf = (elevation: number): TimeOfDay => {
  if (elevation >= 0.34) return 'afternoon';
  if (elevation >= -0.04) return 'evening';
  return 'night';
};

/**
 * Reads a clock and returns the whole look of that moment.
 *
 * `wereLampsOn` is the caller's previous answer. Passing it back keeps the
 * street lights from flickering while the sun hovers on the switching point;
 * leave it out and the lamps simply follow the lower threshold.
 */
export const sampleDayNight = (date: Date = new Date(), wereLampsOn?: boolean): DayNightSample => {
  const hours = hoursOf(date);

  let index = 0;
  while (index < KEYFRAMES.length - 2 && KEYFRAMES[index + 1].hour <= hours) index++;
  const from = KEYFRAMES[index];
  const to = KEYFRAMES[index + 1];
  const span = to.hour - from.hour;
  const t = span <= 0 ? 0 : Math.min(1, Math.max(0, (hours - from.hour) / span));

  const elevation = sunElevation(hours);
  const { phase, label } = phaseOf(hours, elevation);

  // At sunset the key light hands over from the sun in the west to the moon in
  // the east, which is a 180 degree swing. Fading it out across the horizon
  // means the swap happens while nothing is casting, so shadows never snap.
  const horizonFade = smoothstep(0.02, 0.15, Math.abs(elevation));

  const lampsOn = wereLampsOn
    ? elevation < LAMP_OFF_ELEVATION
    : elevation < LAMP_ON_ELEVATION;

  return {
    hours,
    elevation,
    sunDirection: lightDirection(hours),
    phase,
    label,

    sky: new THREE.Color(from.sky).lerp(new THREE.Color(to.sky), t),
    fog: new THREE.Color(from.fog).lerp(new THREE.Color(to.fog), t),
    fogDensity: lerp(from.fogDensity, to.fogDensity, t),

    sunColor: new THREE.Color(from.sun).lerp(new THREE.Color(to.sun), t),
    sunIntensity: lerp(from.sunIntensity, to.sunIntensity, t) * horizonFade,
    hemiSky: new THREE.Color(from.hemiSky).lerp(new THREE.Color(to.hemiSky), t),
    hemiGround: new THREE.Color(from.hemiGround).lerp(new THREE.Color(to.hemiGround), t),
    hemiIntensity: lerp(from.hemiIntensity, to.hemiIntensity, t),
    fillIntensity: lerp(from.fill, to.fill, t),
    bounceIntensity: lerp(from.bounce, to.bounce, t),
    exposure: lerp(from.exposure, to.exposure, t),

    lampsOn,
    timeOfDay: moodOf(elevation)
  };
};
