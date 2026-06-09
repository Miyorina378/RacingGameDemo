import * as THREE from 'three';
import { TrackConfig, TrackNode } from './TrackDatabase';

export const LICENSE_PROGRESS_STORAGE_KEY = 'cyberdrive_license_progress';
export const LEGACY_LICENSE_STORAGE_KEY = 'cyberdrive_license';

export const LICENSE_TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum'] as const;
export type LicenseTier = typeof LICENSE_TIER_ORDER[number];
export type LicenseProgress = Record<LicenseTier, boolean[]>;

export interface LicenseTierConfig {
  id: LicenseTier;
  name: string;
  rewardBase: number;
  description: string;
}

export interface LicenseTestConfig extends TrackConfig {
  tier: LicenseTier;
  testNumber: number;
  lesson: string;
}

export const LICENSE_TIERS: LicenseTierConfig[] = [
  {
    id: 'bronze',
    name: 'Bronze',
    rewardBase: 180,
    description: 'Basic braking, corner entry, chicane rhythm, and pedal control.'
  },
  {
    id: 'silver',
    name: 'Silver',
    rewardBase: 280,
    description: 'The same fundamentals at higher speed with tighter timing.'
  },
  {
    id: 'gold',
    name: 'Gold',
    rewardBase: 420,
    description: 'Advanced braking zones, trail braking, and fast weight transfer.'
  },
  {
    id: 'platinum',
    name: 'Platinum',
    rewardBase: 650,
    description: 'Master-level pedal control, late apexes, and combined exams.'
  }
];

interface LicenseLessonBlueprint {
  lesson: string;
  title: string;
  description: string;
  baseTime: number;
  roadWidthOffset: number;
  tension: number;
  points: Array<[number, number]>;
}

const LESSON_BLUEPRINTS: LicenseLessonBlueprint[] = [
  {
    lesson: 'Straight braking',
    title: 'Straight Braking',
    description: 'Accelerate in a straight line, brake hard, and pass the final gate without overshooting.',
    baseTime: 20,
    roadWidthOffset: 2,
    tension: 0.25,
    points: [[0, -24], [0, -70], [0, -122], [0, -162], [0, -24]]
  },
  {
    lesson: 'Threshold braking',
    title: 'Threshold Brake Gate',
    description: 'Build speed, brake at the marker, and stay settled through a narrow exit gate.',
    baseTime: 22,
    roadWidthOffset: 1,
    tension: 0.3,
    points: [[0, -24], [0, -82], [12, -132], [0, -176], [-10, -128], [0, -24]]
  },
  {
    lesson: 'Basic cornering',
    title: 'Ninety Degree Corner',
    description: 'Brake before turn-in, release smoothly, and accelerate after the apex.',
    baseTime: 25,
    roadWidthOffset: 1,
    tension: 0.4,
    points: [[0, -24], [0, -82], [38, -118], [86, -118], [108, -76], [74, -34], [0, -24]]
  },
  {
    lesson: 'Hairpin corner',
    title: 'Hairpin Apex',
    description: 'Slow the car early, rotate at low speed, and unwind steering on exit.',
    baseTime: 28,
    roadWidthOffset: 0,
    tension: 0.5,
    points: [[0, -24], [22, -70], [72, -84], [104, -44], [74, 8], [18, -2], [-18, -42], [0, -24]]
  },
  {
    lesson: 'Chicane rhythm',
    title: 'Chicane Rhythm',
    description: 'Use one clean brake zone and keep the car balanced through left-right gates.',
    baseTime: 27,
    roadWidthOffset: -1,
    tension: 0.35,
    points: [[0, -24], [26, -58], [-22, -92], [26, -126], [-14, -158], [0, -24]]
  },
  {
    lesson: 'S-curve balance',
    title: 'S-Curve Balance',
    description: 'Manage weight transfer through flowing corners without stabbing the pedals.',
    baseTime: 30,
    roadWidthOffset: -1,
    tension: 0.55,
    points: [[0, -24], [34, -58], [66, -26], [46, 24], [-2, 42], [-46, 16], [-28, -42], [0, -24]]
  },
  {
    lesson: 'Trail braking',
    title: 'Trail Brake Entry',
    description: 'Carry light brake pressure into turn-in, then release as steering angle increases.',
    baseTime: 31,
    roadWidthOffset: -1,
    tension: 0.48,
    points: [[0, -24], [0, -84], [38, -132], [92, -106], [92, -44], [38, -6], [0, -24]]
  },
  {
    lesson: 'Pedal control',
    title: 'Pedal Control Slalom',
    description: 'Hold partial throttle and make small steering corrections through repeated gates.',
    baseTime: 32,
    roadWidthOffset: -2,
    tension: 0.42,
    points: [[0, -24], [24, -54], [-24, -84], [24, -114], [-24, -144], [24, -174], [0, -204], [0, -24]]
  },
  {
    lesson: 'Braking chicane',
    title: 'Braking Chicane',
    description: 'Brake from speed, choose a stable line, and avoid upsetting the car in the chicane.',
    baseTime: 34,
    roadWidthOffset: -2,
    tension: 0.36,
    points: [[0, -24], [0, -90], [36, -132], [-24, -166], [38, -204], [92, -166], [72, -86], [0, -24]]
  },
  {
    lesson: 'Mixed fundamentals',
    title: 'Fundamentals Exam',
    description: 'Combine braking, chicane timing, hairpin rotation, and pedal control in one run.',
    baseTime: 42,
    roadWidthOffset: -2,
    tension: 0.45,
    points: [[0, -24], [36, -62], [86, -54], [118, -6], [86, 48], [18, 58], [-42, 20], [-62, -42], [-20, -104], [28, -142], [0, -24]]
  }
];

const buildLicensePath = (tierIndex: number, testIndex: number, roadWidth: number): TrackNode[] => {
  const blueprint = LESSON_BLUEPRINTS[testIndex];
  const scale = 1 + tierIndex * 0.16;
  const offsetX = (testIndex % 2 === 0 ? -1 : 1) * tierIndex * 12;
  const offsetZ = tierIndex * -22;

  return blueprint.points.map(([x, z], pointIndex) => ({
    pos: new THREE.Vector3(x * scale + offsetX, 2, z * scale + offsetZ),
    width: Math.max(9, roadWidth + blueprint.roadWidthOffset - (pointIndex % 3 === 0 ? tierIndex * 0.7 : 0)),
    banking: pointIndex % 2 === 0 ? tierIndex * 1.25 : -tierIndex * 0.75
  }));
};

export const LICENSE_TESTS: LicenseTestConfig[] = LICENSE_TIERS.flatMap((tier, tierIndex) => {
  const roadWidth = 20 - tierIndex * 2;

  return Array.from({ length: 10 }, (_, index) => {
    const testNumber = index + 1;
    const blueprint = LESSON_BLUEPRINTS[index];
    const timeLimit = blueprint.baseTime + tierIndex * 3 + Math.round(index * 0.5 + tierIndex * index * 0.2);

    return {
      id: `${tier.id}-${testNumber}`,
      tier: tier.id,
      testNumber,
      lesson: blueprint.lesson,
      name: `${tier.name} ${blueprint.title}`,
      description: blueprint.description,
      timeLimit,
      roadWidth,
      hasObstacles: false,
      requiresLicense: tierIndex > 0,
      baseReward: tier.rewardBase + index * 35,
      path: buildLicensePath(tierIndex, index, roadWidth),
      curveType: 'centripetal',
      tension: blueprint.tension,
      HaveCrub: true,
      HaveFence: false,
      HaveGrass: false,
      time: tierIndex >= 2 ? 'evening' : 'afternoon'
    };
  });
});

export const LICENSE_TESTS_BY_TIER = LICENSE_TIER_ORDER.reduce((acc, tier) => {
  acc[tier] = LICENSE_TESTS.filter((test) => test.tier === tier);
  return acc;
}, {} as Record<LicenseTier, LicenseTestConfig[]>);

export const DEFAULT_LICENSE_TEST_ID = LICENSE_TESTS[0].id;

export const createDefaultLicenseProgress = (bronzeComplete = false): LicenseProgress => ({
  bronze: Array(10).fill(bronzeComplete),
  silver: Array(10).fill(false),
  gold: Array(10).fill(false),
  platinum: Array(10).fill(false)
});

export const normalizeLicenseProgress = (value: unknown, bronzeComplete = false): LicenseProgress => {
  const fallback = createDefaultLicenseProgress(bronzeComplete);
  if (!value || typeof value !== 'object') return fallback;

  const raw = value as Partial<Record<LicenseTier, unknown>>;
  return LICENSE_TIER_ORDER.reduce((progress, tier) => {
    const source = Array.isArray(raw[tier]) ? raw[tier] as unknown[] : fallback[tier];
    progress[tier] = Array.from({ length: 10 }, (_, index) => source[index] === true);
    return progress;
  }, {} as LicenseProgress);
};

export const loadLicenseProgress = (): LicenseProgress => {
  if (typeof window === 'undefined') return createDefaultLicenseProgress(false);

  const legacyBronzeComplete = localStorage.getItem(LEGACY_LICENSE_STORAGE_KEY) === 'true';
  const saved = localStorage.getItem(LICENSE_PROGRESS_STORAGE_KEY);
  if (!saved) return createDefaultLicenseProgress(legacyBronzeComplete);

  try {
    return normalizeLicenseProgress(JSON.parse(saved), legacyBronzeComplete);
  } catch {
    return createDefaultLicenseProgress(legacyBronzeComplete);
  }
};

export const isTierComplete = (progress: LicenseProgress, tier: LicenseTier) =>
  progress[tier].every(Boolean);

export const hasAnyLicense = (progress: LicenseProgress) => isTierComplete(progress, 'bronze');

export const saveLicenseProgress = (progress: LicenseProgress) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LICENSE_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  localStorage.setItem(LEGACY_LICENSE_STORAGE_KEY, hasAnyLicense(progress) ? 'true' : 'false');
};

export const getLicenseTestById = (testId: string) =>
  LICENSE_TESTS.find((test) => test.id === testId);

export const isLicenseTestUnlocked = (test: LicenseTestConfig, progress: LicenseProgress) => {
  const tierIndex = LICENSE_TIER_ORDER.indexOf(test.tier);
  if (tierIndex > 0 && !isTierComplete(progress, LICENSE_TIER_ORDER[tierIndex - 1])) return false;
  if (test.testNumber === 1) return true;
  return progress[test.tier][test.testNumber - 2] === true;
};

export const completeLicenseTest = (progress: LicenseProgress, test: LicenseTestConfig): LicenseProgress => ({
  bronze: [...progress.bronze],
  silver: [...progress.silver],
  gold: [...progress.gold],
  platinum: [...progress.platinum],
  [test.tier]: progress[test.tier].map((done, index) => index === test.testNumber - 1 ? true : done)
});

export const getLicenseTierCompletion = (progress: LicenseProgress, tier: LicenseTier) =>
  progress[tier].filter(Boolean).length;
