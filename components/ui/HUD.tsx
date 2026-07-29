'use client';

import React, { useEffect } from 'react';
import { Coins, Fuel, Timer, Trophy } from 'lucide-react';
import * as THREE from 'three';
import { TRACKS_DATABASE, TrackNode } from '../config/TrackDatabase';
import { HUDConfig } from '../option';
import { TIRE_COMPOUNDS, TireCompoundType } from '../objects/TireCompound';
import type { SuggestedGearAdvice } from '../engine/SuggestedGearAdvisor';

const getTempColorClass = (temp: number, compoundId: string) => {
  const config = TIRE_COMPOUNDS[compoundId as TireCompoundType] || TIRE_COMPOUNDS.normal;
  const lower = config.optimalTemperature - config.temperatureWindow;
  const upper = config.optimalTemperature + config.temperatureWindow;
  if (temp < lower) return 'text-cyan-400';
  if (temp > upper) return 'text-rose-500 animate-pulse font-bold';
  return 'text-emerald-400 font-bold';
};

interface HUDProps {
  activeMode: string;
  gameStatus: string;
  hudConfig: HUDConfig;
  timeRemaining: number;
  currentLapTime: number;
  checkpointIndex: number;
  totalCheckpoints: number;
  activeTrackId: string;
  minimapCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  placement: number;
  totalParticipants: number;
  placementShift: 'up' | 'down' | null;
  totalRaceTime: number;
  bestLapTime: number;
  tutorialStep: number;
  driftScore: number;
  driftMultiplier: number;
  recentDriftGain: number;
  brakeInput: number;
  throttleInput: number;
  speed: number;
  gear: number | string;
  suggestedGearAdvice: SuggestedGearAdvice | null;
  rpm: number;
  isShifting: boolean;
  fuelLiters: number;
  fuelCapacityLiters: number;
  fuelConsumptionLitersPerHour: number;
  isEngineStalled: boolean;
  cameraViewMode: string;
  showMirrorInTPS: boolean;
  engineRef: React.RefObject<any>;
  tireWear: number;
  tireTemperature: number;
  tireCompound: string;
  tireWearEnabled: boolean;
}

const getTrackLength = (path: THREE.Vector3[]) => {
  if (!path || path.length < 3) return 0;
  const roadPoints = path.map(p => new THREE.Vector3(p.x, 0.01, p.z));
  const curve = new THREE.CatmullRomCurve3(roadPoints, true);
  return curve.getLength();
};

const formatDistance = (meters: number) => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
};

const formatTime = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 1000);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const darkenColor = (hex: string, amount = 0.45) => {
  let color = hex.replace('#', '');
  if (color.length === 3) {
    color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
  }
  const num = parseInt(color, 16);
  if (isNaN(num)) return '#000000';
  let r = (num >> 16);
  let g = ((num >> 8) & 0x00ff);
  let b = (num & 0x0000ff);

  r = Math.max(0, Math.floor(r * (1 - amount)));
  g = Math.max(0, Math.floor(g * (1 - amount)));
  b = Math.max(0, Math.floor(b * (1 - amount)));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

export default function HUD({
  activeMode,
  gameStatus,
  hudConfig,
  timeRemaining,
  currentLapTime,
  checkpointIndex,
  totalCheckpoints,
  activeTrackId,
  minimapCanvasRef,
  placement,
  totalParticipants,
  placementShift,
  totalRaceTime,
  bestLapTime,
  tutorialStep,
  driftScore,
  driftMultiplier,
  recentDriftGain,
  brakeInput,
  throttleInput,
  speed,
  gear,
  suggestedGearAdvice,
  rpm,
  isShifting,
  fuelLiters,
  fuelCapacityLiters,
  fuelConsumptionLitersPerHour,
  isEngineStalled,
  cameraViewMode,
  showMirrorInTPS,
  engineRef,
  tireWear,
  tireTemperature,
  tireCompound,
  tireWearEnabled,
}: HUDProps) {

  // Canvas minimap rendering loop
  useEffect(() => {
    let animFrameId: number;

    const drawMinimap = () => {
      animFrameId = requestAnimationFrame(drawMinimap);

      const canvas = minimapCanvasRef.current;
      if (!canvas || !engineRef.current || activeMode === 'garage' || gameStatus === 'idle') return;

      const engine = engineRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Set translucent background
      ctx.fillStyle = 'rgba(9, 13, 22, 0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const padding = 15;
      const width = canvas.width - padding * 2;
      const height = canvas.height - padding * 2;

      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      let drawRoad = false;
      let minimapPoints: THREE.Vector3[] = [];

      if (activeMode === 'free_roam' || activeMode === 'tutorial') {
        // Open world bounds (-140 to 140) covering the 260x260 grid & buildings
        minX = -140;
        maxX = 140;
        minZ = -140;
        maxZ = 140;
      } else {
        const activeTrack = TRACKS_DATABASE.find(t => t.id === activeTrackId);
        if (activeTrack && activeTrack.path.length > 0) {
          drawRoad = true;
          const getPos = (pt: THREE.Vector3 | TrackNode) => 'isVector3' in pt ? pt : pt.pos;
          const pathPositions = activeTrack.path.map(pt => getPos(pt));
          const minimapCurve = pathPositions.length > 2
            ? new THREE.CatmullRomCurve3(
                pathPositions.map(pt => new THREE.Vector3(pt.x, 0, pt.z)),
                true,
                activeTrack.curveType || 'centripetal',
                activeTrack.tension || 0.5
              )
            : null;
          minimapPoints = minimapCurve
            ? minimapCurve.getSpacedPoints(Math.max(96, pathPositions.length * 16))
            : pathPositions.map(p => new THREE.Vector3(p.x, 0, p.z));

          minimapPoints.forEach(pos => {
            if (pos.x < minX) minX = pos.x;
            if (pos.x > maxX) maxX = pos.x;
            if (pos.z < minZ) minZ = pos.z;
            if (pos.z > maxZ) maxZ = pos.z;
          });
        } else {
          minX = -100;
          maxX = 100;
          minZ = -100;
          maxZ = 100;
        }
      }

      const rangeX = maxX - minX || 1;
      const rangeZ = maxZ - minZ || 1;
      const scale = Math.min(width / rangeX, height / rangeZ);

      // Center offsets
      const offsetX = padding + (width - rangeX * scale) / 2;
      const offsetZ = padding + (height - rangeZ * scale) / 2;

      const mapX = (x: number) => offsetX + (x - minX) * scale;
      const mapZ = (z: number) => offsetZ + (z - minZ) * scale;

      // In Open World mode, draw grid boundary frame
      if (activeMode === 'free_roam') {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
        ctx.lineWidth = 1.5;
        const bX = mapX(-130);
        const bZ = mapZ(-130);
        const bW = 260 * scale;
        const bH = 260 * scale;
        ctx.strokeRect(bX, bZ, bW, bH);
      }

      // Draw road line for race mode
      if (drawRoad && minimapPoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(mapX(minimapPoints[0].x), mapZ(minimapPoints[0].z));
        for (let i = 1; i < minimapPoints.length; i++) {
          ctx.lineTo(mapX(minimapPoints[i].x), mapZ(minimapPoints[i].z));
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.55)'; // cyan road line
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Draw AI Opponents
      if (activeMode === 'race' && engine.currentModeInstance && 'aiCars' in engine.currentModeInstance) {
        const aiCars = (engine.currentModeInstance as any).aiCars as any[];
        if (aiCars) {
          aiCars.forEach(ai => {
            const aiPos = ai.vehicle.pos;
            const dotColor = ai.config.color || '#a855f7';
            ctx.fillStyle = dotColor;
            ctx.beginPath();
            ctx.arc(mapX(aiPos.x), mapZ(aiPos.z), 4, 0, Math.PI * 2);
            ctx.fill();

            // Draw a darker outliner than the dot color
            ctx.strokeStyle = darkenColor(dotColor, 0.45);
            ctx.lineWidth = 1.25;
            ctx.stroke();
          });
        }
      }

      // Draw Player Position (Blue dot)
      if (engine.vehicle) {
        const playerPos = engine.vehicle.pos;
        const playerDotColor = '#0084ff'; // Vibrant Blue
        ctx.fillStyle = playerDotColor;
        ctx.shadowColor = '#0084ff';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(mapX(playerPos.x), mapZ(playerPos.z), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw a darker outliner than the dot color
        ctx.strokeStyle = darkenColor(playerDotColor, 0.5);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    if (activeMode !== 'garage' && gameStatus !== 'idle') {
      animFrameId = requestAnimationFrame(drawMinimap);
    }

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [activeMode, gameStatus, activeTrackId, minimapCanvasRef, engineRef]);

  if (activeMode === 'garage') return null;

  return (
    <>
      {/* Top Center: Rear View Mirror & Timers */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto z-20 flex flex-col items-center gap-3">
        {/* Interior Rear View Mirror */}
        {(cameraViewMode === 'driver' || showMirrorInTPS) && hudConfig.showMirror && (
          <div
            id="rear-view-mirror-hud"
            className="w-[280px] h-[75px] bg-slate-950/40 border-[5px] border-slate-950 rounded-2xl relative overflow-hidden select-none"
          >
            {/* Glass sheen reflection overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/15 pointer-events-none rounded-xl" />
            {/* Subtle grid lines for high tech mirror HUD feel */}
            <div className="absolute inset-0 border border-cyan-500/10 pointer-events-none rounded-xl" />
          </div>
        )}

        {/* Time Limit Timer (for License mode) */}
        {activeMode === 'license' && hudConfig.showLapTimer && (
          <div className={`bg-slate-950/80 border backdrop-blur-md px-6 py-2.5 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] flex flex-col items-center min-w-[120px] transition-colors ${timeRemaining <= 7 ? 'border-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.35)] animate-pulse' : 'border-slate-800'}`}>
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              Time Limit
            </span>
            <span className={`text-3xl font-black font-mono tracking-wider ${timeRemaining <= 7 ? 'text-rose-500' : 'text-white'}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
        )}

        {/* Current Lap Timer (for Race mode) */}
        {activeMode === 'race' && (gameStatus === 'playing' || gameStatus === 'success') && hudConfig.showLapTimer && (
          <div className="bg-slate-950/80 border border-slate-800 backdrop-blur-md px-6 py-2.5 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] flex flex-col items-center min-w-[120px]">
            <span className="text-slate-400 text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-0.5">
              LAP TIMER
            </span>
            <span className="text-3xl font-black font-mono tracking-wider text-white">
              {formatTime(currentLapTime)}
            </span>
          </div>
        )}
      </div>

      {/* TOP HEADER: Credits & HUD values */}
      <div className="absolute top-6 inset-x-6 flex items-start justify-between pointer-events-none z-10">
        {/* Left Side: Lap/Length and Minimap */}
        <div className="flex flex-col gap-3 pointer-events-auto">
          {(activeMode === 'license' || activeMode === 'race') && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center gap-4">
                {/* Checkpoint counters */}
                {hudConfig.showLap && (
                  <div className="flex items-baseline gap-1 select-none">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2 leading-none">
                      {activeMode === 'race' ? 'LAP' : 'GATE'}
                    </span>
                    <span className="text-4xl font-black text-white font-mono leading-none tracking-tight">
                      {checkpointIndex}
                    </span>
                    <span className="text-slate-500 text-sm font-bold font-mono leading-none">
                      /{totalCheckpoints}
                    </span>
                  </div>
                )}

                {/* Track length */}
                {hudConfig.showLength && (() => {
                  const activeTrack = TRACKS_DATABASE.find(t => t.id === activeTrackId);
                  const trackLength = activeTrack ? getTrackLength(activeTrack.path.map(p => 'isVector3' in p ? p : p.pos)) : 0;
                  if (trackLength <= 0) return null;
                  return (
                    <div className="bg-slate-950/60 border border-slate-800/60 px-3 py-1 rounded-xl shadow-[0_0_10px_rgba(0,0,0,0.35)] flex items-center gap-2">
                      <span className="text-slate-500 text-[8px] font-extrabold uppercase tracking-wider leading-none">Length</span>
                      <span className="text-xs font-mono font-bold text-cyan-400 leading-none">
                        {formatDistance(trackLength)}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Minimap Canvas */}
              {hudConfig.showMap && (
                <div className="w-40 h-40 bg-slate-950/40 backdrop-blur-md rounded-2xl overflow-hidden border border-slate-800/80 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                  <canvas
                    ref={minimapCanvasRef}
                    width={160}
                    height={160}
                    className="w-full h-full"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Placement & Time Stats */}
        <div className="flex flex-col items-end gap-2.5 pointer-events-auto">
          {fuelCapacityLiters > 0 && (
            <div className={`bg-slate-950/80 backdrop-blur-md border px-3 py-2 rounded-xl flex items-center gap-2.5 shadow-[0_0_15px_rgba(0,0,0,0.5)] ${isEngineStalled || fuelLiters / fuelCapacityLiters < 0.08 ? 'border-rose-600 text-rose-400 animate-pulse' : 'border-slate-800 text-amber-300'}`}>
              <Fuel className="w-4 h-4 shrink-0" />
              <div className="flex flex-col min-w-[92px]">
                <span className="text-[8px] font-extrabold uppercase tracking-widest leading-none">
                  {isEngineStalled ? 'Fuel Empty' : 'Fuel'}
                </span>
                <span className="text-sm font-mono font-black leading-tight">
                  {fuelLiters.toFixed(1)} / {fuelCapacityLiters.toFixed(0)} L
                </span>
                <span className="text-[8px] text-slate-400 font-mono leading-none">
                  {fuelConsumptionLitersPerHour.toFixed(1)} L/h
                </span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            {activeMode === 'race' && hudConfig.showPosition && (
              <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-2.5 shadow-[0_0_15px_rgba(0,0,0,0.5)] select-none overflow-hidden relative">
                <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                    POS
                  </span>
                  <div className="flex items-baseline gap-0.5 h-5 overflow-hidden">
                    <span
                      key={placement}
                      className={`text-base font-black leading-none bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent font-mono transition-transform duration-300 ${placementShift === 'up'
                        ? 'animate-slideUp'
                        : placementShift === 'down'
                          ? 'animate-slideDown'
                          : ''
                        }`}
                    >
                      {placement === 1 ? '1st' : placement === 2 ? '2nd' : placement === 3 ? '3rd' : `${placement}th`}
                    </span>
                    <span className="text-slate-500 text-[10px] font-bold font-mono">/ {totalParticipants}</span>
                  </div>
                </div>
                {placementShift && (
                  <div className={`absolute inset-0 pointer-events-none opacity-15 blur-sm transition-colors duration-500 ${placementShift === 'up' ? 'bg-cyan-500' : 'bg-rose-500'}`} />
                )}
              </div>
            )}
          </div>

          {/* Time & Best Lap stats block */}
          {hudConfig.showStats && (
            <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-xl flex flex-col gap-2 shadow-[0_0_15px_rgba(0,0,0,0.5)] min-w-[150px] select-none">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Time</span>
                </div>
                <span className="text-sm font-bold font-mono text-white">
                  {formatTime(activeMode === 'race' ? totalRaceTime : timeRemaining)}
                </span>
              </div>
              {activeMode === 'race' && (
                <>
                  <div className="h-px bg-slate-800" />
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Best</span>
                    </div>
                    <span className="text-sm font-bold font-mono text-pink-500">
                      {bestLapTime === Infinity ? '--:--.---' : formatTime(bestLapTime)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DRIVING HUD: Speedometer, Timers, Checkpoints, Drift */}
      <div className="absolute inset-0 pointer-events-none z-0 flex flex-col justify-between p-6">
        {/* Top Center: Tutorial Step HUD */}
        {activeMode === 'tutorial' && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-pink-500/40 backdrop-blur-md px-6 py-4 rounded-2xl shadow-[0_0_25px_rgba(236,72,153,0.25)] text-center max-w-md w-full pointer-events-auto flex flex-col gap-2 z-20">
            <span className="text-[10px] font-extrabold tracking-widest text-pink-400 uppercase">Interactive Driver Training</span>
            <h3 className="font-extrabold text-sm text-slate-100">
              {tutorialStep === 0 && "Step 1/5: Hold 'W' or 'Up Arrow' to accelerate forward"}
              {tutorialStep === 1 && "Step 2/5: Great job! Now press 'A' or 'D' to steer"}
              {tutorialStep === 2 && "Step 3/5: Feel the steering! Now speed up and hold Spacebar while turning to drift"}
              {tutorialStep === 3 && "Step 4/5: Excellent drift! Drive straight over the glowing ramp ahead to jump"}
              {tutorialStep === 4 && "Step 5/5: Soft landing! Drive into the golden crystal ahead to finish your training"}
              {tutorialStep === 5 && "Congratulations! You have completed the training. Exit to showroom or try again!"}
            </h3>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-pink-500 transition-all duration-300"
                style={{ width: `${(tutorialStep / 5) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Middle: Drift Score Notification */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {driftScore > 0 && (
            <div className="bg-slate-950/60 border border-pink-500/30 backdrop-blur-sm px-6 py-3 rounded-2xl flex flex-col items-center shadow-[0_0_30px_rgba(217,70,239,0.2)] animate-pulse">
              <span className="text-pink-400 font-bold tracking-widest text-xs uppercase">
                Drifting
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-white font-mono">
                  {driftScore}
                </span>
                <span className="text-pink-400 font-extrabold text-2xl font-mono">
                  x{driftMultiplier}
                </span>
              </div>
              <span className="text-pink-500 text-xs font-bold mt-0.5">
                {(driftScore * driftMultiplier).toLocaleString()} pts
              </span>
            </div>
          )}

          {recentDriftGain > 0 && (
            <div className="bg-yellow-950/60 border border-yellow-500/30 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2 shadow-[0_0_20px_rgba(234,179,8,0.25)] animate-bounce mt-4">
              <Coins className="w-4 h-4 text-yellow-400" />
              <span className="text-yellow-400 font-bold font-mono">
                +{recentDriftGain} CR EARNED
              </span>
            </div>
          )}
        </div>

        {/* Bottom HUD: Speed, Timer, Checkpoint Progress */}
        <div className="w-full flex items-end justify-between">
          <div className="flex items-end gap-4 pointer-events-auto">
            {/* Speedometer & Transmission HUD */}
            {hudConfig.showSpeedometer && (
              <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 p-5 rounded-2xl shadow-xl flex flex-col items-center min-w-[180px]">
                <div className="flex items-center gap-4 mt-1">
                  {/* GT4 Style Throttle & Brake Input Indicators */}
                  <div className="flex gap-1.5 h-10 items-stretch select-none">
                    {/* Brake indicator */}
                    <div className="w-1.5 bg-zinc-900 border border-zinc-850 rounded-sm relative overflow-hidden" title="Brake Input">
                      <div
                        className="absolute top-0 inset-x-0 bg-rose-600 transition-all duration-75"
                        style={{ height: `${brakeInput * 100}%` }}
                      />
                    </div>
                    {/* Throttle indicator */}
                    <div className="w-1.5 bg-zinc-900 border border-zinc-850 rounded-sm relative overflow-hidden" title="Throttle Input">
                      <div
                        className="absolute bottom-0 inset-x-0 bg-emerald-500 transition-all duration-75"
                        style={{ height: `${throttleInput * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-10 w-px bg-zinc-800" />

                  <div className="flex flex-col items-center min-w-[36px]">
                    <span className="text-zinc-500 text-[9px] font-bold uppercase tracking-wider">Gear</span>
                    <span className={`text-3xl font-black font-mono mt-0.5 transition-all duration-150 ${isShifting ? 'text-zinc-700 scale-95' : 'text-zinc-100'}`}>
                      {speed === 0 ? 'N' : (speed < 0 ? 'R' : gear)}
                    </span>
                    {suggestedGearAdvice && (
                      <div
                        className={`mt-1 px-1.5 py-0.5 border rounded text-[9px] font-black font-mono leading-none tracking-wider whitespace-nowrap ${
                          suggestedGearAdvice.tooFast
                            ? 'border-rose-500 bg-rose-950/70 text-rose-300 animate-pulse'
                            : 'border-cyan-500/50 bg-cyan-950/45 text-cyan-300'
                        }`}
                      >
                        SUG {suggestedGearAdvice.suggestedGear}
                        <span className="ml-1 text-[8px] opacity-75">
                          {Math.max(10, Math.round(suggestedGearAdvice.distanceToCorner / 10) * 10)}m
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="h-10 w-px bg-zinc-800" />
                  <div className="flex flex-col items-center">
                    <span className="text-zinc-500 text-[9px] font-bold uppercase tracking-wider">Speed</span>
                    <div className="flex items-baseline gap-0.5 mt-0.5">
                      <span className="text-4xl font-black font-mono tracking-tight text-white">
                        {speed}
                      </span>
                      <span className="text-zinc-400 font-bold text-[10px]">
                        {hudConfig.speedUnit === 'mph' ? 'MPH' : 'KM/H'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Real RPM indicator bar */}
                <div className="w-full flex justify-between items-center mt-3 px-1 text-[8px] text-zinc-500 font-mono">
                  <span>1K RPM</span>
                  <span className={rpm > 5500 ? 'text-rose-500 font-bold animate-pulse' : ''}>
                    {rpm > 5500 ? 'LIMITER' : `${Math.round(rpm)}`}
                  </span>
                  <span className="text-red-500 font-bold">6.5K REDLINE</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-900 rounded-full mt-1.5 overflow-hidden border border-zinc-800">
                  <div
                    className={`h-full transition-all duration-75 ${rpm > 5500 ? 'bg-red-600 animate-pulse' : 'bg-zinc-200'}`}
                    style={{ width: `${Math.min(100, (rpm / 6500) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Telemetry (Tires & Fuel) HUD */}
            {hudConfig.showSpeedometer && (
              <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 p-4 rounded-2xl shadow-xl flex flex-col gap-2 min-w-[220px] text-zinc-100 select-none">
                {/* Title / Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-500 text-[8px] font-extrabold uppercase tracking-widest leading-none">
                    VEHICLE SYSTEMS
                  </span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider leading-none ${
                    tireCompound === 'soft' || tireCompound === 'super_soft'
                      ? 'bg-red-950/50 border border-red-800/40 text-red-400'
                      : tireCompound === 'hard' || tireCompound === 'super_hard'
                        ? 'bg-blue-950/50 border border-blue-800/40 text-blue-400'
                        : tireCompound.startsWith('sport_')
                          ? 'bg-emerald-950/50 border border-emerald-800/40 text-emerald-400'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
                  }`}>
                    {tireCompound ? tireCompound.replaceAll('_', ' ') : 'ECONOMY'}
                  </span>
                </div>

                <div className="flex items-center gap-4 py-0.5">
                  {/* Circular Fuel Gauge */}
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-zinc-500 text-[8px] font-extrabold tracking-wider leading-none">FUEL</span>
                    <div className="relative flex items-center justify-center w-14 h-14">
                      {/* SVG Radial progress bar */}
                      <svg className="w-full h-full transform -rotate-90">
                        {/* Background track circle (black outline) */}
                        <circle
                          cx="28"
                          cy="28"
                          r="22"
                          stroke="#000000"
                          strokeWidth="3.5"
                          fill="transparent"
                        />
                        {/* Foreground progress circle (yellow outline) */}
                        <circle
                          cx="28"
                          cy="28"
                          r="22"
                          stroke="#eab308"
                          strokeWidth="3.5"
                          fill="transparent"
                          strokeDasharray={2 * Math.PI * 22}
                          strokeDashoffset={2 * Math.PI * 22 * (1 - Math.min(1, fuelCapacityLiters > 0 ? (fuelLiters / fuelCapacityLiters) : 0))}
                          className="transition-all duration-350"
                        />
                      </svg>
                      {/* Center React Icon & Info */}
                      <div className="absolute flex flex-col items-center justify-center mt-[-1px]">
                        <Fuel className={`w-5 h-5 ${fuelLiters / (fuelCapacityLiters || 1) < 0.15 ? 'text-rose-500 animate-pulse' : 'text-zinc-300'}`} />
                        <span className={`text-[8px] font-mono font-black mt-0.5 leading-none ${fuelLiters / (fuelCapacityLiters || 1) < 0.15 ? 'text-rose-400 animate-pulse' : 'text-zinc-400'}`}>
                          {fuelCapacityLiters > 0 ? `${Math.round((fuelLiters / fuelCapacityLiters) * 100)}%` : '0%'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-12 bg-zinc-800 self-center" />

                  {/* Tire Status */}
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[10px] font-mono leading-none">
                      <span className="text-zinc-400 font-bold">TIRE LIFE</span>
                      <span className={`font-black ${tireWear > 0.7 ? 'text-rose-400 animate-pulse' : tireWear > 0.4 ? 'text-amber-400' : 'text-white'}`}>
                        {Math.max(0, Math.round((1 - tireWear) * 100))}%
                      </span>
                    </div>
                    {/* Tire Wear bar */}
                    <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-850">
                      <div
                        className={`h-full transition-all duration-100 ${
                          tireWear > 0.7 ? 'bg-rose-600 animate-pulse' : tireWear > 0.4 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, (1 - tireWear) * 100))}%` }}
                      />
                    </div>
                    {/* Tire Temperature */}
                    <div className="flex justify-between items-center text-[9px] font-mono mt-0.5">
                      <span className="text-zinc-550 text-zinc-500">TEMP</span>
                      <span className={getTempColorClass(tireTemperature, tireCompound)}>
                        {Math.round(tireTemperature)}°C
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
