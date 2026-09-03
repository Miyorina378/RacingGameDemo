'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Trophy,
  Lock,
  Play,
  Flag,
  Sparkles,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Disc,
  CreditCard
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
  getEventEntryFee,
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
  startRace: (trackId: string, layoutId?: string, entryFee?: number) => boolean;
  brightness?: number;
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
      className={`dealer-movie-bar pointer-events-none absolute inset-x-0 bottom-0 z-20 overflow-hidden border-y border-white/12 bg-black/92 px-6 py-4 text-center shadow-[0_0_35px_rgba(0,0,0,0.65)] transition-all duration-400 ease-in-out ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
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

/** Podium trophy assets. Only the top three placements get one. */
const MEDALS: Record<number, { asset: string; face: string; glow: string; label: string }> = {
  1: {
    asset: '/images/gold_trophy.svg',
    face: 'bg-[linear-gradient(145deg,#fef3c7_0%,#fbbf24_45%,#b45309_100%)]',
    glow: 'shadow-[0_2px_10px_rgba(180,83,9,0.45)]',
    label: 'Gold'
  },
  2: {
    asset: '/images/silver_trophy.svg',
    face: 'bg-[linear-gradient(145deg,#f8fafc_0%,#cbd5e1_45%,#64748b_100%)]',
    glow: 'shadow-[0_2px_10px_rgba(100,116,139,0.4)]',
    label: 'Silver'
  },
  3: {
    asset: '/images/bronze_trophy.svg',
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
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-dashed ${light ? 'border-zinc-300/90' : 'border-zinc-700'
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
        className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 ${medal.face
          } ${medal.glow} ${light ? 'ring-black/10' : 'ring-white/20'}`}
        title={`${medal.label} — finished ${ordinal(placement)}`}
        aria-label={`Finished ${ordinal(placement)}`}
      >
        {/* Highlight arc, so the trophy reads as polished metal rather than a flat disc */}
        <span className="pointer-events-none absolute inset-[3px] rounded-full bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,0.85),transparent_58%)]" />
        <img
          src={medal.asset}
          alt=""
          className="relative h-10 w-10 object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
          onError={(e) => {
            const target = e.currentTarget as HTMLElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'inline-block';
          }}
        />
        <Trophy className="relative hidden h-[20px] w-[20px] fill-white/95 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" />
      </div>
    );
  }

  return (
    <div
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${light
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
      className={`text-[10px] font-black uppercase tracking-[0.3em] ${light ? 'text-zinc-500' : 'text-zinc-400'
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
    className={`h-px w-full ${light
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
  startRace,
  brightness
}: EventTierScreenProps) {
  const [isClientMounted, setIsClientMounted] = useState(false);
  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  const effectiveBrightness =
    brightness ??
    (typeof window !== 'undefined'
      ? parseFloat(localStorage.getItem('cyberdrive_brightness') || '5')
      : 5);
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
    if (!isClientMounted) return;
    const frame = requestAnimationFrame(() => {
      setIsScreenMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [isClientMounted]);

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

  const activeDisplayEvent =
    hoveredEvent ||
    (expandedEventId ? tierEvents.find((e) => e.id === expandedEventId) : null) ||
    tierEvents[activeSlideIndex] ||
    tierEvents[0] ||
    null;

  // Staggered slide-up transition from below the screen
  useEffect(() => {
    if (!isClientMounted) return;
    setVisibleCount(0);
    const timers: NodeJS.Timeout[] = [];
    for (let i = 0; i < tierEvents.length; i++) {
      const t = setTimeout(() => {
        setVisibleCount((prev) => Math.max(prev, i + 1));
        playSoundBlip('pop');
      }, 100 + i * 140);
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
  }, [isClientMounted, activeTier, tierEvents.length]);

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
    const containerRect = container.getBoundingClientRect();
    const cardRect = targetCard.getBoundingClientRect();
    const cardLeftInScroll = cardRect.left - containerRect.left + container.scrollLeft;
    const scrollTarget = cardLeftInScroll + targetCard.clientWidth / 2 - containerRect.width / 2;

    container.scrollTo({
      left: Math.max(0, scrollTarget),
      behavior: 'smooth'
    });
    setActiveSlideIndex(index);
  }, []);

  // Center expanded card so the entire ticket is fully visible in the camera viewport.
  const centerExpandedCard = useCallback((
    index: number,
    options: { assumeExpanded?: boolean; behavior?: ScrollBehavior } = {}
  ) => {
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const cards = container.querySelectorAll<HTMLElement>('.event-card-item');
    if (!cards || !cards[index]) return;

    const { assumeExpanded = false, behavior = 'smooth' } = options;
    const targetCard = cards[index];
    const containerRect = container.getBoundingClientRect();
    const cardRect = targetCard.getBoundingClientRect();
    const currentPaddingLeft = parseFloat(window.getComputedStyle(container).paddingLeft) || 0;
    const targetPaddingLeft = assumeExpanded ? containerRect.width * 0.25 : currentPaddingLeft;

    // Predict the final left edge while the expansion transition is still starting.
    const cardLeftInScroll =
      cardRect.left - containerRect.left + container.scrollLeft + targetPaddingLeft - currentPaddingLeft;

    let targetWidth = targetCard.clientWidth;
    if (assumeExpanded || targetWidth < 500) {
      if (containerRect.width >= 1280) targetWidth = 1140;
      else if (containerRect.width >= 1024) targetWidth = 1080;
      else if (containerRect.width >= 768) targetWidth = 980;
      else targetWidth = 820;
    }
    targetWidth = Math.min(targetWidth, containerRect.width - 48);

    const targetCenter = cardLeftInScroll + targetWidth / 2;
    const scrollTarget = targetCenter - containerRect.width / 2;

    container.scrollTo({
      left: Math.max(0, scrollTarget),
      behavior
    });
    setActiveSlideIndex(index);
  }, []);

  const [collapsingEventId, setCollapsingEventId] = useState<string | null>(null);

  const handleMinimizeCard = useCallback(() => {
    if (!expandedEventId || collapsingEventId) return;
    playSoundBlip('select');
    const eventToCollapse = expandedEventId;
    setCollapsingEventId(eventToCollapse);

    const currentIdx = tierEvents.findIndex((e) => e.id === eventToCollapse);

    setTimeout(() => {
      setExpandedEventId(null);
      setCollapsingEventId(null);
      if (currentIdx !== -1) {
        requestAnimationFrame(() => {
          scrollToSlide(currentIdx);
        });
      }
    }, 500);
  }, [expandedEventId, collapsingEventId, tierEvents, scrollToSlide]);

  const handlePrevSlide = () => {
    if (expandedEventId) handleMinimizeCard();
    const nextIdx = Math.max(0, activeSlideIndex - 1);
    scrollToSlide(nextIdx);
  };

  const handleNextSlide = () => {
    if (expandedEventId) handleMinimizeCard();
    const nextIdx = Math.min(tierEvents.length - 1, activeSlideIndex + 1);
    scrollToSlide(nextIdx);
  };

  // Start centering immediately after expansion commits, then make one settled correction.
  useEffect(() => {
    if (!expandedEventId) return;
    const idx = tierEvents.findIndex((e) => e.id === expandedEventId);
    if (idx === -1) return;

    const frame = requestAnimationFrame(() => {
      centerExpandedCard(idx, { assumeExpanded: true });
    });
    const settleTimer = setTimeout(() => {
      centerExpandedCard(idx);
    }, 520);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
    };
  }, [expandedEventId, centerExpandedCard, tierEvents]);

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
          handleMinimizeCard();
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
  }, [activeSlideIndex, expandedEventId, tierEvents.length, handleMinimizeCard]);

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
    const entryFee = getEventEntryFee(event);
    if ((event.requiresLicense && !hasLicense) || playerCredits < entryFee) return;

    playSoundBlip('launch');
    setIsScreenExiting(true);
    setTimeout(() => {
      const accepted = startRace(stage.trackId, stage.layoutId, entryFee);
      if (!accepted) {
        setIsScreenExiting(false);
        return;
      }

      // Save current active event & stage so race victory records it.
      if (typeof window !== 'undefined') {
        localStorage.setItem('cyberdrive_current_career_event', JSON.stringify({
          eventId: event.id,
          stageId: stage.id
        }));
      }
    }, 380);
  };
  const content = (
    <div
      className={`fixed inset-0 z-[9999] w-screen h-screen flex flex-col bg-zinc-950 text-white select-none overflow-hidden font-sans transition-opacity duration-400 ease-out ${
        isScreenExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* 1. DYNAMIC BACKGROUND IMAGE MATCHING EVENT CARD LIGHTING */}
      <div
        className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
        style={{ filter: `brightness(${0.4 + (effectiveBrightness / 5.0) * 0.6})` }}
      >
        <img
          src={tierConfig.bgImage}
          alt={tierConfig.name}
          className="w-full h-full object-cover object-center scale-105 filter blur-[3px] brightness-[0.92] saturate-[1.05]"
        />
        {/* Soft ambient lighting: bright sky preserved, smooth and gentle on eyes */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-transparent to-zinc-950/50" />
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
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center pointer-events-auto w-full -top-12">
        {/* Left Floating Carousel Button */}
        <button
          disabled={activeSlideIndex === 0}
          onClick={handlePrevSlide}
          className={`absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full border border-zinc-800 bg-zinc-950/85 hover:bg-zinc-900 text-white flex items-center justify-center transition-all duration-300 shadow-2xl backdrop-blur-md cursor-pointer ${expandedEventId ? 'opacity-0 pointer-events-none' : activeSlideIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110 active:scale-95 hover:border-zinc-600'
            }`}
        >
          <ChevronLeft className="w-6 h-6 text-zinc-200" />
        </button>

        {/* Right Floating Carousel Button */}
        <button
          disabled={activeSlideIndex === tierEvents.length - 1}
          onClick={handleNextSlide}
          className={`absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full border border-zinc-800 bg-zinc-950/85 hover:bg-zinc-900 text-white flex items-center justify-center transition-all duration-300 shadow-2xl backdrop-blur-md cursor-pointer ${expandedEventId ? 'opacity-0 pointer-events-none' : activeSlideIndex === tierEvents.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110 active:scale-95 hover:border-zinc-600'
            }`}
        >
          <ChevronRight className="w-6 h-6 text-zinc-200" />
        </button>

        {/* Carousel Scroll Container with balanced vertical padding */}
        <div
          ref={carouselRef}
          onScroll={handleScroll}
          onClick={(e) => {
            if (expandedEventId && e.target === carouselRef.current) {
              handleMinimizeCard();
            }
          }}
          className={`relative w-full h-full flex items-center gap-12 sm:gap-16 overflow-x-auto scroll-smooth ${expandedEventId ? '' : 'snap-x snap-mandatory'
            } py-8 pb-8 scrollbar-none`}
          style={{
            paddingLeft: expandedEventId ? '25vw' : '10vw',
            paddingRight: expandedEventId ? '38vw' : '10vw',
            transition: 'padding 500ms ease-out',
            scrollbarWidth: 'none',
            overflowAnchor: 'none',
            msOverflowStyle: 'none',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)',
            maskImage: 'linear-gradient(to right, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)'
          }}
        >
          {tierEvents.map((event, idx) => {
            const wins = getEventFirstPlaceCount(event, eventProgress);
            const totalStages = event.stages.length;
            const isAllWon = wins === totalStages && totalStages > 0;
            const isLocked = event.requiresLicense && !hasLicense;
            const isActiveSlide = idx === activeSlideIndex;
            const isRevealed = idx < visibleCount;
            const isThisExpanded = expandedEventId === event.id;
            const isThisCollapsing = collapsingEventId === event.id;
            const isVisibleExpanded = isThisExpanded && !isThisCollapsing;
            const regulations = getEventRegulations(event);
            const tireRestriction = getEventTireRestriction(event);
            const prizeTable = getEventPrizeTable(event);
            const licenseRequirement = getEventLicenseRequirement(event);
            const entryFee = getEventEntryFee(event);
            const eventStages = event.stages;
            const prizeRows = [
              [prizeTable[0], prizeTable[3]],
              [prizeTable[1], prizeTable[4]],
              [prizeTable[2], prizeTable[5]],
            ];

            return (
              <div
                key={event.id}
                onClick={() => {
                  if (!isThisExpanded) {
                    playSoundBlip('select');
                    setExpandedEventId(event.id);
                    setActiveSlideIndex(idx);
                  } else if (isVisibleExpanded) {
                    handleMinimizeCard();
                  }
                }}
                onMouseEnter={() => {
                  setHoveredEvent(event);
                  if (!isThisExpanded) {
                    playSoundBlip('hover');
                  }
                }}
                onMouseLeave={() => setHoveredEvent(null)}
                className={`event-card-item shrink-0 group relative flex flex-row h-[500px] sm:h-[530px] rounded-[32px] overflow-hidden ${isVisibleExpanded
                  ? 'w-[820px] sm:w-[980px] md:w-[1080px] lg:w-[1140px] max-w-[calc(100vw-48px)] z-20 cursor-default'
                  : 'w-[240px] sm:w-[270px] cursor-pointer hover:scale-105 hover:-translate-y-2 snap-center'
                  } ${isRevealed && isScreenMounted && !isScreenExiting
                    ? 'translate-y-0 pointer-events-auto'
                    : 'translate-y-[650px] pointer-events-none'
                  } opacity-100 bg-transparent`}
                style={{
                  transition: isVisibleExpanded
                    ? 'translate 500ms cubic-bezier(0.32, 0.72, 0, 1), width 500ms cubic-bezier(0.32, 0.72, 0, 1)'
                    : 'translate 650ms cubic-bezier(0.22, 1, 0.36, 1), width 500ms cubic-bezier(0.32, 0.72, 0, 1)'
                }}
              >
                {/* Left Column: Event Artwork Poster Card (Front Sleeve) */}
                <div
                  onClick={(e) => {
                    if (isVisibleExpanded) {
                      e.stopPropagation();
                      handleMinimizeCard();
                    }
                  }}
                  className={`relative z-20 w-[240px] sm:w-[270px] h-full shrink-0 flex flex-col justify-between p-6 overflow-hidden select-none cursor-pointer bg-zinc-950 shadow-[8px_0_24px_rgba(0,0,0,0.65)] transition-[border-radius] duration-400 ease-in-out ${isVisibleExpanded ? 'rounded-l-[32px]' : 'rounded-[32px]'
                    }`}
                  title={isVisibleExpanded ? 'Click to collapse into card' : undefined}
                >
                  {/* Minimize badge when expanded */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMinimizeCard();
                    }}
                    className={`absolute top-4 right-4 z-30 flex items-center gap-1.5 px-3 py-1.5 bg-black/65 hover:bg-black/90 backdrop-blur-md rounded-full text-[10px] font-black text-white uppercase tracking-wider transition-all duration-300 shadow-xl border border-white/25 cursor-pointer hover:scale-105 active:scale-95 ${isVisibleExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                      }`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-[#38ecff]" />
                    <span>Minimize</span>
                  </div>

                  {/* Inner Box Artwork Image */}
                  <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    <img
                      src={event.bgImage}
                      alt={event.name}
                      className="w-full h-full object-cover object-center filter brightness-[0.96] saturate-[1.05] transition-all duration-700 ease-in-out"
                    />
                    {/* Subtle soft top vignette only for title legibility, keeping poster bright */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/20 pointer-events-none" />
                  </div>

                  {/* Top: Event Title + Dash */}
                  <div className="relative z-10 flex flex-col pt-2 text-left">
                    {isLocked && (
                      <div className="flex items-center gap-1 text-[9px] font-mono text-rose-400 bg-rose-950/85 border border-rose-800/60 px-2.5 py-0.5 rounded-md mb-2.5 w-fit">
                        <Lock className="w-3 h-3" />
                        <span>LICENSE REQ</span>
                      </div>
                    )}
                    <h3 className="text-2xl sm:text-[28px] font-black text-white uppercase tracking-wider leading-[1.05] drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
                      {event.name}
                    </h3>
                    <div className="w-6 h-1 bg-white/90 rounded-full mt-2.5 shadow-sm" />
                  </div>

                  {/* Middle Spacer */}
                  <div className="flex-1" />

                  {/* Bottom: Checkered Flag Pill with Races Completed */}
                  <div className="relative z-10 bg-slate-950/85 border border-white/15 backdrop-blur-md rounded-2xl p-2.5 sm:p-3 flex items-center gap-3 shadow-xl">
                    <div className="w-10 h-10 rounded-full bg-slate-800/90 border border-white/10 flex items-center justify-center shrink-0">
                      <Flag className="w-5 h-5 text-[#38ecff] fill-[#38ecff]/20" />
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="text-base sm:text-lg font-black font-mono text-white leading-none">
                        {wins} / {totalStages}
                      </span>
                      <span className="text-[8px] sm:text-[9px] font-extrabold tracking-wider text-[#38ecff] uppercase mt-1">
                        RACES COMPLETED
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Details Block: Physically shifts to the left into event card like a sleeve, NO OPACITY CHANGE */}
                <div
                  className={`relative z-10 w-[580px] sm:w-[710px] md:w-[810px] lg:w-[870px] shrink-0 flex flex-row h-full overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isVisibleExpanded
                    ? 'translate-x-0 pointer-events-auto'
                    : '-translate-x-full pointer-events-none'
                    }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* MIDDLE COLUMN: Regulation, Tires Restrictions, License, Prize Table */}
                  <div
                    className="flex-1 flex flex-col justify-between px-6 sm:px-8 py-6 bg-[#dbe5ee] text-slate-950 select-none overflow-y-auto scrollbar-none min-w-[320px]"
                    style={{
                      WebkitMaskImage:
                        'radial-gradient(circle 14px at 100% 0, transparent 13.5px, black 14px), radial-gradient(circle 14px at 100% 100%, transparent 13.5px, black 14px)',
                      maskImage:
                        'radial-gradient(circle 14px at 100% 0, transparent 13.5px, black 14px), radial-gradient(circle 14px at 100% 100%, transparent 13.5px, black 14px)',
                      WebkitMaskComposite: 'destination-in',
                      maskComposite: 'intersect'
                    }}
                  >
                    {/* 1. Regulation */}
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-[#38ecff] border border-[#28cee0] flex items-center justify-center text-slate-950 shadow-sm shrink-0 mt-0.5">
                        <SlidersHorizontal className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col gap-1 min-w-0 flex-1 text-left">
                        <h4 className="text-xl font-black uppercase tracking-wider text-slate-950">
                          REGULATION
                        </h4>
                        <ul className="flex flex-col gap-0.5">
                          {regulations.map((condition, rIdx) => {
                            const labelText = condition.label.toLowerCase().includes('only')
                              ? condition.label
                              : `${condition.label} only`;
                            return (
                              <li key={rIdx} className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                                <span className="text-slate-950 text-[10px]">•</span>
                                <span>{labelText}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>

                    {/* Divider line */}
                    <div className="h-px w-full bg-[#b4c3d0] my-1.5" />

                    {/* 2. Tires Restrictions */}
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-[#38ecff] border border-[#28cee0] flex items-center justify-center text-slate-950 shadow-sm shrink-0 mt-0.5">
                        <Disc className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col gap-1 min-w-0 flex-1 text-left">
                        <h4 className="text-xl font-black uppercase tracking-wider text-slate-950">
                          TIRES RESTRICTIONS
                        </h4>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="text-slate-950 text-[10px]">•</span>
                          <span>{tireRestriction.label}</span>
                        </div>
                      </div>
                    </div>

                    {/* Divider line */}
                    <div className="h-px w-full bg-[#b4c3d0] my-1.5" />

                    {/* 3. License and Entry Fee */}
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-[#38ecff] border border-[#28cee0] flex items-center justify-center text-slate-950 shadow-sm shrink-0 mt-0.5">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div className="relative grid grid-cols-2 gap-4 min-w-0 flex-1 text-left">
                        <div
                          className="pointer-events-none absolute inset-y-[-17] left-45 w-px bg-[#b4c3d0]"
                          aria-hidden="true"
                        />
                        <div className="flex flex-col gap-1 min-w-0">
                          <h4 className="text-xl font-black uppercase tracking-wider text-slate-950">
                            LICENSE
                          </h4>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="text-slate-950 text-[10px]">•</span>
                            <span>{licenseRequirement.tier ? licenseRequirement.label : 'Not Required'}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                          <h4 className="text-xl font-black uppercase tracking-wider text-slate-950">
                            ENTRY FEE
                          </h4>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="text-slate-950 text-[10px]">•</span>
                            <span>{entryFee.toLocaleString()} CR</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Divider line */}
                    <div className="h-px w-full bg-[#b4c3d0] my-1.5" />

                    {/* 4. Prize Table */}
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-[#38ecff] border border-[#28cee0] flex items-center justify-center text-slate-950 shadow-sm shrink-0 mt-0.5">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col gap-1.5 min-w-0 flex-1 text-left">
                        <h4 className="text-xl font-black uppercase tracking-wider text-slate-950">
                          PRIZE
                        </h4>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-0.5">
                          {/* Left Column: 1st, 2nd, 3rd */}
                          <div className="flex min-w-0 flex-col gap-1">
                            {prizeRows.map(([left]) => (
                              <div
                                key={left.rank}
                                className="relative flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/70 border border-[#b8c8d6] shadow-sm"
                              >
                                <div className="flex items-center">
                                  <span className="text-xs font-black text-slate-950 w-5">
                                    {left.place.split(' ')[0]}
                                  </span>
                                </div>
                                <span
                                  className="pointer-events-none absolute left-4 top-1/2 z-0 h-15 w-15 -translate-y-1/2"
                                  aria-hidden="true"
                                >
                                  <img
                                    src={
                                      left.rank === 1
                                        ? '/images/gold_trophy.svg'
                                        : left.rank === 2
                                          ? '/images/silver_trophy.svg'
                                          : '/images/bronze_trophy.svg'
                                    }
                                    alt=""
                                    className="pointer-events-none h-full w-full object-contain"
                                    onError={(e) => {
                                      const target = e.currentTarget as HTMLElement;
                                      target.style.display = 'none';
                                      const fallback = target.nextElementSibling as HTMLElement;
                                      if (fallback) fallback.style.display = 'inline-block';
                                    }}
                                  />
                                  <span className="pointer-events-none absolute inset-0 hidden text-center text-xl leading-none">
                                    {left.rank === 1 ? '🏆' : left.rank === 2 ? '🥈' : '🥉'}
                                  </span>
                                </span>
                                <span className="relative z-10 text-xs font-black font-mono text-cyan-950 tabular-nums">
                                  {left.amount.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Right Column: 4th, 5th, 6th */}
                          <div className="flex min-w-0 flex-col gap-1">
                            {prizeRows.map(([, right]) => (
                              <div
                                key={right.rank}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/70 border border-[#b8c8d6] shadow-sm"
                              >
                                <span className="text-xs font-black text-slate-950">
                                  {right.place.split(' ')[0]}
                                </span>
                                <span className="text-xs font-black font-mono text-cyan-950 tabular-nums">
                                  {right.amount.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Vertical Ticket Perforation Divider */}
                  <div className="relative w-0 flex items-stretch border-r-2 border-dashed border-[#8da0b3] my-3.5 z-10" />

                  {/* RIGHT COLUMN: Ticket Stub (Stages List + Barcode + ADMIT ONE) */}
                  <div
                    className="relative w-[240px] sm:w-[270px] h-full shrink-0 flex flex-col justify-between p-5 bg-[#dbe5ee] select-none rounded-r-[32px] overflow-hidden"
                    style={{
                      WebkitMaskImage:
                        'radial-gradient(circle 14px at 0 0, transparent 13.5px, black 14px), radial-gradient(circle 14px at 0 100%, transparent 13.5px, black 14px)',
                      maskImage:
                        'radial-gradient(circle 14px at 0 0, transparent 13.5px, black 14px), radial-gradient(circle 14px at 0 100%, transparent 13.5px, black 14px)',
                      WebkitMaskComposite: 'destination-in',
                      maskComposite: 'intersect'
                    }}
                  >
                    {/* Soft ambient cyan glow in background top right */}
                    <div
                      aria-hidden
                      className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-[#38ecff]/25 blur-xl pointer-events-none"
                    />

                    {/* Top: Flag Icon + Series Title + Dash & Close Button */}
                    <div className="relative z-10 flex items-start justify-between gap-2">
                      <div className="flex flex-col text-left">
                        <div className="w-8 h-8 rounded-xl bg-[#38ecff] border border-[#28cee0] flex items-center justify-center text-slate-950 mb-1.5 shadow-sm">
                          <Flag className="w-4 h-4 fill-slate-950/20" />
                        </div>
                        <h3 className="text-base sm:text-lg font-black text-slate-950 uppercase tracking-wide leading-tight">
                          {event.name}
                        </h3>
                        <div className="w-5 h-1 bg-[#38ecff] rounded-full mt-1.5 mb-2 shadow-sm" />
                      </div>

                      {/* Close / Minimize Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMinimizeCard();
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/10 hover:bg-slate-900/20 text-slate-800 hover:text-slate-950 text-[10px] font-black tracking-wider uppercase transition-all cursor-pointer border border-slate-900/15 active:scale-95 shadow-sm shrink-0"
                        title="Minimize event card"
                      >
                        <span>✕</span>
                        <span>Close</span>
                      </button>
                    </div>

                    {/* Middle: Stage list (Canopy Speedway, Sprint Circuit, etc.) */}
                    <div className="relative z-10 flex-1 flex flex-col gap-2 overflow-y-auto scrollbar-none my-1">
                      {eventStages.map((stage) => {
                        const isStageLocked = event.requiresLicense && !hasLicense;

                        return (
                          <div
                            key={stage.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isStageLocked) handleLaunchStage(event, stage);
                            }}
                            className={`flex items-center gap-2.5 p-1.5 rounded-xl border border-[#b8c8d6] bg-white/70 hover:border-[#38ecff] hover:bg-white transition-all cursor-pointer group/stage shadow-sm ${isStageLocked ? 'opacity-40 cursor-not-allowed' : ''
                              }`}
                            title={isStageLocked ? 'License required' : `Race ${trackNameFor(stage)}`}
                          >
                            {/* Curved circuit path icon in cyan ring */}
                            <div className="w-8 h-8 rounded-xl bg-[#38ecff] border border-[#28cee0] flex items-center justify-center shrink-0 text-slate-950 group-hover/stage:bg-[#28cee0] group-hover/stage:text-white transition-colors shadow-sm">
                              <svg className="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24">
                                <path d="M4 12a8 8 0 0 1 16 0c0 4-3 7-8 7s-8-3-8-7z" />
                              </svg>
                            </div>
                            <div className="flex flex-col min-w-0 flex-1 text-left">
                              <span className="text-[11px] font-black text-slate-950 uppercase truncate leading-tight group-hover/stage:text-cyan-950 transition-colors">
                                {trackNameFor(stage)}
                              </span>
                              <span className="text-[10px] font-bold text-slate-800 mt-0.5">
                                {stage.laps} Laps
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom: Barcode + ADMIT ONE */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (eventStages[0]) handleLaunchStage(event, eventStages[0]);
                      }}
                      className="relative z-10 pt-2.5 border-t border-[#b4c3d0] flex flex-col items-center gap-1.5 cursor-pointer group/barcode hover:opacity-90 transition-opacity"
                      title="Enter Event Race"
                    >
                      {/* Crisp vertical barcode bars */}
                      <div className="flex items-center justify-center gap-[2px] h-8 w-full px-1">
                        <span className="w-[2px] h-full bg-slate-950" />
                        <span className="w-[1px] h-full bg-slate-950" />
                        <span className="w-[3px] h-full bg-slate-950" />
                        <span className="w-[1px] h-full bg-slate-950" />
                        <span className="w-[2px] h-full bg-slate-950" />
                        <span className="w-[1px] h-full bg-slate-950" />
                        <span className="w-[3.5px] h-full bg-slate-950" />
                        <span className="w-[1.5px] h-full bg-slate-950" />
                        <span className="w-[2px] h-full bg-slate-950" />
                        <span className="w-[3px] h-full bg-slate-950" />
                        <span className="w-[1px] h-full bg-slate-950" />
                        <span className="w-[2px] h-full bg-slate-950" />
                        <span className="w-[1.5px] h-full bg-slate-950" />
                        <span className="w-[3px] h-full bg-slate-950" />
                        <span className="w-[1px] h-full bg-slate-950" />
                        <span className="w-[2px] h-full bg-slate-950" />
                        <span className="w-[3.5px] h-full bg-slate-950" />
                        <span className="w-[1px] h-full bg-slate-950" />
                        <span className="w-[2px] h-full bg-slate-950" />
                        <span className="w-[1.5px] h-full bg-slate-950" />
                        <span className="w-[3px] h-full bg-slate-950" />
                        <span className="w-[1px] h-full bg-slate-950" />
                        <span className="w-[2px] h-full bg-slate-950" />
                        <span className="w-[3.5px] h-full bg-slate-950" />
                        <span className="w-[1.5px] h-full bg-slate-950" />
                        <span className="w-[2px] h-full bg-slate-950" />
                      </div>

                      <div className="flex items-center gap-1 text-[9px] font-black text-cyan-950 tracking-widest uppercase group-hover/barcode:text-[#38ecff] transition-colors">
                        <span>›</span>
                        <span>ADMIT ONE</span>
                        <span>‹</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. MOVIE-STYLE BOTTOM BAR (Always shows active event description) */}
      <EventSubtitleBar event={activeDisplayEvent} />
    </div>
  );

  if (!isClientMounted || typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
