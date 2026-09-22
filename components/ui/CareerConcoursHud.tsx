'use client';

import React, { useMemo } from 'react';
import { CarConfig } from '../config/CarDatabase';
import { DealerThreeCarIcon } from './DealerThreeCarIcon';

/* ============================================================================
   CAREER CONCOURS HUD
   ----------------------------------------------------------------------------
   Replaces the old full-width career header bar with a single "concours
   plaque" welded into the top-right corner, so the 3D world map is no longer
   cut off across its whole width by a solid slab.

   Visual language: graphite glass, champagne-gold hairlines, engraved small
   caps and tabular numerals - luxury watch boutique / car-show display plaque.
   ========================================================================== */

const GOLD = '#C9A961';
const CHAMPAGNE = '#E6D2A8';
const IVORY = '#F4EFE3';

/** Peak crank power from a real torque curve (Nm) - kW to hp constant 7127. */
const powerFromTorqueCurve = (car: CarConfig): number | null => {
  if (!car.torqueCurve || car.torqueCurve.length === 0) return null;
  let peak = 0;
  for (const point of car.torqueCurve) {
    const hp = (point.torque * point.rpm) / 7127;
    if (hp > peak) peak = hp;
  }
  return peak > 0 ? peak : null;
};

/**
 * Most cars in the database only carry arcade stats, so a headline BHP figure
 * is derived from accelerationRate on a line calibrated against cars with
 * documented real output (Hatchback-X ~120, Ford GT ~550). Cars that do have a
 * genuine torque curve report their real peak instead.
 */
export const getDisplayBhp = (car: CarConfig): number => {
  const measured = powerFromTorqueCurve(car);
  const value = measured ?? car.accelerationRate * 1433 - 52;
  return Math.max(60, Math.round(value / 5) * 5);
};

const DRIVETRAIN_LABEL: Record<CarConfig['driveType'], string> = {
  FWD: 'FWD',
  RWD: 'RWD',
  AWD: 'AWD'
};

/** Struck-metal finish for the licence seal, one per career tier. */
const SEAL_METALS: Record<string, { face: string; rim: string; letter: string }> = {
  novice: {
    face: 'radial-gradient(circle at 34% 28%, #46464A 0%, #2A2A2D 55%, #161618 100%)',
    rim: 'rgba(160,160,168,0.45)',
    letter: '#B7B7BE'
  },
  bronze: {
    face: 'radial-gradient(circle at 34% 28%, #8C6236 0%, #5A3A1C 55%, #2E1D0E 100%)',
    rim: 'rgba(201,169,97,0.45)',
    letter: '#E6D2A8'
  },
  silver: {
    face: 'radial-gradient(circle at 34% 28%, #EDEFF2 0%, #A9B2BA 55%, #5C646C 100%)',
    rim: 'rgba(237,239,242,0.55)',
    letter: '#23272B'
  },
  gold: {
    face: 'radial-gradient(circle at 34% 28%, #F4DE9E 0%, #C9A961 55%, #6E5220 100%)',
    rim: 'rgba(244,222,158,0.6)',
    letter: '#2A1F08'
  },
  platinum: {
    face: 'radial-gradient(circle at 34% 28%, #FBFCFE 0%, #C7D0D8 52%, #79838D 100%)',
    rim: 'rgba(255,255,255,0.7)',
    letter: '#1D2226'
  }
};

/** Engraved champagne hairline that separates two plaque cells. */
const CellSeam = ({ className = '' }: { className?: string }) => (
  <div
    className={`my-1.5 w-px shrink-0 self-stretch ${className}`}
    style={{
      background: `linear-gradient(to bottom, transparent, ${GOLD}59 22%, ${CHAMPAGNE}8C 50%, ${GOLD}59 78%, transparent)`
    }}
  />
);

/** Micro label in the plaque's engraved small-caps voice. */
const CellLabel = ({ children }: { children: React.ReactNode }) => (
  <span
    className="font-speed whitespace-nowrap text-[7px] font-semibold uppercase leading-none tracking-[0.36em]"
    style={{ color: `${GOLD}B3` }}
  >
    {children}
  </span>
);

export interface CareerConcoursHudProps {
  car: CarConfig;
  carName?: string;
  credits: number;
  licenseLabel: string;
  time: string;
  date: string;
  onReturnToGarage: () => void;
  onHover?: () => void;
}

export function CareerConcoursHud({
  car,
  carName,
  credits,
  licenseLabel,
  time,
  date,
  onReturnToGarage,
  onHover
}: CareerConcoursHudProps) {
  const bhp = useMemo(() => getDisplayBhp(car), [car]);
  const displayName = carName || car.name;
  const [hours, minutes] = time.split(':');
  const seal = SEAL_METALS[licenseLabel.toLowerCase()] ?? SEAL_METALS.novice;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
      {/* Corner scrim keeping pale engraving legible where the plaque meets sky */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-32 w-[70%]"
        style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(0,0,0,0.55) 0%, transparent 72%)' }}
      />

      <div className="relative flex items-start justify-end">
        {/* ============ DRIVER PLAQUE - flush into the top-right corner ============ */}
        <div
          className="concours-rise pointer-events-auto relative flex h-[62px] shrink-0 items-stretch overflow-hidden rounded-bl-[4px] backdrop-blur-2xl sm:h-[70px]"
          style={{
            background:
              'linear-gradient(158deg, rgba(23,21,18,0.93) 0%, rgba(12,12,13,0.9) 46%, rgba(18,16,14,0.93) 100%)',
            boxShadow: '-14px 18px 48px rgba(0,0,0,0.6)'
          }}
        >
          {/* Archive texture: the geometric eye graphic, warmed to the gold palette */}
          <img
            src="/images/career_header_eye.jpg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.13] mix-blend-screen"
            style={{ filter: 'sepia(1) saturate(1.7) hue-rotate(-14deg) contrast(1.05)' }}
          />

          {/* Slow specular sweep across the glass */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="concours-sheen absolute inset-y-0 -left-1/3 w-1/3"
              style={{
                background: `linear-gradient(90deg, transparent, ${CHAMPAGNE}24 45%, ${IVORY}30 55%, transparent)`
              }}
            />
          </div>

          {/* Plaque corner marks - only on the edges that are not against the screen */}
          {[
            'left-1 top-1 border-l border-t',
            'left-1 bottom-1 border-l border-b',
            'right-1 bottom-1 border-r border-b'
          ].map((corner) => (
            <span
              key={corner}
              aria-hidden="true"
              className={`pointer-events-none absolute h-2 w-2 ${corner}`}
              style={{ borderColor: 'rgba(255,255,255,0.28)' }}
            />
          ))}

          {/* ---- CELL 1 - MACHINE ---- */}
          <div className="relative flex items-center gap-2.5 pl-3.5 pr-3.5 sm:gap-3.5 sm:pl-4 sm:pr-4">
            <div className="relative hidden h-10 w-20 shrink-0 items-center justify-center sm:flex sm:h-12 sm:w-24">
              {/*
                The icon renderer centres the model on the box origin, so the
                wheels land a little under the middle - the light pool is
                anchored there rather than at the bottom of the cell, and every
                edge stays soft so nothing reads as a pasted-on shape.
              */}
              <div
                className="pointer-events-none absolute left-1/2 top-[63%] h-[26px] w-[82px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-[7px]"
                style={{
                  background: `radial-gradient(ellipse at center, ${IVORY}66 0%, ${CHAMPAGNE}2E 46%, transparent 72%)`
                }}
              />

              {/* Contact shadow so the car sits in the pool instead of floating */}
              <div
                className="pointer-events-none absolute left-1/2 top-[66%] h-[10px] w-[50px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-[5px]"
                style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, transparent 72%)' }}
              />

              <DealerThreeCarIcon
                car={car}
                isSliderIcon={true}
                centerModel={true}
                className="absolute inset-0 ml-2 h-full w-full scale-150 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)]"
              />
            </div>

            <div className="flex flex-col justify-center gap-[5px] text-left">
              <span
                className="font-syne max-w-[150px] truncate text-[12px] font-extrabold uppercase leading-none tracking-[0.06em] sm:max-w-[220px] sm:text-[14px]"
                style={{ color: IVORY, textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}
              >
                {displayName}
              </span>

              {/* Engraved spec line: power and drivetrain */}
              <div className="flex items-center gap-2">
                <span className="flex items-baseline gap-[3px]">
                  <span
                    className="font-mono text-[11px] font-bold leading-none tabular-nums sm:text-[12px]"
                    style={{ color: CHAMPAGNE }}
                  >
                    {bhp}
                  </span>
                  <span
                    className="font-speed text-[7px] font-semibold uppercase leading-none tracking-[0.24em]"
                    style={{ color: `${GOLD}CC` }}
                  >
                    bhp
                  </span>
                </span>

                <span className="h-[3px] w-[3px] rotate-45" style={{ backgroundColor: `${GOLD}99` }} />

                <span
                  className="font-speed text-[9px] font-bold uppercase leading-none tracking-[0.22em]"
                  style={{ color: `${IVORY}CC` }}
                >
                  {DRIVETRAIN_LABEL[car.driveType]}
                </span>
              </div>
            </div>
          </div>

          <CellSeam />

          {/* ---- CELL 2 - LICENCE SEAL ---- */}
          <div className="relative hidden flex-col items-center justify-center gap-[6px] px-3.5 sm:flex sm:px-4">
            <div
              className="concours-seal relative flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: seal.face, border: `1px solid ${seal.rim}` }}
            >
              {/* Milled seal edge */}
              <span
                className="pointer-events-none absolute inset-[2px] rounded-full"
                style={{ border: `1px dashed ${seal.letter}59` }}
              />
              <span
                className="font-syne text-[10px] font-extrabold leading-none"
                style={{ color: seal.letter, textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}
              >
                {licenseLabel.charAt(0).toUpperCase()}
              </span>
            </div>
            <CellLabel>{licenseLabel}</CellLabel>
          </div>

          <CellSeam className="hidden sm:block" />

          {/* ---- CELL 3 - BALANCE ---- */}
          <div className="relative flex flex-col items-end justify-center gap-[6px] px-3.5 sm:px-4">
            <CellLabel>Balance</CellLabel>
            <div className="flex items-baseline gap-1.5">
              <span
                className="font-mono text-[14px] font-bold leading-none tracking-tight tabular-nums sm:text-[16px]"
                style={{
                  color: IVORY,
                  textShadow: `0 1px 10px ${GOLD}4D, 0 2px 8px rgba(0,0,0,0.8)`
                }}
              >
                {credits.toLocaleString()}
              </span>
              <span
                className="font-speed text-[8px] font-bold uppercase leading-none tracking-[0.26em]"
                style={{ color: GOLD }}
              >
                cr
              </span>
            </div>
          </div>

          <CellSeam />

          {/* ---- CELL 4 - CHRONOMETER (returns to garage) ---- */}
          <button
            type="button"
            onClick={onReturnToGarage}
            onMouseEnter={onHover}
            title="Return to Garage (ESC)"
            className="group relative flex cursor-pointer select-none flex-col items-center justify-center gap-[6px] px-3.5 transition-colors duration-300 hover:bg-white/[0.04] sm:px-5"
          >
            <span className="flex items-baseline">
              <span
                className="font-mono text-[15px] font-bold leading-none tabular-nums sm:text-[17px]"
                style={{ color: IVORY, textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}
              >
                {hours}
              </span>
              <span
                className="concours-colon font-mono text-[15px] font-bold leading-none sm:text-[17px]"
                style={{ color: `${CHAMPAGNE}CC` }}
              >
                :
              </span>
              <span
                className="font-mono text-[15px] font-bold leading-none tabular-nums sm:text-[17px]"
                style={{ color: IVORY, textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}
              >
                {minutes}
              </span>
            </span>

            {/* Date engraving swaps to the garage prompt on hover */}
            <span className="relative block h-[7px] w-full min-w-[72px]">
              <span
                className="font-speed absolute inset-0 flex items-center justify-center text-[7px] font-semibold uppercase leading-none tracking-[0.3em] transition-opacity duration-300 group-hover:opacity-0"
                style={{ color: `${IVORY}A6` }}
              >
                {date}
              </span>
              <span
                className="font-speed absolute inset-0 flex items-center justify-center text-[7px] font-semibold uppercase leading-none tracking-[0.3em] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ color: CHAMPAGNE }}
              >
                Garage
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default CareerConcoursHud;
