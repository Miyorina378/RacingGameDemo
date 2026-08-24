'use client';

import React, { useState, useEffect } from 'react';
import { RotateCcw, HelpCircle, LogOut, Wrench, Map, Timer } from 'lucide-react';
import { HUDConfig, KeyBindings, DEFAULT_KEY_BINDINGS } from '../option';
import { GraphicsFeatures, QUALITY_PRESETS } from '../PostProcessing';

type AntiAliasingMode = 'off' | 'fxaa' | 'taa';

interface SettingProps {
  activeGarageTab: string | null;
  settingsSubTab: 'audio' | 'graphics' | 'control' | 'layout';
  setSettingsSubTab: (tab: 'audio' | 'graphics' | 'control' | 'layout') => void;
  settingsVisible: boolean;
  settingsTransitionComplete: boolean;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  showMirrorInTPS: boolean;
  setShowMirrorInTPS: (show: boolean) => void;
  graphicsQuality: 'low' | 'medium' | 'high';
  changeGraphicsQuality: (quality: 'low' | 'medium' | 'high') => void;
  graphicsFeatures: GraphicsFeatures;
  changeGraphicsFeature: (feature: keyof GraphicsFeatures, value: boolean) => void;
  changeAntiAliasingMode: (mode: AntiAliasingMode) => void;
  bloomIntensity: number;
  changeBloomIntensity: (intensity: number) => void;
  placeholderRef: React.RefObject<HTMLDivElement | null>;
  placeholderRect: DOMRect | null;
  hudConfig: HUDConfig;
  setHudConfig: React.Dispatch<React.SetStateAction<HUDConfig>>;
  defaultHudConfig: HUDConfig;
  handleSettingBackClick: () => void;
  keyBindings: KeyBindings;
  onKeyBindingsChange: (bindings: KeyBindings) => void;
  brightness: number;
  changeBrightness: (val: number) => void;
  masterVolume: number;
  changeMasterVolume: (val: number) => void;
  musicVolume: number;
  changeMusicVolume: (val: number) => void;
  sfxVolume: number;
  changeSfxVolume: (val: number) => void;
  backLabel?: string;
}

export default function Setting({
  activeGarageTab,
  settingsSubTab,
  setSettingsSubTab,
  settingsVisible,
  settingsTransitionComplete,
  soundEnabled,
  setSoundEnabled,
  showMirrorInTPS,
  setShowMirrorInTPS,
  graphicsQuality,
  changeGraphicsQuality,
  graphicsFeatures,
  changeGraphicsFeature,
  changeAntiAliasingMode,
  bloomIntensity,
  changeBloomIntensity,
  placeholderRef,
  placeholderRect,
  hudConfig,
  setHudConfig,
  defaultHudConfig,
  handleSettingBackClick,
  keyBindings,
  onKeyBindingsChange,
  brightness,
  changeBrightness,
  masterVolume,
  changeMasterVolume,
  musicVolume,
  changeMusicVolume,
  sfxVolume,
  changeSfxVolume,
  backLabel = 'Back to Garage',
}: SettingProps) {
  const [rebindingAction, setRebindingAction] = useState<keyof KeyBindings | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (settingsVisible) {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [settingsVisible, settingsSubTab]);

  useEffect(() => {
    if (!rebindingAction) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRebindingAction(null);
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const keyVal = e.key;

      const updated = {
        ...keyBindings,
        [rebindingAction]: keyVal,
      };

      onKeyBindingsChange(updated);
      setRebindingAction(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [rebindingAction, keyBindings, onKeyBindingsChange]);

  const formatKeyName = (key: string) => {
    if (!key) return '';
    if (key === ' ') return 'SPACE';
    if (key.length === 1) return key.toUpperCase();
    return key.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
  };

  if (activeGarageTab !== 'setting') return null;

  return (
    <>
      {/* DEDICATED SETTINGS BACKDROP */}
      <div
        className={`absolute inset-0 z-10 pointer-events-none transition-all duration-400 bg-black ${settingsVisible ? 'opacity-100' : 'opacity-0'
          }`}
      >
        {/* Metallic background and polka dots */}
        <div
          className={`absolute inset-0 transition-opacity duration-700 ${settingsTransitionComplete ? 'opacity-100' : 'opacity-0'
            }`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900" />

          <svg className="absolute inset-0 w-full h-full opacity-25" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="metallic-polka" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="#3f3f46" />
                <circle cx="10" cy="10" r="1" fill="#3f3f46" />
                <line x1="0" y1="8" x2="16" y2="8" stroke="#27272a" strokeWidth="0.5" />
                <line x1="8" y1="0" x2="8" y2="16" stroke="#27272a" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#metallic-polka)" />
          </svg>

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.18)_0%,transparent_50%)] mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-t from-rose-500/5 via-transparent to-transparent pointer-events-none" />
        </div>
      </div>

      {/* DEDICATED SETTINGS CONTENT */}
      <div
        className={`absolute inset-0 z-30 flex flex-col items-center justify-start p-4 md:p-8 pointer-events-auto transition-opacity duration-300 ${settingsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
      >
        <div className="w-full max-w-2xl lg:max-w-5xl h-full flex flex-col relative z-35">
          {/* FIXED HEADER: Title + Back Button */}
          <div className="flex justify-between items-start pb-4 border-b border-zinc-900 shrink-0">
            <div className="text-left">
              <h2 className="text-3xl font-black italic bg-gradient-to-r from-zinc-100 via-zinc-350 to-zinc-400 bg-clip-text text-transparent uppercase tracking-wider mt-1">
                settings
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSettingBackClick}
                className="bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-zinc-300 hover:text-white px-5 py-2.5 rounded-xl text-xs font-black tracking-widest uppercase transition-all cursor-pointer shadow-md"
              >
                {backLabel}
              </button>
            </div>
          </div>

          {/* FIXED TABS: Sub-Tabs Selector */}
          <div className="flex justify-start border-b border-rose-600/60 py-3 w-full shrink-0">
            <div className="flex bg-zinc-950/80 border border-zinc-900 shadow-md transform -skew-x-12 overflow-hidden">
              {(['audio', 'graphics', 'control', 'layout'] as const).map((tab) => {
                const isActive = settingsSubTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setSettingsSubTab(tab)}
                    className={`px-6 py-2.5 text-xs font-black tracking-widest uppercase transition-all duration-300 border-r border-zinc-800 last:border-r-0 cursor-pointer ${isActive
                      ? 'bg-rose-600 border-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                      : 'bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                      }`}
                  >
                    <span className="block transform skew-x-12">
                      {tab}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SCROLLABLE TAB CONTENT BODY */}
          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto pt-6 pb-8 pr-2 custom-scrollbar"
          >
            {/* Tab content - Audio */}
            {settingsSubTab === 'audio' && (
              <div className="flex flex-col gap-6 text-left">
                <div className="pb-2 border-b border-zinc-900">
                  <h3 className="text-xs font-black text-rose-500 tracking-widest uppercase">
                    Audio Volume & Levels
                  </h3>
                </div>

              <div className="flex flex-col select-none">
                {/* Master Volume */}
                <div className="flex items-center justify-between gap-4 py-3.5 border-b border-zinc-900/60">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-200">Master Volume</span>
                    <span className="text-xs text-zinc-500 mt-0.5">Adjust overall simulator sound level (0-100%)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={masterVolume}
                      onChange={(e) => changeMasterVolume(parseInt(e.target.value, 10))}
                      className="w-32 md:w-48 h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-600 [&::-webkit-slider-thumb]:hover:bg-rose-500 [&::-webkit-slider-thumb]:transition-all [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-rose-600 [&::-moz-range-thumb]:border-0"
                    />
                    <span className="text-xs font-mono font-bold text-rose-500 w-12 text-right">
                      {masterVolume}%
                    </span>
                  </div>
                </div>

                {/* Music Volume */}
                <div className="flex items-center justify-between gap-4 py-3.5 border-b border-zinc-900/60">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-200">Music Volume</span>
                    <span className="text-xs text-zinc-500 mt-0.5">Adjust background music level (0-100%)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={musicVolume}
                      onChange={(e) => changeMusicVolume(parseInt(e.target.value, 10))}
                      className="w-32 md:w-48 h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-600 [&::-webkit-slider-thumb]:hover:bg-rose-500 [&::-webkit-slider-thumb]:transition-all [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-rose-600 [&::-moz-range-thumb]:border-0"
                    />
                    <span className="text-xs font-mono font-bold text-rose-500 w-12 text-right">
                      {musicVolume}%
                    </span>
                  </div>
                </div>

                {/* SFX Volume */}
                <div className="flex items-center justify-between gap-4 py-3.5 border-b border-zinc-900/60">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-200">SFX Volume</span>
                    <span className="text-xs text-zinc-500 mt-0.5">Adjust engine and interface sound effects (0-100%)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sfxVolume}
                      onChange={(e) => changeSfxVolume(parseInt(e.target.value, 10))}
                      className="w-32 md:w-48 h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-600 [&::-webkit-slider-thumb]:hover:bg-rose-500 [&::-webkit-slider-thumb]:transition-all [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-rose-600 [&::-moz-range-thumb]:border-0"
                    />
                    <span className="text-xs font-mono font-bold text-rose-500 w-12 text-right">
                      {sfxVolume}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab content - Graphics */}
          {settingsSubTab === 'graphics' && (
            <div className="flex flex-col md:flex-row gap-8">
              <div className="flex-1 flex flex-col gap-5 text-left">
                <h3 className="text-xs font-black text-rose-500 tracking-widest uppercase">
                  Graphics & Performance Toggles
                </h3>

                <div className="flex flex-col select-none">
                  {/* Game Audio */}
                  <div className="flex items-center justify-between gap-4 py-3.5 border-b border-zinc-900/60">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-200">Game Audio</span>
                      <span className="text-xs text-zinc-500 mt-0.5">Toggle simulator audio sound effects</span>
                    </div>
                    <button
                      onClick={() => setSoundEnabled(!soundEnabled)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${soundEnabled
                        ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : 'bg-zinc-950 border border-zinc-900 text-zinc-400 hover:text-zinc-350'
                        }`}
                    >
                      {soundEnabled ? 'ENABLED' : 'MUTED'}
                    </button>
                  </div>

                  {/* TPS Rear Mirror */}
                  <div className="flex items-center justify-between gap-4 py-3.5 border-b border-zinc-900/60">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-200">TPS Rear Mirror</span>
                      <span className="text-xs text-zinc-500 mt-0.5">Show mirror overlay in third-person view</span>
                    </div>
                    <button
                      onClick={() => setShowMirrorInTPS(!showMirrorInTPS)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${showMirrorInTPS
                        ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : 'bg-zinc-950 border border-zinc-900 text-zinc-400 hover:text-zinc-355'
                        }`}
                    >
                      {showMirrorInTPS ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  {/* ═══════════════════════════════════════════════ */}
                  {/* GRAPHICS QUALITY TIER — Interactive Red Box       */}
                  {/* ═══════════════════════════════════════════════ */}
                  {(() => {
                    // Determine effective tier from current feature flags
                    const matchesPreset = (tier: 'low' | 'medium' | 'high') => {
                      const p = QUALITY_PRESETS[tier];
                      return (
                        graphicsFeatures.shadows === p.shadows &&
                        graphicsFeatures.bloom === p.bloom &&
                        graphicsFeatures.vignette === p.vignette &&
                        graphicsFeatures.motionBlur === p.motionBlur &&
                        graphicsFeatures.fxaa === p.fxaa &&
                        graphicsFeatures.taa === p.taa
                      );
                    };
                    const effectiveTier: 'low' | 'medium' | 'high' | 'custom' =
                      matchesPreset('low') ? 'low'
                        : matchesPreset('medium') ? 'medium'
                          : matchesPreset('high') ? 'high'
                            : 'custom';

                    const isCustom = effectiveTier === 'custom';

                    const tierDescriptions: Record<string, string> = {
                      low: 'Maximum performance. All post-processing disabled. No shadows rendered.',
                      medium: 'Balanced quality. Shadows and bloom glow enabled with moderate intensity.',
                      high: 'Maximum fidelity. Full bloom, vignette, chromatic aberration, and temporal anti-aliasing.',
                      custom: 'User-modified settings. One or more values differ from presets.',
                    };

                    const featureRows: { key: keyof GraphicsFeatures; label: string; desc: string }[] = [
                      { key: 'shadows', label: 'Shadows', desc: 'Dynamic shadow casting from lights' },
                      { key: 'bloom', label: 'Bloom Glow Effect', desc: 'HDR glow on bright surfaces' },
                      { key: 'vignette', label: 'Vignette & Chromatic Aberration', desc: 'Screen-edge darkening & color fringing' },
                      { key: 'motionBlur', label: 'Motion Blur', desc: 'Speed-based camera streaking at high speed' },
                    ];
                    const antiAliasingMode: AntiAliasingMode = graphicsFeatures.taa
                      ? 'taa'
                      : graphicsFeatures.fxaa
                        ? 'fxaa'
                        : 'off';

                    return (
                      <div className={`mt-1 mb-1 rounded-xl border-2 p-4 transition-all duration-300 border-rose-600/40 bg-rose-950/10'
                        }`}>
                        {/* Tier Header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-black tracking-widest uppercase text-white
                            }`}>
                            Graphics Quality
                          </span>
                        </div>

                        {/* Preset Buttons: Low / Medium / High / Custom */}
                        <div className="flex gap-2 mb-3">
                          {(['low', 'medium', 'high'] as const).map((q) => {
                            const isActive = effectiveTier === q;
                            return (
                              <button
                                key={q}
                                onClick={() => changeGraphicsQuality(q)}
                                className={`px-3 py-2 rounded-lg text-[10px] font-black transition-all border uppercase cursor-pointer tracking-wider ${isActive
                                  ? 'bg-rose-600 border-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                                  }`}
                              >
                                {q}
                              </button>
                            );
                          })}
                          {/* Custom indicator button (non-clickable, just shows state) */}
                          <div
                            className={`px-3 py-2 rounded-lg text-[10px] font-black border uppercase tracking-wider transition-all ${isCustom
                              ? 'bg-rose-600/80 border-rose-500 text-white]'
                              : 'bg-zinc-950/50 border-zinc-800/50 text-zinc-600'
                              }`}
                          >
                            Custom
                          </div>
                        </div>

                        {/* Description */}
                        <p className={`text-[10px] mb-3 leading-relaxed text-rose-300/40
                          }`}>
                          {tierDescriptions[effectiveTier]}
                        </p>

                        {/* Divider */}
                        <div className={`h-px mb-3 ${isCustom ? 'bg-amber-500/20' : 'bg-rose-600/20'
                          }`} />

                        {/* Feature Toggle Rows */}
                        <div className="flex flex-col gap-1">
                          {featureRows.map((row) => {
                            const isOn = graphicsFeatures[row.key];
                            const isBloomRow = row.key === 'bloom';
                            return (
                              <div key={row.key}>
                                <div className="flex items-center justify-between gap-3 py-1.5">
                                  <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-zinc-200">{row.label}</span>
                                    <span className="text-[9px] text-zinc-500">{row.desc}</span>
                                  </div>
                                  <button
                                    onClick={() => changeGraphicsFeature(row.key, !isOn)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border cursor-pointer min-w-[52px] text-center ${isOn
                                      ? 'bg-emerald-600/80 border-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                                      : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                      }`}
                                  >
                                    {isOn ? 'ON' : 'OFF'}
                                  </button>
                                </div>

                                {/* Bloom Intensity Slider (appears when bloom is ON) */}
                                {isBloomRow && (
                                  <div className={`flex items-center gap-3 pl-4 pb-2 pt-1 transition-opacity ${isOn ? '' : 'opacity-60'}`}>
                                    <span className="text-[9px] text-zinc-500 font-medium whitespace-nowrap">Bloom Intensity</span>
                                    <input
                                      type="range"
                                      min="0.05"
                                      max="0.50"
                                      step="0.01"
                                      value={bloomIntensity}
                                      disabled={!isOn}
                                      onChange={(e) => changeBloomIntensity(parseFloat(e.target.value))}
                                      className={`flex-1 h-1 bg-zinc-800 rounded-lg appearance-none focus:outline-none ${
                                        isOn
                                          ? 'cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-550 [&::-webkit-slider-thumb]:hover:bg-emerald-450 [&::-webkit-slider-thumb]:transition-all [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-emerald-550 [&::-moz-range-thumb]:border-0'
                                          : 'cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-700 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-zinc-700 [&::-moz-range-thumb]:border-0'
                                      }`}
                                    />
                                    <span className="text-[9px] font-mono font-bold text-zinc-500 w-8 text-right">
                                      {(bloomIntensity * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-bold text-zinc-200">Anti-Aliasing</span>
                              <span className="text-[9px] text-zinc-500">Choose one edge smoothing method</span>
                            </div>
                            <select
                              value={antiAliasingMode}
                              onChange={(e) => changeAntiAliasingMode(e.target.value as AntiAliasingMode)}
                              className="bg-zinc-950 border border-zinc-800 text-zinc-200 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase cursor-pointer focus:outline-none focus:border-rose-500"
                            >
                              <option value="off">Off</option>
                              <option value="fxaa">FXAA</option>
                              <option value="taa">TAA</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Screen Brightness */}
                  <div className="flex items-center justify-between gap-4 py-3.5 border-b border-zinc-900/60">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-200">Screen Brightness</span>
                      <span className="text-xs text-zinc-500 mt-0.5">Adjust simulator exposure brightness level (0-10)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        value={brightness}
                        onChange={(e) => changeBrightness(parseInt(e.target.value, 10))}
                        className="w-32 md:w-48 h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-600 [&::-webkit-slider-thumb]:hover:bg-rose-500 [&::-webkit-slider-thumb]:transition-all [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-rose-600 [&::-moz-range-thumb]:border-0"
                      />
                      <span className="text-xs font-mono font-bold text-rose-500 w-6 text-center">
                        {brightness}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Preview Placeholder for shrinking 3D Canvas */}
              <div className="w-full md:w-[480px] flex flex-col gap-4 text-left self-center">
                <span className="text-xs font-black tracking-widest text-rose-500 uppercase">
                  Live Preview
                </span>
                <div
                  ref={placeholderRef}
                  className="w-full h-[290px] rounded-2xl border border-zinc-800/40 relative shadow-inner overflow-hidden animate-fadeIn bg-black"
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/5 to-transparent pointer-events-none" />
                </div>
              </div>
            </div>
          )}

          {/* Tab content - Control */}
          {settingsSubTab === 'control' && (
            <div className="flex flex-col gap-6 text-left">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                <h3 className="text-xs font-black text-rose-500 tracking-widest uppercase">
                  Driving Controls & Hotkeys
                </h3>
                <button
                  onClick={() => onKeyBindingsChange(DEFAULT_KEY_BINDINGS)}
                  className="bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 hover:border-rose-900/60 text-zinc-450 hover:text-rose-450 px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Defaults
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Column 1: Adjustable Driving Controls */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-505 uppercase tracking-widest mb-1 block">
                    Custom Vehicle Controls (Click to Rebind)
                  </span>

                  {[
                    { id: 'accelerate', label: 'ACCELERATE', desc: 'Accelerate forward / Reverse after braking.' },
                    { id: 'brake', label: 'BRAKE / REVERSE', desc: 'Apply brakes / Slow down / Go backwards.' },
                    { id: 'steerLeft', label: 'STEER LEFT', desc: 'Turn vehicle to the left.' },
                    { id: 'steerRight', label: 'STEER RIGHT', desc: 'Turn vehicle to the right.' },
                    { id: 'handbrake', label: 'EMERGENCY BRAKE', desc: 'Apply firm braking without initiating a drift.' }
                  ].map((control) => {
                    const actionKey = control.id as keyof KeyBindings;
                    const currentKey = keyBindings[actionKey];
                    const isListening = rebindingAction === actionKey;

                    return (
                      <div key={control.id} className="flex items-center justify-between gap-4 py-3 border-b border-zinc-900/60">
                        <div className="flex flex-col flex-1">
                          <span className="text-xs font-bold text-zinc-200 uppercase tracking-wide">{control.label}</span>
                          <span className="text-[10px] text-zinc-500 mt-0.5">{control.desc}</span>
                        </div>

                        <button
                          onClick={() => setRebindingAction(isListening ? null : actionKey)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-black font-mono transition-all border min-w-[130px] text-center cursor-pointer ${isListening
                            ? 'bg-rose-950 border-rose-500 text-rose-400 animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                            : 'bg-zinc-950 border-zinc-850 hover:border-zinc-700 text-rose-500 hover:text-rose-400 hover:bg-zinc-900/40'
                            }`}
                        >
                          {isListening ? 'PRESS KEY...' : formatKeyName(currentKey)}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Column 2: System Hotkeys (Static) */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-zinc-505 uppercase tracking-widest mb-1 block">
                    System Hotkeys & Actions
                  </span>

                  {[
                    { keys: ['SHIFT'], action: 'HALF-PEDAL CONTROL', desc: 'Caps keyboard throttle and braking inputs to 50% for precise traction and cornering control.' },
                    { keys: ['R'], action: 'RESET VEHICLE', desc: 'Resets the car back to the nearest checkpoint or track node if you crash or get stuck.' },
                    { keys: ['V', 'Z'], action: 'CAMERA TOGGLE', desc: 'Cycle between multiple viewing modes: Chase Cam (Third-person), Hood Cam, and Bumper Cam.' },
                    { keys: ['ESC'], action: 'PAUSE GAME', desc: 'Pauses the simulation run, displaying the pause menu and settings overlay.' },
                  ].map((control, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 py-3 border-b border-zinc-900/60">
                      <div className="flex-1 text-left">
                        <span className="text-xs font-bold text-zinc-200 tracking-wide uppercase block">{control.action}</span>
                        <span className="text-[10px] text-zinc-500 leading-normal block mt-0.5">{control.desc}</span>
                      </div>

                      <div className="flex gap-1.5 mt-0.5 shrink-0">
                        {control.keys.map((k) => (
                          <kbd key={k} className="px-3 py-2 bg-zinc-950 border border-zinc-800 text-rose-600/90 font-extrabold text-xs rounded shadow min-w-[36px] text-center font-mono select-none">
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab content - Layout */}
          {settingsSubTab === 'layout' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              {/* Left Column: Visual Mockup (3 cols) */}
              <div className="lg:col-span-3 flex flex-col justify-center items-center">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2.5">
                  Visual Layout Mockup (16:9 Screen)
                </span>

                {/* Visual Mockup Container */}
                <div className="w-full aspect-video bg-[#05070c] border-2 border-zinc-850 rounded-2xl relative overflow-hidden flex flex-col justify-between p-4 shadow-inner">
                  {/* Subtle Scanlines/grid background for tech vibe */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.15)_1px,transparent_1px)] bg-[size:10px_10px] pointer-events-none" />

                  {/* Backdrop car preview */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                    <div className="w-4/5 h-2/3 border border-zinc-800/40 rounded-full blur-xl bg-rose-500/20" />
                    <div className="absolute bottom-6 w-32 h-16 border-t-2 border-zinc-800/40 rounded-t-3xl" />
                  </div>

                  {/* Top-Center Group: Mirror & Timers */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10 w-[120px]">
                    {/* Mirror Block */}
                    <button
                      onClick={() => setHudConfig(prev => ({ ...prev, showMirror: !prev.showMirror }))}
                      className={`w-full h-8 rounded-lg flex items-center justify-center text-[8px] font-extrabold tracking-wider transition-all border cursor-pointer ${hudConfig.showMirror
                        ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : 'bg-zinc-950/40 border-zinc-850 border-dashed text-zinc-650 hover:text-zinc-400'
                        }`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ display: hudConfig.showMirror ? 'block' : 'none' }} />
                        REAR MIRROR
                      </div>
                    </button>

                    {/* Timer Block */}
                    <button
                      onClick={() => setHudConfig(prev => ({ ...prev, showLapTimer: !prev.showLapTimer }))}
                      className={`w-20 h-6 rounded-md flex items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${hudConfig.showLapTimer
                        ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : 'bg-zinc-950/40 border-zinc-850 border-dashed text-zinc-655 hover:text-zinc-400'
                        }`}
                    >
                      LAP TIMER
                    </button>
                  </div>

                  {/* Top-Left Group: Lap, Length, Map */}
                  <div className="absolute top-3 left-3 flex flex-col items-start gap-1 z-10 w-[80px]">
                    {/* Lap Counter & Length Box */}
                    <div className="flex gap-1 w-full">
                      <button
                        onClick={() => setHudConfig(prev => ({ ...prev, showLap: !prev.showLap }))}
                        className={`flex-1 h-6 rounded-md flex items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${hudConfig.showLap
                          ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                          : 'bg-zinc-950/40 border-zinc-850 border-dashed text-zinc-655 hover:text-zinc-400'
                          }`}
                      >
                        LAP
                      </button>
                      <button
                        onClick={() => setHudConfig(prev => ({ ...prev, showLength: !prev.showLength }))}
                        className={`flex-1 h-6 rounded-md flex items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${hudConfig.showLength
                          ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                          : 'bg-zinc-950/40 border-zinc-855 border-dashed text-zinc-655 hover:text-zinc-400'
                          }`}
                      >
                        LEN
                      </button>
                    </div>

                    {/* Minimap */}
                    <button
                      onClick={() => setHudConfig(prev => ({ ...prev, showMap: !prev.showMap }))}
                      className={`w-full aspect-square max-h-[64px] rounded-lg flex flex-col items-center justify-center text-[8px] font-extrabold tracking-wider transition-all border cursor-pointer ${hudConfig.showMap
                        ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : 'bg-zinc-950/40 border-zinc-850 border-dashed text-zinc-650 hover:text-zinc-400'
                        }`}
                    >
                      <Map className={`w-3.5 h-3.5 mb-1 animate-pulse ${hudConfig.showMap ? 'text-white' : 'text-rose-500'}`} style={{ display: hudConfig.showMap ? 'block' : 'none' }} />
                      MINIMAP
                    </button>
                  </div>

                  {/* Top-Right Group: Position, Race Stats */}
                  <div className="absolute top-3 right-3 flex flex-col items-end gap-1 z-10 w-[80px]">
                    {/* Position */}
                    <button
                      onClick={() => setHudConfig(prev => ({ ...prev, showPosition: !prev.showPosition }))}
                      className={`w-full h-6 rounded-md flex items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${hudConfig.showPosition
                        ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : 'bg-zinc-950/40 border-zinc-850 border-dashed text-zinc-650 hover:text-cyan-400'
                        }`}
                    >
                      POSITION
                    </button>

                    {/* Race Stats (Best/Total Time) */}
                    <button
                      onClick={() => setHudConfig(prev => ({ ...prev, showStats: !prev.showStats }))}
                      className={`w-full h-11 rounded-lg flex flex-col items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${hudConfig.showStats
                        ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : 'bg-zinc-950/40 border-zinc-850 border-dashed text-zinc-650 hover:text-zinc-400'
                        }`}
                    >
                      <Timer className={`w-3 h-3 mb-0.5 ${hudConfig.showStats ? 'text-white' : 'text-rose-500'}`} style={{ display: hudConfig.showStats ? 'block' : 'none' }} />
                      RACE STATS
                    </button>
                  </div>

                  {/* Bottom-Left Group: Speedometer & Inputs */}
                  <div className="absolute bottom-3 left-3 z-10 w-[110px]">
                    <button
                      onClick={() => setHudConfig(prev => ({ ...prev, showSpeedometer: !prev.showSpeedometer }))}
                      className={`w-full h-12 rounded-lg flex flex-col items-center justify-center text-[7px] font-extrabold tracking-wider transition-all border cursor-pointer ${hudConfig.showSpeedometer
                        ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : 'bg-zinc-950/40 border-zinc-850 border-dashed text-zinc-650 hover:text-zinc-400'
                        }`}
                    >
                      <span className={`font-mono text-[9px] mb-0.5 ${hudConfig.showSpeedometer ? 'text-white' : 'text-rose-500'}`} style={{ display: hudConfig.showSpeedometer ? 'block' : 'none' }}>
                        {hudConfig.speedUnit === 'mph' ? '150 MPH' : '240 KM/H'}
                      </span>
                      DASH & TELEMETRY
                    </button>
                  </div>

                  {/* Interactive Status Indicator Overlay */}
                  <div className="absolute bottom-3 right-3 text-[8px] font-mono text-zinc-500 bg-zinc-950/80 px-2 py-1 rounded border border-zinc-850">
                    CLICK TO TOGGLE BLOCKS
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3.5 w-full border-t border-zinc-900/60 pt-3.5">
                  <div className="flex items-center justify-between w-full">
                    <div className="text-[10px] font-mono text-zinc-500">
                      Active Elements: {Object.values(hudConfig).filter(v => typeof v === 'boolean' && v).length} / 8
                    </div>
                    <button
                      onClick={() => {
                        setHudConfig(defaultHudConfig);
                      }}
                      className="flex items-center gap-1 text-[10px] text-rose-500 hover:text-rose-450 font-bold bg-transparent border-0 cursor-pointer transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Layout
                    </button>
                  </div>

                  {/* Speed Unit Toggle (as big as the toggle at graphics) */}
                  <div className="flex items-center justify-between gap-4 py-3.5 border-t border-zinc-900/60 w-full text-left">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-200">Speedometer Unit</span>
                      <span className="text-xs text-zinc-500 mt-0.5">Toggle speedometer display between KM/H and MPH</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setHudConfig(prev => ({ ...prev, speedUnit: 'kmh' }))}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border uppercase cursor-pointer ${hudConfig.speedUnit !== 'mph'
                          ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                          : 'bg-zinc-950 border border-zinc-900 text-zinc-450 hover:text-zinc-350'
                          }`}
                      >
                        KM/H
                      </button>
                      <button
                        onClick={() => setHudConfig(prev => ({ ...prev, speedUnit: 'mph' }))}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border uppercase cursor-pointer ${hudConfig.speedUnit === 'mph'
                          ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                          : 'bg-zinc-950 border border-zinc-900 text-zinc-450 hover:text-zinc-350'
                          }`}
                      >
                        MPH
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Toggle Checklist */}
              <div className="lg:col-span-2 flex flex-col gap-1.5 max-h-[35vh] lg:max-h-[38vh] overflow-y-auto pr-1">
                <span className="text-[9px] font-bold text-zinc-550 uppercase tracking-widest mb-1 text-left block">
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
                    <div key={item.key} className="flex items-center justify-between gap-3 py-2.5 border-b border-zinc-900/60 animate-fadeIn text-left">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-zinc-200">{item.label}</span>
                        <span className="text-[9px] text-zinc-555">{item.desc}</span>
                      </div>
                      <button
                        onClick={() => setHudConfig(prev => ({ ...prev, [k]: !prev[k] }))}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all border cursor-pointer ${hudConfig[k]
                          ? 'bg-rose-600 border-rose-500 text-white font-black shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                          : 'bg-zinc-950 border border-zinc-900 text-zinc-450 hover:text-zinc-355'
                          }`}
                      >
                        {hudConfig[k] ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </>
  );
}
