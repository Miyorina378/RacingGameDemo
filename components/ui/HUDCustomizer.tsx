'use client';

import React from 'react';
import { Map, Timer, RotateCcw } from 'lucide-react';
import { HUDConfig } from '../option';

interface HUDCustomizerProps {
  showHUDCustomizer: boolean;
  setShowHUDCustomizer: (show: boolean) => void;
  hudConfig: HUDConfig;
  setHudConfig: React.Dispatch<React.SetStateAction<HUDConfig>>;
  defaultHudConfig: HUDConfig;
  setShowMirrorInTPS: (show: boolean) => void;
}

export default function HUDCustomizer({
  showHUDCustomizer,
  setShowHUDCustomizer,
  hudConfig,
  setHudConfig,
  defaultHudConfig,
  setShowMirrorInTPS,
}: HUDCustomizerProps) {
  if (!showHUDCustomizer) return null;

  return (
    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xl z-[60] flex items-center justify-center p-4 md:p-8 animate-fadeIn text-left">
      <div className="bg-slate-900/95 border border-slate-800/85 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-[0_0_50px_rgba(6,182,212,0.2)] flex flex-col p-6 md:p-8 animate-scaleIn">
        
        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-extrabold tracking-widest text-cyan-400 uppercase">
              Interface Designer
            </span>
            <h2 className="text-2xl font-black italic bg-gradient-to-r from-cyan-400 via-indigo-400 to-pink-500 bg-clip-text text-transparent uppercase tracking-wider mt-1">
              HUD Layout Customizer
            </h2>
            <p className="text-slate-400 text-xs mt-1">
              Click on the HUD element blocks in the screen mockup or use the checklist to customize your racetrack overlay interface.
            </p>
          </div>
          <button
            onClick={() => setShowHUDCustomizer(false)}
            className="bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Save & Close
          </button>
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-6">
          {/* Left Column: Visual Mockup (3 cols) */}
          <div className="lg:col-span-3 flex flex-col justify-center items-center">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">
              Visual Layout Mockup (16:9 Screen)
            </span>

            {/* Visual Mockup Container */}
            <div className="w-full aspect-video bg-[#05070c] border-2 border-slate-805 rounded-2xl relative overflow-hidden flex flex-col justify-between p-4 shadow-inner">
              {/* Subtle Scanlines/grid background for tech vibe */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.2)_1px,transparent_1px)] bg-[size:10px_10px] pointer-events-none" />

              {/* Backdrop car preview */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                <div className="w-4/5 h-2/3 border border-slate-800/40 rounded-full blur-xl bg-cyan-500/20" />
                <div className="absolute bottom-6 w-32 h-16 border-t-2 border-slate-800/40 rounded-t-3xl" />
              </div>

              {/* Top-Center Group: Mirror & Timers */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10 w-[180px]">
                {/* Mirror Block */}
                <button
                  onClick={() => setHudConfig(prev => ({ ...prev, showMirror: !prev.showMirror }))}
                  className={`w-full h-8 rounded-lg flex items-center justify-center text-[8px] font-extrabold tracking-wider transition-all border cursor-pointer ${
                    hudConfig.showMirror
                      ? 'bg-cyan-950/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                      : 'bg-slate-950/40 border-slate-850 border-dashed text-slate-600 hover:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" style={{ display: hudConfig.showMirror ? 'block' : 'none' }} />
                    REAR MIRROR
                  </div>
                </button>

                {/* Timer Block */}
                <button
                  onClick={() => setHudConfig(prev => ({ ...prev, showLapTimer: !prev.showLapTimer }))}
                  className={`w-20 h-6 rounded-md flex items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${
                    hudConfig.showLapTimer
                      ? 'bg-cyan-950/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                      : 'bg-slate-950/40 border-slate-850 border-dashed text-slate-600 hover:text-slate-400'
                  }`}
                >
                  LAP TIMER
                </button>
              </div>

              {/* Top-Left Group: Lap, Length, Map */}
              <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5 z-10 w-[95px]">
                <div className="flex gap-1 w-full">
                  <button
                    onClick={() => setHudConfig(prev => ({ ...prev, showLap: !prev.showLap }))}
                    className={`flex-1 h-6 rounded-md flex items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${
                      hudConfig.showLap
                        ? 'bg-cyan-950/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                        : 'bg-slate-950/40 border-slate-850 border-dashed text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    LAP
                  </button>
                  <button
                    onClick={() => setHudConfig(prev => ({ ...prev, showLength: !prev.showLength }))}
                    className={`flex-1 h-6 rounded-md flex items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${
                      hudConfig.showLength
                        ? 'bg-cyan-950/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                        : 'bg-slate-950/40 border-slate-850 border-dashed text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    LEN
                  </button>
                </div>

                {/* Minimap */}
                <button
                  onClick={() => setHudConfig(prev => ({ ...prev, showMap: !prev.showMap }))}
                  className={`w-full aspect-square max-h-[64px] rounded-lg flex flex-col items-center justify-center text-[8px] font-extrabold tracking-wider transition-all border cursor-pointer ${
                    hudConfig.showMap
                      ? 'bg-cyan-950/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                      : 'bg-slate-950/40 border-slate-850 border-dashed text-slate-600 hover:text-slate-400'
                  }`}
                >
                  <Map className="w-3.5 h-3.5 mb-1 text-cyan-400 animate-pulse" style={{ display: hudConfig.showMap ? 'block' : 'none' }} />
                  MINIMAP
                </button>
              </div>

              {/* Top-Right Group: Position, Race Stats */}
              <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-10 w-[95px]">
                {/* Position */}
                <button
                  onClick={() => setHudConfig(prev => ({ ...prev, showPosition: !prev.showPosition }))}
                  className={`w-full h-6 rounded-md flex items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${
                    hudConfig.showPosition
                      ? 'bg-cyan-950/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                      : 'bg-slate-950/40 border-slate-850 border-dashed text-slate-600 hover:text-slate-400'
                  }`}
                >
                  POSITION
                </button>

                {/* Race Stats (Best/Total Time) */}
                <button
                  onClick={() => setHudConfig(prev => ({ ...prev, showStats: !prev.showStats }))}
                  className={`w-full h-11 rounded-lg flex flex-col items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${
                    hudConfig.showStats
                      ? 'bg-cyan-950/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                      : 'bg-slate-950/40 border-slate-850 border-dashed text-slate-600 hover:text-slate-400'
                  }`}
                >
                  <Timer className="w-3 h-3 mb-0.5 text-cyan-400" style={{ display: hudConfig.showStats ? 'block' : 'none' }} />
                  RACE STATS
                </button>
              </div>

              {/* Bottom-Left Group: Speedometer & Transmission */}
              <div className="absolute bottom-3 left-3 z-10 w-[110px]">
                <button
                  onClick={() => setHudConfig(prev => ({ ...prev, showSpeedometer: !prev.showSpeedometer }))}
                  className={`w-full h-12 rounded-lg flex flex-col items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${
                    hudConfig.showSpeedometer
                      ? 'bg-cyan-950/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                      : 'bg-slate-950/40 border-slate-850 border-dashed text-slate-600 hover:text-slate-400'
                  }`}
                >
                  <span className="font-mono text-[9px] mb-0.5 text-cyan-400" style={{ display: hudConfig.showSpeedometer ? 'block' : 'none' }}>240 KM/H</span>
                  DASH & TELEMETRY
                </button>
              </div>

              {/* Interactive Status Indicator Overlay */}
              <div className="absolute bottom-3 right-3 text-[8px] font-mono text-slate-500 bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
                CLICK TO TOGGLE BLOCKS
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between w-full">
              <div className="text-[10px] font-mono text-slate-400">
                Active Elements: {Object.values(hudConfig).filter(Boolean).length} / 8
              </div>
              <button
                onClick={() => {
                  setHudConfig(defaultHudConfig);
                  setShowMirrorInTPS(false);
                }}
                className="flex items-center gap-1 text-[10px] text-pink-500 hover:text-pink-400 font-bold bg-transparent border-0 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to Default Layout
              </button>
            </div>
          </div>

          {/* Right Column: Toggle Checklist */}
          <div className="lg:col-span-2 flex flex-col gap-3 max-h-[45vh] lg:max-h-[50vh] overflow-y-auto pr-1">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block text-left">
              HUD Elements Checklist
            </span>

            {[
              { key: 'showLap', label: 'Lap / Gate Counter', desc: 'Shows current gate or lap progress' },
              { key: 'showLength', label: 'Track Length', desc: 'Displays total track circuit length' },
              { key: 'showMap', label: 'Minimap Canvas', desc: 'Renders racetrack shape and player position' },
              { key: 'showMirror', label: 'Rear View Mirror', desc: 'Centered secondary camera viewport' },
              { key: 'showLapTimer', label: 'Lap Timer', desc: 'Live time limit or current lap timer' },
              { key: 'showPosition', label: 'Race Position', desc: 'Placement rankings tracker vs AI' },
              { key: 'showStats', label: 'Time Stats Panel', desc: 'Top-right best lap and total race timers' },
              { key: 'showSpeedometer', label: 'Gear, Speed & Telemetry', desc: 'Speed, RPM, inputs, tire wear, and fuel levels' },
            ].map((item) => {
              const k = item.key as keyof HUDConfig;
              return (
                <div key={item.key} className="bg-slate-950/40 border border-slate-850 rounded-xl p-3 flex items-center justify-between gap-3 text-left">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200">{item.label}</span>
                    <span className="text-[9px] text-slate-500">{item.desc}</span>
                  </div>
                  <button
                    onClick={() => setHudConfig(prev => ({ ...prev, [k]: !prev[k] }))}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all border cursor-pointer ${
                      hudConfig[k]
                        ? 'bg-cyan-950/50 border-cyan-800/80 text-cyan-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-350'
                    }`}
                  >
                    {hudConfig[k] ? 'ON' : 'OFF'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
