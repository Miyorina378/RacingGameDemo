import { TrackConfig, TRACKS_DATABASE } from './TrackDatabase';
import { LICENSE_TIERS, LicenseTier } from './LicenseDatabase';
import { TIRE_COMPOUNDS, TireCompoundType } from '../objects/TireCompound';

export type CareerTierId = 'amateur' | 'intermediate' | 'professional';

/**
 * Hard ceiling on stages an event may show. Events currently ship five tracks, but
 * the ticket list is built and scrolled for up to ten so a longer championship
 * needs no UI change.
 */
export const MAX_STAGES_PER_EVENT = 10;

export interface CareerStage {
  id: string;
  name: string;
  trackId: string;
  layoutId?: string;
  laps: number;
  reward: number;
  description: string;
}

export interface ActiveRegulationItem {
  label: string;
  value: string;
}

export interface PrizeCreditPayout {
  place: string;
  rank: number;
  amount: number;
  trophyColor: string;
}

/**
 * The machine-readable half of an entry rule. This is what an eligibility check
 * reads, and it stays fixed even when the wording on screen is rewritten.
 */
export interface EventRegulationRule {
  carType?: string;
  aspiration?: 'NA' | 'Turbo' | 'Supercharged' | 'Electric';
  drivetrain?: 'FF' | 'FR' | 'MR' | 'RR' | 'AWD';
  country?: string;
  maxPowerHp?: number;
  minWeightKg?: number;
}

/**
 * One entry condition: a fixed rule plus freely editable wording.
 *
 * `rule` is the condition itself, e.g. `{ carType: 'Tuner' }`. `label` is only how
 * it reads on the event screen, so "Tuner Car Only" can become "Tuners Only"
 * without touching what the condition actually means.
 */
export interface EventRegulationCondition {
  rule: EventRegulationRule;
  label: string;
}

/** Which rubber the event allows. Names come from the tire compound data itself. */
export interface EventTireRestriction {
  allowed: TireCompoundType[];
  /** Optional wording override for the whole line. */
  label?: string;
}

export interface CareerEvent {
  id: string;
  name: string;
  subtitle: string;
  tier: CareerTierId;
  description: string;
  requiresLicense: boolean;
  /** Credit cost to enter this event. Defaults to DEFAULT_EVENT_ENTRY_FEE when omitted. */
  entryFee?: number;
  totalLaps: number;
  bonusReward: number;
  bgImage: string;
  accentColor: string;
  stages: CareerStage[];
  activeRegulations?: ActiveRegulationItem[];
  /** Entry conditions with configurable wording. Preferred over activeRegulations. */
  regulations?: EventRegulationCondition[];
  tireRestriction?: EventTireRestriction;
  /** License needed to enter. Omit to fall back on `requiresLicense`. */
  requiredLicense?: LicenseTier;
  /** Explicit credit payouts for places 1 to 6. Omit to scale from stage rewards. */
  prizeCredits?: number[];
}

export function getActiveRegulations(event: CareerEvent): ActiveRegulationItem[] {
  if (event.activeRegulations && event.activeRegulations.length > 0) {
    return event.activeRegulations.slice(0, 2);
  }

  const id = event.id.toLowerCase();
  if (id.includes('ff')) {
    return [
      { label: 'Drivetrain', value: 'FF (Front-Wheel Drive)' },
      { label: 'Car Type', value: 'Production' }
    ];
  }
  if (id.includes('fr')) {
    return [
      { label: 'Drivetrain', value: 'FR (Front-Engine Rear-Drive)' }
    ];
  }
  if (id.includes('4wd') || id.includes('awd')) {
    return [
      { label: 'Drivetrain', value: 'AWD (All-Wheel Drive)' }
    ];
  }
  if (id.includes('jdm') || id.includes('japan')) {
    return [
      { label: 'Country', value: 'Japan' },
      { label: 'Car Type', value: 'Production' }
    ];
  }
  if (id.includes('euro') || id.includes('europe')) {
    return [
      { label: 'Country', value: 'Germany, Italy, UK' }
    ];
  }
  if (id.includes('turbo')) {
    return [
      { label: 'Aspiration', value: 'Turbo' },
      { label: 'Car Type', value: 'Production, Tuner' }
    ];
  }
  if (id.includes('na_') || id.includes('aspirated')) {
    return [
      { label: 'Aspiration', value: 'NA (Naturally Aspirated)' }
    ];
  }
  if (id.includes('supercar') || id.includes('apex')) {
    return [
      { label: 'Car Type', value: 'Concept, Tuner' },
      { label: 'License Required', value: 'Gold License' }
    ];
  }
  if (event.requiresLicense) {
    return [
      { label: 'License Required', value: 'Bronze License Required' },
      { label: 'Car Type', value: 'Production' }
    ];
  }

  // Mostly 1 or just Car Type
  return [
    { label: 'Car Type', value: 'Production' }
  ];
}

export function getTop3Credits(event: CareerEvent): PrizeCreditPayout[] {
  const maxReward = Math.max(...event.stages.map((s) => s.reward), 300);
  return [
    { place: '1ST', rank: 1, amount: maxReward, trophyColor: '#fbbf24' },
    { place: '2ND', rank: 2, amount: Math.round(maxReward * 0.6), trophyColor: '#cbd5e1' },
    { place: '3RD', rank: 3, amount: Math.round(maxReward * 0.35), trophyColor: '#d97706' }
  ];
}

/** Stages an event actually races, capped at the supported maximum. */
export function getEventStages(event: CareerEvent): CareerStage[] {
  return event.stages.slice(0, MAX_STAGES_PER_EVENT);
}

/**
 * Entry conditions for an event.
 *
 * New events declare `regulations` directly. Older ones only carry the label/value
 * pairs, so those are read as conditions too rather than being dropped, and an event
 * with neither still falls back on what its id implies.
 */
export function getEventRegulations(event: CareerEvent): EventRegulationCondition[] {
  if (event.regulations && event.regulations.length > 0) {
    return event.regulations;
  }

  return getActiveRegulations(event).map((item) => ({
    rule: legacyRuleFor(item),
    label: legacyLabelFor(item)
  }));
}

/** Best-effort machine rule for a legacy label/value pair. */
function legacyRuleFor(item: ActiveRegulationItem): EventRegulationRule {
  const label = item.label.toLowerCase();
  const value = item.value;
  if (label.includes('drivetrain')) {
    const code = value.split(' ')[0] as EventRegulationRule['drivetrain'];
    return { drivetrain: code };
  }
  if (label.includes('aspiration')) {
    return { aspiration: value.startsWith('NA') ? 'NA' : 'Turbo' };
  }
  if (label.includes('country')) return { country: value };
  if (label.includes('car type')) return { carType: value };
  return {};
}

/** Reads a legacy label/value pair as a sentence, e.g. "Tuner Cars Only". */
function legacyLabelFor(item: ActiveRegulationItem): string {
  const label = item.label.toLowerCase();
  if (label.includes('license')) return item.value;
  if (label.includes('aspiration')) {
    return item.value.startsWith('NA')
      ? 'Naturally Aspirated Engine'
      : `${item.value} Engine Only`;
  }
  if (label.includes('drivetrain')) return `${item.value} Only`;
  if (label.includes('country')) return `${item.value} Cars Only`;
  return `${item.value} Cars Only`;
}

/** Tire rule as one readable line, with the compound names taken from tire data. */
export function getEventTireRestriction(event: CareerEvent): {
  allowed: TireCompoundType[];
  label: string;
} {
  const allowed = event.tireRestriction?.allowed?.length
    ? event.tireRestriction.allowed
    : defaultTiresForTier(event.tier);

  if (event.tireRestriction?.label) {
    return { allowed, label: event.tireRestriction.label };
  }

  const names = allowed.map((id) => TIRE_COMPOUNDS[id].name);
  if (names.length === 0) return { allowed, label: 'Open Tire Regulation' };
  if (names.length === 1) return { allowed, label: `${names[0]} Tires Only` };
  return {
    allowed,
    label: `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]} Tires`
  };
}

/** Rubber a tier runs on when an event does not spell it out. */
function defaultTiresForTier(tier: CareerTierId): TireCompoundType[] {
  if (tier === 'amateur') return ['economy', 'normal'];
  if (tier === 'intermediate') return ['sport_hard', 'sport_medium'];
  return ['sport_medium', 'sport_soft'];
}

/**
 * Credit payouts down to sixth place.
 *
 * An event can list all six itself; otherwise they scale off its best stage reward
 * on the usual sharp taper, so finishing on the podium is worth far more than
 * simply being classified.
 */
export function getEventPrizeTable(event: CareerEvent): PrizeCreditPayout[] {
  const places = ['1st Place', '2nd Place', '3rd Place', '4th Place', '5th Place', '6th Place'];
  const trophyColors = ['#fbbf24', '#cbd5e1', '#d97706', '#71717a', '#71717a', '#71717a'];
  const ratios = [1, 0.5, 0.2, 0.1, 0.05, 0.02];
  const topReward = Math.max(...event.stages.map((s) => s.reward), 300);

  return places.map((place, index) => ({
    place,
    rank: index + 1,
    amount:
      event.prizeCredits?.[index] !== undefined
        ? event.prizeCredits[index]
        : Math.max(5, Math.round((topReward * ratios[index]) / 5) * 5),
    trophyColor: trophyColors[index]
  }));
}

/** Default credit cost to enter an event when its config omits `entryFee`. */
export const DEFAULT_EVENT_ENTRY_FEE = 1000;

/** Credit cost an event demands at the gate. */
export function getEventEntryFee(event: CareerEvent): number {
  const fee = event.entryFee ?? DEFAULT_EVENT_ENTRY_FEE;
  return Number.isFinite(fee) ? Math.max(0, Math.round(fee)) : DEFAULT_EVENT_ENTRY_FEE;
}

/** License an event demands at the gate. */
export function getEventLicenseRequirement(event: CareerEvent): {
  tier: LicenseTier | null;
  label: string;
} {
  const tier = event.requiredLicense ?? (event.requiresLicense ? 'bronze' : null);
  if (!tier) return { tier: null, label: 'No License Required' };
  const config = LICENSE_TIERS.find((entry) => entry.id === tier);
  return { tier, label: `${config?.name ?? tier} License` };
}

export interface TierScreenConfig {
  id: CareerTierId;
  name: string;
  subtitle: string;
  bgImage: string;
  themeColor: string;
  badgeText: string;
}

export const TIER_CONFIGS: Record<CareerTierId, TierScreenConfig> = {
  amateur: {
    id: 'amateur',
    name: 'Amateur Racing Field',
    subtitle: 'Clubman League & Entry Speedways',
    bgImage: '/images/amateur_sky.png',
    themeColor: '#38bdf8', // Sky Blue
    badgeText: 'TIER 1 // NOVICE MOTORSPORT'
  },
  intermediate: {
    id: 'intermediate',
    name: 'Intermediate Racing Field',
    subtitle: 'Challenger Trophy & Forest Circuits',
    bgImage: '/images/intermediate_forest_bg.jpg',
    themeColor: '#a855f7', // Purple
    badgeText: 'TIER 2 // PROVING GROUNDS'
  },
  professional: {
    id: 'professional',
    name: 'Professional Racing Field',
    subtitle: 'Grand Prix Masters & Championship Arenas',
    bgImage: '/images/professional_racetrack_bg.jpg',
    themeColor: '#f43f5e', // Rose
    badgeText: 'TIER 3 // APEX CHAMPIONSHIP'
  }
};

export const CAREER_EVENTS: CareerEvent[] = [
  // ==========================================
  // AMATEUR RACING EVENTS (SKY BACKGROUND - 5 EVENTS)
  // ==========================================
  {
    id: 'amateur_sunday_cup',
    name: 'Sunday Clubman Cup',
    subtitle: 'Rookie Sprint Series',
    tier: 'amateur',
    description: 'A beginner-friendly 3-stage competition designed for perfecting throttle control, basic overtaking, and high-speed cornering.',
    requiresLicense: false,
    totalLaps: 3,
    bonusReward: 1200,
    bgImage: '/images/amateur_sky_bg.jpg',
    accentColor: '#38bdf8',
    // Wording is free to edit; the rule beside it is what an entry check reads.
    regulations: [
      { rule: { carType: 'Tuner' }, label: 'Tuner Car' },
      { rule: { aspiration: 'NA' }, label: 'Naturally Aspirated Engine' }
    ],
    tireRestriction: { allowed: ['economy', 'normal'] },
    stages: [
      {
        id: 'amateur_sunday_stage_1',
        name: 'Stage 1: Canopy Speedway Oval',
        trackId: 'canopy_speedway',
        laps: 3,
        reward: 300,
        description: 'Wide continuous high-speed banking oval. Great for practicing drafting lines.'
      },
      {
        id: 'amateur_sunday_stage_2',
        name: 'Stage 2: Sprint Circuit Short Loop',
        trackId: 'sprint_circuit',
        laps: 3,
        reward: 450,
        description: 'Snappy left-right chicanes and high-traction acceleration zones.'
      },
      {
        id: 'amateur_sunday_stage_3',
        name: 'Stage 3: Canopy Grand Final',
        trackId: 'canopy_speedway',
        laps: 3,
        reward: 600,
        description: 'Full grid sprint under clear skies. Finish 1st to secure the Gold Trophy!'
      }
    ]
  },
  {
    id: 'amateur_oval_derby',
    name: 'Rookie Speedway Challenge',
    subtitle: 'High-Speed Banking Series',
    tier: 'amateur',
    description: 'Flat-out throttle battle across wide sweeping speedways. Master high-speed drafting and overtaking.',
    requiresLicense: false,
    totalLaps: 3,
    bonusReward: 1500,
    bgImage: '/images/amateur_sky_bg.jpg',
    accentColor: '#06b6d4',
    regulations: [{ rule: { aspiration: 'NA' }, label: 'Non Turbo Cars Only' }],
    tireRestriction: { allowed: ['economy'] },
    stages: [
      {
        id: 'amateur_oval_stage_1',
        name: 'Stage 1: Canopy Outer Ring',
        trackId: 'canopy_speedway',
        laps: 3,
        reward: 400,
        description: 'High-speed rhythm sprint across smooth tarmac.'
      },
      {
        id: 'amateur_oval_stage_2',
        name: 'Stage 2: Sprint Apex Dash',
        trackId: 'sprint_circuit',
        laps: 3,
        reward: 550,
        description: 'Technical hairpin brake zones and fast sweepers.'
      }
    ]
  },
  {
    id: 'amateur_novice_trophy',
    name: 'Novice Clubman Challenge',
    subtitle: 'Sprint Circuit Masters',
    tier: 'amateur',
    description: 'Multi-stage sprint challenge focusing on smooth corner exit speed and braking points.',
    requiresLicense: false,
    totalLaps: 3,
    bonusReward: 1800,
    bgImage: '/images/amateur_sky_bg.jpg',
    accentColor: '#22c55e',
    stages: [
      {
        id: 'amateur_novice_stage_1',
        name: 'Stage 1: Sprint Circuit Qualifier',
        trackId: 'sprint_circuit',
        laps: 3,
        reward: 350,
        description: 'Clock clean laps and hold off aggressive opponents.'
      },
      {
        id: 'amateur_novice_stage_2',
        name: 'Stage 2: Canopy Speedway Dash',
        trackId: 'canopy_speedway',
        laps: 3,
        reward: 500,
        description: 'Flat-out speed run testing top-end engine upgrades.'
      },
      {
        id: 'amateur_novice_stage_3',
        name: 'Stage 3: Clubman Championship Final',
        trackId: 'sprint_circuit',
        laps: 3,
        reward: 750,
        description: 'Decisive 3-lap finale on technical pavement.'
      }
    ]
  },
  {
    id: 'amateur_coastal_sprint',
    name: 'Coastal Horizon Trophy',
    subtitle: 'Seaside Speed Cup',
    tier: 'amateur',
    description: 'High-speed endurance sprints over smooth asphalt under sunny skies.',
    requiresLicense: false,
    totalLaps: 3,
    bonusReward: 2000,
    bgImage: '/images/amateur_sky_bg.jpg',
    accentColor: '#3b82f6',
    stages: [
      {
        id: 'amateur_coastal_stage_1',
        name: 'Stage 1: Canopy Coastal Loop',
        trackId: 'canopy_speedway',
        laps: 3,
        reward: 450,
        description: 'High-speed rhythm sprint across smooth tarmac.'
      },
      {
        id: 'amateur_coastal_stage_2',
        name: 'Stage 2: Sprint Horizon Final',
        trackId: 'sprint_circuit',
        laps: 3,
        reward: 650,
        description: 'Tight chicanes and hairpins by the coast.'
      }
    ]
  },
  {
    id: 'amateur_grassroots_derby',
    name: 'Grassroots Sprint Clash',
    subtitle: 'Novice Championship',
    tier: 'amateur',
    description: 'The definitive amateur showdown. Win all 3 stages to cement your status as Clubman Champion.',
    requiresLicense: false,
    totalLaps: 3,
    bonusReward: 2500,
    bgImage: '/images/amateur_sky_bg.jpg',
    accentColor: '#eab308',
    stages: [
      {
        id: 'amateur_grassroots_stage_1',
        name: 'Stage 1: Sprint Circuit Heat',
        trackId: 'sprint_circuit',
        laps: 3,
        reward: 400,
        description: 'Fast wheel-to-wheel pack racing.'
      },
      {
        id: 'amateur_grassroots_stage_2',
        name: 'Stage 2: Canopy Speed Dash',
        trackId: 'canopy_speedway',
        laps: 3,
        reward: 550,
        description: 'Slipstream drafting showdown.'
      },
      {
        id: 'amateur_grassroots_stage_3',
        name: 'Stage 3: Grassroots Grand Finale',
        trackId: 'sprint_circuit',
        laps: 3,
        reward: 800,
        description: 'Championship decider on the circuit.'
      }
    ]
  },

  // ==========================================
  // INTERMEDIATE RACING EVENTS (FOREST BACKGROUND - 5 EVENTS)
  // ==========================================
  {
    id: 'intermediate_proving_trophy',
    name: 'Challenger Proving Trophy',
    subtitle: 'Woodland & Technical GP Series',
    tier: 'intermediate',
    description: 'Demanding mid-tier technical series through Driver Dojo and high-speed expressways. Requires precision vehicle tuning.',
    requiresLicense: true,
    totalLaps: 3,
    bonusReward: 4500,
    bgImage: '/images/intermediate_forest_bg.jpg',
    accentColor: '#a855f7',
    stages: [
      {
        id: 'intermediate_proving_stage_1',
        name: 'Stage 1: Driver Dojo Hairpin Sector',
        trackId: 'driver_dojo',
        laps: 3,
        reward: 1200,
        description: 'Complex esses, tightening-radius hairpins, and elevation banking.'
      },
      {
        id: 'intermediate_proving_stage_2',
        name: 'Stage 2: Tokyo Megaloop Night Expressway',
        trackId: 'tokyo_megaloop',
        laps: 3,
        reward: 1500,
        description: 'Extra-wide multi-lane high-speed expressway loop.'
      },
      {
        id: 'intermediate_proving_stage_3',
        name: 'Stage 3: Proving Grounds Championship Final',
        trackId: 'driver_dojo',
        laps: 3,
        reward: 2000,
        description: 'Full circuit masterclass. Take 1st place in all 3 stages for Gold Trophy!'
      }
    ]
  },
  {
    id: 'intermediate_midnight_highway',
    name: 'Tokyo Midnight Highway Derby',
    subtitle: 'High-Speed Megaloop Championship',
    tier: 'intermediate',
    description: 'High-speed drafting battles through illuminated metropolitan expressways. Requires maximum top speed and stable suspension.',
    requiresLicense: true,
    totalLaps: 3,
    bonusReward: 5000,
    bgImage: '/images/intermediate_forest_bg.jpg',
    accentColor: '#c084fc',
    stages: [
      {
        id: 'intermediate_highway_stage_1',
        name: 'Stage 1: Megaloop Velocity Dash',
        trackId: 'tokyo_megaloop',
        laps: 3,
        reward: 1400,
        description: 'Long wide-open sweepers and high-speed drafting.'
      },
      {
        id: 'intermediate_highway_stage_2',
        name: 'Stage 2: Driver Dojo Technical Expressway',
        trackId: 'driver_dojo',
        laps: 3,
        reward: 1800,
        description: 'Tight chicanes and banking curves under stadium lights.'
      }
    ]
  },
  {
    id: 'intermediate_forest_enduro',
    name: 'Woodland Forest Enduro',
    subtitle: 'Scenic Handling Trophy',
    tier: 'intermediate',
    description: 'Multi-stage endurance handling event along forest roads and proving ground curves.',
    requiresLicense: true,
    totalLaps: 3,
    bonusReward: 6000,
    bgImage: '/images/intermediate_forest_bg.jpg',
    accentColor: '#10b981',
    stages: [
      {
        id: 'intermediate_forest_stage_1',
        name: 'Stage 1: Driver Dojo Forest Run',
        trackId: 'driver_dojo',
        laps: 3,
        reward: 1500,
        description: 'Challenging corner entries through lush woodland environments.'
      },
      {
        id: 'intermediate_forest_stage_2',
        name: 'Stage 2: Tokyo Megaloop High-Rpm Sprint',
        trackId: 'tokyo_megaloop',
        laps: 3,
        reward: 1700,
        description: 'Wide loop expressway sprint.'
      },
      {
        id: 'intermediate_forest_stage_3',
        name: 'Stage 3: Forest Grand Finale',
        trackId: 'driver_dojo',
        laps: 3,
        reward: 2200,
        description: 'Decisive 3-stage finale. Finish 1st to claim the Gold Cup.'
      }
    ]
  },
  {
    id: 'intermediate_apex_predator',
    name: 'Asphalt Predator Cup',
    subtitle: 'High-Downforce Challenge',
    tier: 'intermediate',
    description: 'Aggressive grip racing across demanding esses and high-speed hairpins.',
    requiresLicense: true,
    totalLaps: 3,
    bonusReward: 6500,
    bgImage: '/images/intermediate_forest_bg.jpg',
    accentColor: '#ec4899',
    stages: [
      {
        id: 'intermediate_predator_stage_1',
        name: 'Stage 1: Dojo Apex Attack',
        trackId: 'driver_dojo',
        laps: 3,
        reward: 1600,
        description: 'Brake-marker precision and apex clipping.'
      },
      {
        id: 'intermediate_predator_stage_2',
        name: 'Stage 2: Megaloop Slipstream Dash',
        trackId: 'tokyo_megaloop',
        laps: 3,
        reward: 1800,
        description: 'Drafting battles at 280+ km/h.'
      },
      {
        id: 'intermediate_predator_stage_3',
        name: 'Stage 3: Predator Super-Finale',
        trackId: 'driver_dojo',
        laps: 3,
        reward: 2400,
        description: 'Championship decider on technical asphalt.'
      }
    ]
  },
  {
    id: 'intermediate_alpine_ridge',
    name: 'Alpine Ridge Time Attack',
    subtitle: 'Elevation Mastery Series',
    tier: 'intermediate',
    description: 'Fast-paced elevation sprints testing vehicle damping and chassis balance.',
    requiresLicense: true,
    totalLaps: 3,
    bonusReward: 7000,
    bgImage: '/images/intermediate_forest_bg.jpg',
    accentColor: '#8b5cf6',
    stages: [
      {
        id: 'intermediate_alpine_stage_1',
        name: 'Stage 1: Driver Dojo Ridge Climb',
        trackId: 'driver_dojo',
        laps: 3,
        reward: 1700,
        description: 'Steep hill sections and off-camber curves.'
      },
      {
        id: 'intermediate_alpine_stage_2',
        name: 'Stage 2: Ridge Descent Sprint',
        trackId: 'driver_dojo',
        laps: 3,
        reward: 2100,
        description: 'Hair-raising downhill braking zones.'
      }
    ]
  },

  // ==========================================
  // PROFESSIONAL RACING EVENTS (RACETRACK BACKGROUND - 5 EVENTS)
  // ==========================================
  {
    id: 'professional_world_masters',
    name: 'Grand Prix World Masters',
    subtitle: 'Elite Championship Arena',
    tier: 'professional',
    description: 'The pinnacle of motorsport racing. Compete against elite hypercars across the most punishing night circuits and mountain passes.',
    requiresLicense: true,
    totalLaps: 3,
    bonusReward: 15000,
    bgImage: '/images/professional_racetrack_bg.jpg',
    accentColor: '#f43f5e',
    stages: [
      {
        id: 'pro_masters_stage_1',
        name: 'Stage 1: Pro Hyper-Race Night Circuit',
        trackId: 'pro_race',
        laps: 3,
        reward: 3000,
        description: 'Complex winding night circuit with high-downforce technical esses.'
      },
      {
        id: 'pro_masters_stage_2',
        name: 'Stage 2: Swordfish Racing Course (Fuji Speedway)',
        trackId: 'fuji_speedway',
        laps: 3,
        reward: 5000,
        description: 'High-speed technical circuit with long straights and tricky sweepers.'
      },
      {
        id: 'pro_masters_stage_3',
        name: 'Stage 3: East Hill Mountain Summit',
        trackId: 'east_hill_mountain',
        laps: 3,
        reward: 5000,
        description: 'Massive grassland mountain pass with steep elevation changes.'
      }
    ]
  },
  {
    id: 'professional_apex_cup',
    name: 'Supercar Apex Championship',
    subtitle: 'Hyper-Class GP Masters',
    tier: 'professional',
    description: 'Extreme horsepower battles pushing vehicles to their absolute limits.',
    requiresLicense: true,
    totalLaps: 3,
    bonusReward: 18000,
    bgImage: '/images/professional_racetrack_bg.jpg',
    accentColor: '#e11d48',
    stages: [
      {
        id: 'pro_apex_stage_1',
        name: 'Stage 1: Swordfish GP Super-Sprint',
        trackId: 'fuji_speedway',
        laps: 3,
        reward: 5000,
        description: 'High-speed corner negotiation and late-apex braking.'
      },
      {
        id: 'pro_apex_stage_2',
        name: 'Stage 2: East Hill High-G Mountain Run',
        trackId: 'east_hill_mountain',
        laps: 3,
        reward: 5000,
        description: 'Extreme curves and blind crests across mountain scenery.'
      },
      {
        id: 'pro_apex_stage_3',
        name: 'Stage 3: Pro Hyper-Race Championship Final',
        trackId: 'pro_race',
        laps: 3,
        reward: 6000,
        description: 'Championship grand finale under floodlights. Gold Trophy for 3/3 wins!'
      }
    ]
  },
  {
    id: 'professional_mountain_king',
    name: 'King of the Mountain Pass',
    subtitle: 'High-Altitude Pass Challenge',
    tier: 'professional',
    description: 'Brutal high-altitude elevation challenge through the mountains and nocturnal hyper-courses.',
    requiresLicense: true,
    totalLaps: 3,
    bonusReward: 20000,
    bgImage: '/images/professional_racetrack_bg.jpg',
    accentColor: '#fbbf24',
    stages: [
      {
        id: 'pro_mountain_stage_1',
        name: 'Stage 1: East Hill Mountain Climax',
        trackId: 'east_hill_mountain',
        laps: 3,
        reward: 5000,
        description: 'Technical mountain descent with sharp switchbacks.'
      },
      {
        id: 'pro_mountain_stage_2',
        name: 'Stage 2: Pro Hyper-Race Night Duel',
        trackId: 'pro_race',
        laps: 3,
        reward: 5000,
        description: 'High-stakes midnight duel on asphalt under stadium lights.'
      }
    ]
  },
  {
    id: 'professional_hyper_endurance',
    name: '24H Hyper-Circuit Clash',
    subtitle: 'Nocturnal Grand Prix',
    tier: 'professional',
    description: 'High-speed endurance under stadium floods against aggressive hypercar AI.',
    requiresLicense: true,
    totalLaps: 3,
    bonusReward: 22000,
    bgImage: '/images/professional_racetrack_bg.jpg',
    accentColor: '#f97316',
    stages: [
      {
        id: 'pro_endurance_stage_1',
        name: 'Stage 1: Pro Hyper-Race Midnight Leg',
        trackId: 'pro_race',
        laps: 3,
        reward: 5000,
        description: 'High-speed technical night racing.'
      },
      {
        id: 'pro_endurance_stage_2',
        name: 'Stage 2: Swordfish High-Speed Stint',
        trackId: 'fuji_speedway',
        laps: 3,
        reward: 5500,
        description: 'Full-throttle drafting down the straight.'
      },
      {
        id: 'pro_endurance_stage_3',
        name: 'Stage 3: East Hill Twilight Climax',
        trackId: 'east_hill_mountain',
        laps: 3,
        reward: 6500,
        description: 'Demanding alpine summit finale.'
      }
    ]
  },
  {
    id: 'professional_ultimate_crown',
    name: 'Ultimate Legend Crown',
    subtitle: 'The Grand Master Finale',
    tier: 'professional',
    description: 'The supreme test in Autodrive Motorsport. Defeat the master class to claim the legendary Platinum Trophy.',
    requiresLicense: true,
    totalLaps: 3,
    bonusReward: 30000,
    bgImage: '/images/professional_racetrack_bg.jpg',
    accentColor: '#eab308',
    stages: [
      {
        id: 'pro_crown_stage_1',
        name: 'Stage 1: Swordfish GP Super-Final',
        trackId: 'fuji_speedway',
        laps: 3,
        reward: 6000,
        description: 'High-stakes grand master opener.'
      },
      {
        id: 'pro_crown_stage_2',
        name: 'Stage 2: East Hill Ascent Duel',
        trackId: 'east_hill_mountain',
        laps: 3,
        reward: 7000,
        description: 'Extreme alpine hairpin duels.'
      },
      {
        id: 'pro_crown_stage_3',
        name: 'Stage 3: Pro Hyper-Race Grand Coronation',
        trackId: 'pro_race',
        laps: 3,
        reward: 9000,
        description: 'The ultimate final race in motorsport career.'
      }
    ]
  }
];

export const CAREER_PROGRESS_STORAGE_KEY = 'cyberdrive_career_event_progress';

export type CareerEventProgress = Record<string, Record<string, boolean>>; // { [eventId]: { [stageId]: isFirstPlace } }

export const loadCareerEventProgress = (): CareerEventProgress => {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(CAREER_PROGRESS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

export const saveCareerEventProgress = (progress: CareerEventProgress): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CAREER_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    // LocalStorage write error
  }
};

export const getEventFirstPlaceCount = (event: CareerEvent, progress: CareerEventProgress): number => {
  const eventWins = progress[event.id] || {};
  return event.stages.filter(stage => eventWins[stage.id] === true).length;
};

export const isEventFullyCompleted = (event: CareerEvent, progress: CareerEventProgress): boolean => {
  const wins = getEventFirstPlaceCount(event, progress);
  return wins === event.stages.length;
};

export const CAREER_PLACEMENT_STORAGE_KEY = 'cyberdrive_career_event_placements';

/** Best finishing position per stage: { [eventId]: { [stageId]: place } }. */
export type CareerEventPlacements = Record<string, Record<string, number>>;

/**
 * Best result per stage.
 *
 * Older saves only recorded a first-place flag, so those are read as a win here
 * instead of showing an event you already took as never entered.
 */
export const loadCareerEventPlacements = (): CareerEventPlacements => {
  if (typeof window === 'undefined') return {};

  const legacy = loadCareerEventProgress();
  const merged: CareerEventPlacements = {};
  for (const [eventId, stages] of Object.entries(legacy)) {
    for (const [stageId, wasFirst] of Object.entries(stages)) {
      if (!wasFirst) continue;
      merged[eventId] = { ...(merged[eventId] || {}), [stageId]: 1 };
    }
  }

  try {
    const saved = localStorage.getItem(CAREER_PLACEMENT_STORAGE_KEY);
    if (!saved) return merged;
    const parsed = JSON.parse(saved) as CareerEventPlacements;
    for (const [eventId, stages] of Object.entries(parsed)) {
      for (const [stageId, place] of Object.entries(stages)) {
        if (typeof place !== 'number' || !Number.isFinite(place)) continue;
        const existing = merged[eventId]?.[stageId];
        merged[eventId] = {
          ...(merged[eventId] || {}),
          // Keep the best run, so a later bad result never erases a trophy.
          [stageId]: existing === undefined ? place : Math.min(existing, place)
        };
      }
    }
    return merged;
  } catch {
    return merged;
  }
};

export const saveCareerEventPlacements = (placements: CareerEventPlacements): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CAREER_PLACEMENT_STORAGE_KEY, JSON.stringify(placements));
  } catch {
    // LocalStorage write error
  }
};

/** Best place on a stage, or null when it has never been raced. */
export const getStagePlacement = (
  placements: CareerEventPlacements,
  eventId: string,
  stageId: string
): number | null => placements[eventId]?.[stageId] ?? null;

/**
 * Records a finish. Keeps the better of the new and stored result, and still writes
 * the old first-place flag so anything reading that keeps working.
 */
export const recordStageResult = (
  eventId: string,
  stageId: string,
  placement: number
): CareerEventPlacements => {
  const place = Math.max(1, Math.round(placement));
  const current = loadCareerEventPlacements();
  const existing = current[eventId]?.[stageId];
  const updated: CareerEventPlacements = {
    ...current,
    [eventId]: {
      ...(current[eventId] || {}),
      [stageId]: existing === undefined ? place : Math.min(existing, place)
    }
  };
  saveCareerEventPlacements(updated);
  if (place === 1) recordStageVictory(eventId, stageId);
  return updated;
};

export const recordStageVictory = (eventId: string, stageId: string): CareerEventProgress => {
  const current = loadCareerEventProgress();
  const updated = {
    ...current,
    [eventId]: {
      ...(current[eventId] || {}),
      [stageId]: true
    }
  };
  saveCareerEventProgress(updated);
  return updated;
};
