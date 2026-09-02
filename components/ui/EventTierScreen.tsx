'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Trophy,
  Lock,
  Play,
  Flag,
  Sparkles,
  ShieldCheck,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  CareerTierId,
  CareerEvent,
  CareerStage,
  TIER_CONFIGS,
  CAREER_EVENTS,
  loadCareerEventProgress,
  loadCareerEventPlacements,
  getEventFirstPlaceCount,
  getEventStages,
  getEventRegulations,
  getEventTireRestriction,
  getEventPrizeTable,
  getEventLicenseRequirement,
  getStagePlacement,
  CareerEventProgress,
  CareerEventPlacements
} from '../config/CareerEventDatabase';
import { TRACKS_DATABASE } from '../config/TrackDatabase';
import { TIRE_COMPOUNDS } from '../objects/TireCompound';

export interface EventTierScreenProps {
  initialTier: CareerTierId;
  playerCredits: number;
  hasLicense: boolean;
  onBackToMap: () => void;
  startRace: (trackId: string, layoutId?: string) => void;
}

// Helper for synthesized sci-fi sound effects
const playSoundBlip = (type: 'hover' | 'select' | 'launch' | 'slide' | 'pop') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'hover') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.04);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.045);
      osc.start(now);
      osc.stop(now + 0.045);
    } else if (type === 'pop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(820, now + 0.05);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'slide') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (type === 'select') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(1080, now + 0.08);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'launch') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(1300, now + 0.2);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  } catch {
    // AudioContext blocked
  }
};

// Bottom marquee movie bar with news ticker animation for overflowing text (no badge)
const EventSubtitleBar = ({ event }: { event: CareerEvent | null }) => {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [activeEvent, setActiveEvent] = useState<CareerEvent | null>(null);

  useEffect(() => {
    if (event) {
      setActiveEvent(event);
    }
  }, [event]);

  useEffect(() => {
    if (!activeEvent) return;
    const measure = () => {
      const windowEl = windowRef.current;
      const trackEl = trackRef.current;
      if (!windowEl || !trackEl) return;
      setIsOverflowing(trackEl.scrollWidth > windowEl.clientWidth + 2);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeEvent?.description]);

  const isVisible = !!event;

  return (
    <div
      className={`dealer-movie-bar pointer-events-none absolute inset-x-0 bottom-0 z-20 overflow-hidden border-y border-white/12 bg-black/92 px-6 py-4 text-center shadow-[0_0_35px_rgba(0,0,0,0.65)] transition-all duration-400 ease-in-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <div ref={windowRef} className="dealer-marquee-window text-sm font-semibold text-zinc-100">
        <div ref={trackRef} className={`dealer-marquee-track ${isOverflowing ? 'is-overflowing' : 'is-centered'}`}>
          {activeEvent?.description || ''}
        </div>
      </div>
    </div>
  );
};

/** Circuit name for a stage, falling back to the stage's own wording. */
const trackNameFor = (stage: CareerStage): string =>
  TRACKS_DATABASE.find((track) => track.id === stage.trackId)?.name ?? stage.name;

/** Ordinal wording for a finishing position. */
const ordinal = (place: number): string => {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
};

/** Struck-metal medal faces. Only the podium gets one. */
const MEDALS: Record<number, { face: string; glow: string; label: string }> = {
  1: {
    face: 'bg-[linear-gradient(145deg,#fef3c7_0%,#fbbf24_45%,#b45309_100%)]',
    glow: 'shadow-[0_2px_10px_rgba(180,83,9,0.45)]',
    label: 'Gold'
  },
  2: {
    face: 'bg-[linear-gradient(145deg,#f8fafc_0%,#cbd5e1_45%,#64748b_100%)]',
    glow: 'shadow-[0_2px_10px_rgba(100,116,139,0.4)]',
    label: 'Silver'
  },
  3: {
    face: 'bg-[linear-gradient(145deg,#fed7aa_0%,#c2703a_45%,#7c3f14_100%)]',
    glow: 'shadow-[0_2px_10px_rgba(124,63,20,0.4)]',
    label: 'Bronze'
  }
};

/**
 * Whether a stage has been raced, and how it went.
 *
 * A struck medal for the podium, the bare position for anything from fourth down,
 * and a hollow ring for a stage nobody has entered yet.
 */
const StagePlacementBadge = ({
  placement,
  light
}: {
  placement: number | null;
  light: boolean;
}) => {
  if (placement === null) {
    return (
      <div
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-dashed ${
          light ? 'border-zinc-300/90' : 'border-zinc-700'
        }`}
        title="Not raced yet"
        aria-label="Not raced yet"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${light ? 'bg-zinc-300' : 'bg-zinc-700'}`}
        />
      </div>
    );
  }

  const medal = MEDALS[placement];
  if (medal) {
    return (
      <div
        className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 ${
          medal.face
        } ${medal.glow} ${light ? 'ring-black/10' : 'ring-white/20'}`}
        title={`${medal.label} — finished ${ordinal(placement)}`}
        aria-label={`Finished ${ordinal(placement)}`}
      >
        {/* Highlight arc, so the medal reads as metal rather than a flat disc */}
        <span className="pointer-events-none absolute inset-[3px] rounded-full bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,0.85),transparent_58%)]" />
        <Trophy className="relative h-[18px] w-[18px] fill-white/95 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" />
      </div>
    );
  }

  return (
    <div
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${
        light
          ? 'border-zinc-200 bg-zinc-100 text-zinc-500'
          : 'border-zinc-800 bg-zinc-900 text-zinc-400'
      }`}
      title={`Finished ${ordinal(placement)}`}
      aria-label={`Finished ${ordinal(placement)}`}
    >
      <span className="font-mono text-[13px] font-black leading-none tabular-nums">
        {placement}
      </span>
    </div>
  );
};

/** Small caps section label with an accent tick, used down the rules column. */
const SectionLabel = ({
  title,
  accent,
  light
}: {
  title: string;
  accent: string;
  light: boolean;
}) => (
  <div className="flex items-center gap-2.5">
    <span
      className="h-[3px] w-5 rounded-full"
      style={{ backgroundColor: accent }}
      aria-hidden
    />
    <h4
      className={`text-[10px] font-black uppercase tracking-[0.3em] ${
        light ? 'text-zinc-500' : 'text-zinc-400'
      }`}
    >
      {title}
    </h4>
  </div>
);

/** Hairline divider that fades out, softer than a full-width rule. */
const HairLine = ({ light }: { light: boolean }) => (
  <div
    aria-hidden
    className={`h-px w-full ${
      light
        ? 'bg-gradient-to-r from-zinc-300 via-zinc-200 to-transparent'
        : 'bg-gradient-to-r from-zinc-700 via-zinc-800 to-transparent'
    }`}
  />
);

/** License pill, tinted by the tier being demanded. */
const LICENSE_TINTS: Record<string, string> = {
  bronze: 'border-orange-300 bg-orange-50 text-orange-800',
  silver: 'border-slate-300 bg-slate-50 text-slate-700',
  gold: 'border-amber-300 bg-amber-50 text-amber-800',
  platinum: 'border-cyan-300 bg-cyan-50 text-cyan-800'
};
const LICENSE_TINTS_DARK: Record<string, string> = {
  bronze: 'border-orange-800/70 bg-orange-950/40 text-orange-300',
  silver: 'border-slate-700 bg-slate-900/50 text-slate-300',
  gold: 'border-amber-800/70 bg-amber-950/40 text-amber-300',
  platinum: 'border-cyan-800/70 bg-cyan-950/40 text-cyan-300'
};

export default function EventTierScreen({
  initialTier,
  playerCredits,
  hasLicense,
  onBackToMap,
  startRace
}: EventTierScreenProps) {
  const [activeTier] = useState<CareerTierId>(initialTier);
  const [hoveredEvent, setHoveredEvent] = useState<CareerEvent | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [eventProgress, setEventProgress] = useState<CareerEventProgress>(() => loadCareerEventProgress());
  const [eventPlacements, setEventPlacements] = useState<CareerEventPlacements>(() =>
    loadCareerEventPlacements()
  );
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isScreenMounted, setIsScreenMounted] = useState(false);
  const [isScreenExiting, setIsScreenExiting] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(0);

  const carouselRef = useRef<HTMLDivElement>(null);

  // Trigger screen fade-in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsScreenMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Reload progress when mounting
  useEffect(() => {
    setEventProgress(loadCareerEventProgress());
    setEventPlacements(loadCareerEventPlacements());
  }, []);

  /**
   * The amateur field runs a light card. The higher tiers keep the dark treatment,
   * so one theme switch drives every surface in the expanded block.
   */
  const isLightTheme = activeTier === 'amateur';

  const tierConfig = useMemo(() => {
    return TIER_CONFIGS[activeTier];
  }, [activeTier]);

  const tierEvents = useMemo(() => {
    return CAREER_EVENTS.filter((e) => e.tier === activeTier);
  }, [activeTier]);

  // Seamless bottom-to-top staggered reveal (0% to 100% opacity, ease-in-out)
  useEffect(() => {
    setVisibleCount(0);
    const timers: NodeJS.Timeout[] = [];
    for (let i = 0; i < tierEvents.length; i++) {
      const t = setTimeout(() => {
        setVisibleCount((prev) => Math.max(prev, i + 1));
        playSoundBlip('pop');
      }, 120 + i * 140);
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
  }, [activeTier, tierEvents.length]);

  // Handle Fade-Out Transition on Back Click
  const handleBackClick = () => {
    if (isScreenExiting) return;
    playSoundBlip('select');
    setIsScreenExiting(true);
    setTimeout(() => {
      onBackToMap();
    }, 400);
  };

  // Scroll to slide
  const scrollToSlide = useCallback((index: number) => {
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const cards = container.querySelectorAll<HTMLElement>('.event-card-item');
    if (!cards || !cards[index]) return;

    playSoundBlip('slide');
    const targetCard = cards[index];
    const containerCenter = container.clientWidth / 2;
    const cardCenter = targetCard.offsetLeft + targetCard.clientWidth / 2;
    const scrollTarget = cardCenter - containerCenter;

    container.scrollTo({
      left: Math.max(0, scrollTarget),
      behavior: 'smooth'
    });
    setActiveSlideIndex(index);
  }, []);

  const handlePrevSlide = () => {
    const nextIdx = Math.max(0, activeSlideIndex - 1);
    scrollToSlide(nextIdx);
  };

  const handleNextSlide = () => {
    const nextIdx = Math.min(tierEvents.length - 1, activeSlideIndex + 1);
    scrollToSlide(nextIdx);
  };

  // Mouse wheel and touchpad horizontal scrolling support
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta !== 0) {
        e.preventDefault();
        el.scrollLeft += delta * 1.15;
      }
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  // Keyboard arrow and Escape navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (expandedEventId) {
          e.preventDefault();
          playSoundBlip('select');
          setExpandedEventId(null);
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevSlide();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextSlide();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSlideIndex, expandedEventId, tierEvents.length]);

  // Track active slide on scroll
  const handleScroll = () => {
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const cards = container.querySelectorAll<HTMLElement>('.event-card-item');
    if (!cards.length) return;

    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    let closestIndex = 0;
    let closestDist = Infinity;

    cards.forEach((card, idx) => {
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const dist = Math.abs(containerCenter - cardCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = idx;
      }
    });

    if (closestIndex !== activeSlideIndex) {
      setActiveSlideIndex(closestIndex);
    }
  };

  const handleLaunchStage = (event: CareerEvent, stage: CareerStage) => {
    playSoundBlip('launch');
    // Save current active event & stage so race victory records it
    if (typeof window !== 'undefined') {
      localStorage.setItem('cyberdrive_current_career_event', JSON.stringify({
        eventId: event.id,
        stageId: stage.id
      }));
    }
    setIsScreenExiting(true);
    setTimeout(() => {
      startRace(stage.trackId, stage.layoutId);
    }, 380);
  };

  return (
    <div
      className={`relative inset-0 w-full h-full flex flex-col bg-zinc-950 text-white select-none overflow-hidden font-sans transition-opacity duration-500 ease-in-out ${
        isScreenMounted && !isScreenExiting ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* 1. DYNAMIC BACKGROUND IMAGE MATCHING EVENT CARD LIGHTING */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <img
          src={tierConfig.bgImage}
          alt={tierConfig.name}
          className="w-full h-full object-cover object-center scale-105 filter brightness-[0.75] contrast-[1.05] transition-all duration-700 ease-in-out"
        />
        {/* Subtle dark ambient scrim matching event card */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/20 to-zinc-950/80" />
      </div>

      {/* 2. TOP BAR: HORIZONTALLY REVERSED SVG BACK BUTTON (Left) & BANK (Right) ONLY */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5 pointer-events-auto">
        <button
          onClick={handleBackClick}
          className="group flex h-14 w-14 items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95"
          aria-label="Back to 3D World Map"
          title="Back to 3D World Map"
        >
          <img
            src="/icon/back_button.svg"
            alt="Back"
            className="h-full w-full object-contain drop-shadow-[0_0_18px_rgba(0,0,0,0.65)] transition-[filter] duration-300 ease-in-out -scale-x-150 scale-y-150 brightness-100 group-hover:brightness-125"
            draggable={false}
          />
        </button>

        {/* Bank Balance Badge */}
        <div className="flex items-center gap-2 bg-zinc-950/85 border border-zinc-800 px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">BANK</span>
          <span className="text-sm font-black font-mono text-amber-400">
            {playerCredits.toLocaleString()} <span className="text-[10px] text-amber-500 font-bold">CR</span>
          </span>
        </div>
      </div>

      {/* 3. INTERACTIVE HORIZONTAL CAROUSEL OF EVENT CARDS */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center overflow-hidden pointer-events-auto w-full -translate-y-6 sm:-translate-y-10">
        {/* Left Floating Carousel Button */}
        <button
          disabled={activeSlideIndex === 0}
          onClick={handlePrevSlide}
          className={`absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full border border-zinc-800 bg-zinc-950/85 hover:bg-zinc-900 text-white flex items-center justify-center transition-all shadow-2xl backdrop-blur-md cursor-pointer ${
            activeSlideIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110 active:scale-95 hover:border-zinc-600'
          }`}
        >
          <ChevronLeft className="w-6 h-6 text-zinc-200" />
        </button>

        {/* Right Floating Carousel Button */}
        <button
          disabled={activeSlideIndex === tierEvents.length - 1}
          onClick={handleNextSlide}
          className={`absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full border border-zinc-800 bg-zinc-950/85 hover:bg-zinc-900 text-white flex items-center justify-center transition-all shadow-2xl backdrop-blur-md cursor-pointer ${
            activeSlideIndex === tierEvents.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110 active:scale-95 hover:border-zinc-600'
          }`}
        >
          <ChevronRight className="w-6 h-6 text-zinc-200" />
        </button>

        {/* Carousel Scroll Container with larger gap and higher positioning */}
        <div
          ref={carouselRef}
          onScroll={handleScroll}
          className="w-full flex items-center gap-12 sm:gap-16 overflow-x-auto scroll-smooth snap-x snap-mandatory px-16 md:px-36 py-8 scrollbar-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {tierEvents.map((event, idx) => {
            const wins = getEventFirstPlaceCount(event, eventProgress);
            const totalStages = event.stages.length;
            const isAllWon = wins === totalStages && totalStages > 0;
            const isLocked = event.requiresLicense && !hasLicense;
            const isActiveSlide = idx === activeSlideIndex;
            const isRevealed = idx < visibleCount;
            const isExpanded = expandedEventId === event.id;
            const regulations = getEventRegulations(event);
            const tireRestriction = getEventTireRestriction(event);
            const prizeTable = getEventPrizeTable(event);
            const licenseRequirement = getEventLicenseRequirement(event);
            const eventStages = getEventStages(event);
            // Two prize columns: 1st-3rd on the left, 4th-6th beside them.
            const prizeRows = [0, 1, 2].map((row) => [prizeTable[row], prizeTable[row + 3]]);

            // Circumference for r=42 is 2 * PI * 42 = 263.89
            const circumference = 263.89;
            const strokeOffset = circumference - (circumference * wins) / (totalStages || 1);

            return (
              <div
                key={event.id}
                onClick={() => {
                  // With the close button gone, the artwork itself is the toggle:
                  // clicking the open card folds it again, as Escape does.
                  playSoundBlip('select');
                  if (isExpanded) {
                    setExpandedEventId(null);
                    return;
                  }
                  setExpandedEventId(event.id);
                  setTimeout(() => {
                    scrollToSlide(idx);
                  }, 80);
                }}
                onMouseEnter={() => {
                  setHoveredEvent(event);
                  if (!isExpanded) {
                    playSoundBlip('hover');
                  }
                }}
                onMouseLeave={() => setHoveredEvent(null)}
                className={`event-card-item snap-center shrink-0 group relative flex flex-row h-[500px] sm:h-[530px] rounded-3xl border overflow-hidden transition-all duration-500 ease-in-out backdrop-blur-md ${
                  isExpanded
                    ? `w-[700px] sm:w-[900px] md:w-[1020px] z-20 cursor-pointer ${
                        isLightTheme
                          ? 'ring-1 ring-zinc-900/10 shadow-[0_28px_70px_rgba(9,9,11,0.45)] bg-[#f6f6f6] border-[#f6f6f6]'
                          : 'ring-2 ring-cyan-400/60 shadow-[0_0_45px_rgba(6,182,212,0.3)] bg-zinc-950/95'
                      }`
                    : 'w-[240px] sm:w-[255px] cursor-pointer hover:scale-[1.035] hover:-translate-y-2.5 ' +
                      (isActiveSlide ? 'ring-2 ring-white/30' : 'opacity-85 hover:opacity-100')
                } ${
                  isRevealed && isScreenMounted && !isScreenExiting
                    ? 'opacity-100 translate-y-0 pointer-events-auto'
                    : 'opacity-0 translate-y-[120vh] pointer-events-none'
                } ${
                  isAllWon
                    ? 'bg-zinc-950/60 border-amber-500/70'
                    : isLocked
                    ? 'bg-zinc-950/70 border-zinc-800 opacity-75'
                    : 'bg-zinc-950/50 border-zinc-700/60 hover:border-zinc-400'
                }`}
              >
                {/* Left Column: Event Artwork Card Box */}
                <div className="relative w-[240px] sm:w-[255px] h-full shrink-0 flex flex-col justify-between p-6 overflow-hidden select-none">
                  {/* Inner Box Artwork Image with Original Atmospheric Lighting */}
                  <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    <img
                      src={event.bgImage}
                      alt={event.name}
                      className="w-full h-full object-cover object-center filter brightness-[0.75] group-hover:brightness-[0.9] transition-all duration-700 ease-in-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 via-zinc-950/30 to-zinc-950/90" />
                    {/* On the light card the poster feathers into the paper instead of
                        stopping at a hard seam. */}
                    {isExpanded && isLightTheme && (
                      <div
                        aria-hidden
                        className="absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent via-[#f6f6f6]/55 to-[#f6f6f6]"
                      />
                    )}
                  </div>

                  {/* Top: Series Name & License Req Only */}
                  <div className="relative z-10 flex flex-col text-center pt-2 px-1">
                    {isLocked && (
                      <div className="flex items-center justify-center gap-1 text-[9px] font-mono text-rose-400 bg-rose-950/85 border border-rose-800/60 px-2.5 py-0.5 rounded-md mb-2.5 w-fit mx-auto">
                        <Lock className="w-3 h-3" />
                        <span>LICENSE REQ</span>
                      </div>
                    )}
                    <h3 className="text-lg font-black text-white uppercase tracking-wide group-hover:text-white transition-colors leading-snug drop-shadow-sm">
                      {event.name}
                    </h3>
                  </div>

                  {/* Middle Spacer */}
                  <div className="flex-1" />

                  {/* Bottom / Lower Section: Circle + 0/3 Side-by-Side */}
                  <div className="relative z-10 pb-3 flex items-center justify-center gap-3.5 w-full">
                    {/* Perfect Round Circle Indicator */}
                    <div className="relative w-14 h-14 aspect-square rounded-full shrink-0 flex items-center justify-center">
                      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          fill="rgba(10, 10, 16, 0.85)"
                          stroke="rgba(255, 255, 255, 0.18)"
                          strokeWidth="5"
                        />
                        {wins > 0 && !isAllWon && (
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="none"
                            stroke={event.accentColor}
                            strokeWidth="5"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeOffset}
                            strokeLinecap="round"
                            className="transition-all duration-700 ease-in-out"
                          />
                        )}
                        {isAllWon && (
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="rgba(245, 158, 11, 0.25)"
                            stroke="#f59e0b"
                            strokeWidth="5"
                            className="animate-pulse"
                          />
                        )}
                      </svg>
                      {isAllWon && (
                        <div className="relative z-10 flex flex-col items-center justify-center">
                          <Trophy className="w-7 h-7 text-amber-400 fill-amber-400 animate-bounce" />
                          <Sparkles className="w-3 h-3 text-yellow-300 absolute -top-1 -right-1 animate-spin" />
                        </div>
                      )}
                    </div>

                    <span
                      className={`text-2xl sm:text-3xl font-black font-mono tracking-wider ${
                        isAllWon ? 'text-amber-400' : wins > 0 ? 'text-cyan-400' : 'text-zinc-100'
                      }`}
                    >
                      {wins}/{totalStages}
                    </span>
                  </div>
                </div>

                {/* Right Expanded Block: rules on one half, the track tickets on the other */}
                <div
                  className={`transition-all duration-500 ease-in-out flex flex-row min-w-0 overflow-hidden ${
                    isLightTheme
                      ? 'bg-[#f6f6f6] border-l border-zinc-200'
                      : 'bg-zinc-950/95 border-l border-zinc-800/80'
                  } ${
                    isExpanded
                      ? 'w-[460px] sm:w-[645px] md:w-[765px] opacity-100'
                      : 'w-0 max-w-0 opacity-0 pointer-events-none'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* LEFT HALF: entry rules, prize money, license */}
                  <div
                    className={`flex w-1/2 shrink-0 flex-col gap-4 overflow-y-auto px-6 py-6 text-left scrollbar-thin ${
                      isLightTheme
                        ? 'scrollbar-thumb-zinc-200 text-zinc-800'
                        : 'scrollbar-thumb-zinc-800 text-zinc-200'
                    }`}
                  >
                    {/* Regulation */}
                    <section className="flex flex-col gap-2.5">
                      <SectionLabel
                        title="Regulation"
                        accent={event.accentColor}
                        light={isLightTheme}
                      />
                      {regulations.length > 1 ? (
                        <ul className="flex flex-col gap-2">
                          {regulations.map((condition, rIdx) => (
                            <li key={rIdx} className="flex items-start gap-2.5">
                              <span
                                aria-hidden
                                className="mt-[7px] h-1.5 w-1.5 shrink-0 rotate-45"
                                style={{ backgroundColor: event.accentColor }}
                              />
                              <span
                                className={`text-[13px] font-bold leading-snug ${
                                  isLightTheme ? 'text-zinc-900' : 'text-zinc-100'
                                }`}
                              >
                                {condition.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p
                          className={`text-[15px] font-black leading-snug tracking-tight ${
                            isLightTheme ? 'text-zinc-900' : 'text-white'
                          }`}
                        >
                          {regulations[0]?.label ?? 'Open Regulation'}
                        </p>
                      )}
                    </section>

                    <HairLine light={isLightTheme} />

                    {/* Tires Restriction — compound swatches come from the tire data */}
                    <section className="flex flex-col gap-2.5">
                      <SectionLabel
                        title="Tires Restriction"
                        accent={event.accentColor}
                        light={isLightTheme}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {tireRestriction.allowed.map((compoundId) => {
                          const compound = TIRE_COMPOUNDS[compoundId];
                          return (
                            <span
                              key={compoundId}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                                isLightTheme
                                  ? 'border-zinc-200 bg-zinc-50 text-zinc-700'
                                  : 'border-zinc-800 bg-zinc-900/70 text-zinc-300'
                              }`}
                            >
                              <span
                                aria-hidden
                                className="h-2 w-2 rounded-full ring-1 ring-black/10"
                                style={{ backgroundColor: compound.colorHex }}
                              />
                              {compound.name}
                            </span>
                          );
                        })}
                      </div>
                      <p
                        className={`text-[11px] font-semibold ${
                          isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
                        }`}
                      >
                        {tireRestriction.label}
                      </p>
                    </section>

                    <HairLine light={isLightTheme} />

                    {/* Prize */}
                    <section className="flex flex-col gap-2.5">
                      <SectionLabel
                        title="Prize"
                        accent={event.accentColor}
                        light={isLightTheme}
                      />
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr
                            className={`text-[9px] font-black uppercase tracking-[0.2em] ${
                              isLightTheme ? 'text-zinc-400' : 'text-zinc-500'
                            }`}
                          >
                            <th className="pb-1.5 pr-2 font-black">Place</th>
                            <th className="pb-1.5 pr-4 text-right font-black">Prize</th>
                            <th className="pb-1.5 pr-2 font-black">Place</th>
                            <th className="pb-1.5 text-right font-black">Prize</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prizeRows.map(([left, right]) => (
                            <tr
                              key={left.rank}
                              className={`border-t ${
                                isLightTheme ? 'border-zinc-100' : 'border-zinc-800/70'
                              }`}
                            >
                              {[left, right].map((payout, cellIdx) => (
                                <React.Fragment key={payout.rank}>
                                  <td className="py-1.5 pr-2 align-middle">
                                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                                      <span
                                        aria-hidden
                                        className="h-1.5 w-1.5 rounded-full"
                                        style={{ backgroundColor: payout.trophyColor }}
                                      />
                                      <span
                                        className={`text-[11px] font-bold ${
                                          isLightTheme ? 'text-zinc-600' : 'text-zinc-400'
                                        }`}
                                      >
                                        {payout.place}
                                      </span>
                                    </span>
                                  </td>
                                  <td
                                    className={`whitespace-nowrap py-1.5 text-right font-mono text-[12px] font-black tabular-nums ${
                                      cellIdx === 0 ? 'pr-4' : ''
                                    } ${
                                      payout.rank === 1
                                        ? 'text-amber-600'
                                        : isLightTheme
                                          ? 'text-zinc-900'
                                          : 'text-white'
                                    }`}
                                  >
                                    ${payout.amount.toLocaleString()}
                                  </td>
                                </React.Fragment>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>

                    <HairLine light={isLightTheme} />

                    {/* License required */}
                    <section className="flex flex-col gap-2.5">
                      <SectionLabel
                        title="License Required"
                        accent={event.accentColor}
                        light={isLightTheme}
                      />
                      <span
                        className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] ${
                          licenseRequirement.tier
                            ? isLightTheme
                              ? LICENSE_TINTS[licenseRequirement.tier]
                              : LICENSE_TINTS_DARK[licenseRequirement.tier]
                            : isLightTheme
                              ? 'border-zinc-200 bg-zinc-50 text-zinc-500'
                              : 'border-zinc-800 bg-zinc-900/70 text-zinc-400'
                        }`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {licenseRequirement.label}
                      </span>
                    </section>
                  </div>

                  {/* RIGHT HALF: one ticket per track, scrolled for up to ten stages */}
                  <div
                    className={`flex w-1/2 shrink-0 flex-col gap-3 overflow-y-auto border-l px-5 py-6 scrollbar-thin ${
                      isLightTheme
                        ? 'border-zinc-200 scrollbar-thumb-zinc-200'
                        : 'border-zinc-800/80 scrollbar-thumb-zinc-800'
                    }`}
                    style={
                      isLightTheme
                        ? {
                            // Faint paper weave, so the ticket column reads as a stub book.
                            backgroundImage:
                              'repeating-linear-gradient(135deg, rgba(24,24,27,0.028) 0 1px, transparent 1px 7px)',
                            backgroundColor: '#f6f6f6'
                          }
                        : {
                            backgroundImage:
                              'repeating-linear-gradient(135deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 7px)',
                            backgroundColor: 'rgba(24,24,27,0.55)'
                          }
                    }
                  >
                    {eventStages.map((stage, sIdx) => {
                      const placement = getStagePlacement(eventPlacements, event.id, stage.id);
                      const isStageLocked = event.requiresLicense && !hasLicense;
                      const isPodium = placement !== null && placement <= 3;
                      const notchColor = isLightTheme ? '#f6f6f6' : 'rgb(24 24 27)';

                      return (
                        <div
                          key={stage.id}
                          className={`group/ticket relative flex shrink-0 overflow-hidden rounded-2xl border transition-all duration-300 ${
                            isLightTheme
                              ? `border-zinc-200 bg-[#f6f6f6] shadow-[0_1px_2px_rgba(24,24,27,0.06)] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(24,24,27,0.12)] ${
                                  isPodium ? 'border-amber-200' : 'hover:border-zinc-300'
                                }`
                              : `border-zinc-800 bg-zinc-950/85 hover:-translate-y-0.5 hover:border-zinc-700 hover:shadow-[0_10px_24px_rgba(0,0,0,0.45)] ${
                                  isPodium ? 'border-amber-900/60' : ''
                                }`
                          }`}
                        >
                          {/* Ticket stub: medal plus round number, split off by a perforation */}
                          <div
                            className={`relative flex w-[74px] shrink-0 flex-col items-center justify-center gap-1.5 py-3.5 ${
                              isPodium
                                ? isLightTheme
                                  ? 'bg-[linear-gradient(160deg,#fffbeb,#fef3c7)]'
                                  : 'bg-[linear-gradient(160deg,rgba(69,26,3,0.55),rgba(24,24,27,0.2))]'
                                : isLightTheme
                                  ? 'bg-[#f6f6f6]/80'
                                  : 'bg-zinc-900/40'
                            }`}
                          >
                            <StagePlacementBadge placement={placement} light={isLightTheme} />
                            <span
                              className={`font-mono text-[9px] font-black uppercase tracking-[0.18em] ${
                                isLightTheme ? 'text-zinc-400' : 'text-zinc-500'
                              }`}
                            >
                              R{sIdx + 1}
                            </span>

                            {/* Perforation line with punched notches top and bottom */}
                            <span
                              aria-hidden
                              className={`absolute inset-y-2 right-0 w-px ${
                                isLightTheme
                                  ? 'bg-[repeating-linear-gradient(to_bottom,rgb(212,212,216)_0_3px,transparent_3px_7px)]'
                                  : 'bg-[repeating-linear-gradient(to_bottom,rgb(63,63,70)_0_3px,transparent_3px_7px)]'
                              }`}
                            />
                            <span
                              aria-hidden
                              className="absolute -top-[7px] right-[-7px] h-3.5 w-3.5 rounded-full"
                              style={{ backgroundColor: notchColor }}
                            />
                            <span
                              aria-hidden
                              className="absolute -bottom-[7px] right-[-7px] h-3.5 w-3.5 rounded-full"
                              style={{ backgroundColor: notchColor }}
                            />
                          </div>

                          {/* Ticket face: circuit, distance, and the way in */}
                          <div className="relative flex min-w-0 flex-1 items-center gap-3 pl-4 pr-3.5 py-3.5">
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <span
                                className={`truncate text-[13px] font-black leading-tight tracking-tight ${
                                  isLightTheme ? 'text-zinc-900' : 'text-white'
                                }`}
                                title={trackNameFor(stage)}
                              >
                                {trackNameFor(stage)}
                              </span>
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span
                                  className={`inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] font-black uppercase tracking-[0.14em] ${
                                    isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
                                  }`}
                                >
                                  <Flag className="h-3 w-3" />
                                  {stage.laps} Laps
                                </span>
                                <span
                                  aria-hidden
                                  className={`h-2.5 w-px ${
                                    isLightTheme ? 'bg-zinc-200' : 'bg-zinc-700'
                                  }`}
                                />
                                <span className="whitespace-nowrap font-mono text-[10px] font-black tabular-nums text-amber-600">
                                  +{stage.reward.toLocaleString()} CR
                                </span>
                              </span>
                            </div>

                            {/* Translucent overlay join button */}
                            <button
                              disabled={isStageLocked}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLaunchStage(event, stage);
                              }}
                              title={isStageLocked ? 'License required' : 'Join this race'}
                              className={`group/join relative flex shrink-0 items-center gap-1.5 overflow-hidden rounded-xl border px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.18em] backdrop-blur-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 ${
                                isStageLocked
                                  ? 'cursor-not-allowed opacity-45 ' +
                                    (isLightTheme
                                      ? 'border-zinc-200 bg-zinc-100 text-zinc-400'
                                      : 'border-zinc-800 bg-zinc-900 text-zinc-600')
                                  : 'cursor-pointer active:scale-[0.97] ' +
                                    (isLightTheme
                                      ? 'border-zinc-900/12 bg-zinc-900/[0.06] text-zinc-800 hover:border-zinc-900/25 hover:bg-zinc-900/12 focus-visible:ring-zinc-400'
                                      : 'border-white/15 bg-white/10 text-white hover:border-white/30 hover:bg-white/20 focus-visible:ring-white/40')
                              }`}
                            >
                              {/* Sheen sweep on hover, the same trick the garage buttons use */}
                              {!isStageLocked && (
                                <span
                                  aria-hidden
                                  className={`pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent to-transparent transition-transform duration-500 group-hover/join:translate-x-full ${
                                    isLightTheme ? 'via-zinc-900/10' : 'via-white/25'
                                  }`}
                                />
                              )}
                              {isStageLocked ? (
                                <Lock className="relative h-3 w-3" />
                              ) : (
                                <Play className="relative h-3 w-3 fill-current" />
                              )}
                              <span className="relative">Join</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. MOVIE-STYLE BOTTOM BAR (Appears ONLY when hovering an event box, news ticker marquee overflow, no badge) */}
      <EventSubtitleBar event={hoveredEvent} />
    </div>
  );
}
