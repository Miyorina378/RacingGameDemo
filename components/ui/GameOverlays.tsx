'use client';

import React from 'react';
import { Coins, Check, RotateCcw, Download } from 'lucide-react';

interface RaceResult {
  pos: number;
  car: string;
  time: number;
  status?: 'finished' | 'in_progress' | 'lapped';
  lapsBehind?: number;
  isPlayer?: boolean;
}

interface GameOverlaysProps {
  gameStatus: 'idle' | 'countdown' | 'playing' | 'success' | 'failed';
  statusMessage: string;
  activeMode: string;
  racePresentation: 'racing' | 'results' | 'fade_to_replay' | 'replay' | 'exiting';
  raceResults: RaceResult[] | null;
  placement: number;
  activeTrackId: string;
  activeLicenseTestId: string;
  exitToGarage: () => void;
  saveReplay: () => void;
  replaySaveMessage: string;
  startLicenseTest: (testId?: string) => void;
  startRace: (trackId?: string) => void;
  startTutorial: () => void;
}

const formatResultTime = (timeInSecs: number) => {
  const m = Math.floor(timeInSecs / 60);
  const s = Math.floor(timeInSecs % 60);
  const ms = Math.floor((timeInSecs % 1) * 1000);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

export default function GameOverlays({
  gameStatus,
  statusMessage,
  activeMode,
  racePresentation,
  raceResults,
  placement,
  activeTrackId,
  activeLicenseTestId,
  exitToGarage,
  saveReplay,
  replaySaveMessage,
  startLicenseTest,
  startRace,
  startTutorial,
}: GameOverlaysProps) {
  const isRaceResults = gameStatus === 'success' && activeMode === 'race' && racePresentation === 'results';

  if (gameStatus === 'idle' || gameStatus === 'playing') return null;
  if (gameStatus === 'success' && activeMode === 'race' && !isRaceResults) return null;

  return (
    <div className={`absolute inset-0 z-30 flex items-center justify-center p-6 ${isRaceResults
      ? 'bg-zinc-950/35 backdrop-blur-[1px]'
      : 'bg-zinc-950/80 backdrop-blur-sm'
      }`}>
      {/* Countdown Timer */}
      {gameStatus === 'countdown' && (
        <div className="text-center animate-scaleIn select-none">
          <span className="text-7xl md:text-9xl font-black tracking-widest italic text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
            {statusMessage}
          </span>
        </div>
      )}

      {/* Success Screen */}
      {gameStatus === 'success' && (
        activeMode === 'race' && raceResults ? (
          <div className="flex flex-col items-center max-w-2xl w-full">
            {/* Staggered F I N I S H letters */}
            <div className="flex justify-center gap-2.5 md:gap-4 mb-8">
              {['F', 'I', 'N', 'I', 'S', 'H'].map((char, index) => (
                <span
                  key={index}
                  className="text-5xl md:text-7xl font-black tracking-widest italic text-white animate-slideUp inline-block drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]"
                  style={{
                    animationDelay: `${index * 0.25}s`,
                    animationFillMode: 'both',
                    display: 'inline-block'
                  }}
                >
                  {char}
                </span>
              ))}
            </div>

            {/* Sliding results table container */}
            <div
              className="animate-slideUp w-full p-4"
              style={{
                animationDelay: '1.75s',
                animationFillMode: 'both'
              }}
            >
              <h3 className="text-xl font-black text-white uppercase tracking-widest mb-6 text-center">
                Race Standings
              </h3>

              <div className="overflow-hidden rounded-2xl border border-zinc-880 bg-zinc-950/50 shadow-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-850 text-xs uppercase tracking-wider text-zinc-500 font-bold bg-zinc-950/90">
                      <th className="py-4 px-5">pos.</th>
                      <th className="py-4 px-5">car.</th>
                      <th className="py-4 px-5 text-right">time.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {raceResults.map((result, idx) => (
                      <tr
                        key={idx}
                        className={`border-b border-zinc-900/60 text-sm font-semibold transition-colors ${result.isPlayer
                          ? 'bg-rose-950/10 text-rose-500 border-l-2 border-l-rose-500 font-bold font-mono'
                          : 'text-zinc-350 font-mono'
                        }`}
                      >
                        <td className="py-4 px-5">
                          {result.pos === 1 ? '1st' : result.pos === 2 ? '2nd' : result.pos === 3 ? '3rd' : `${result.pos}th`}
                        </td>
                        <td className="py-4 px-5">
                          {result.isPlayer ? (
                            <span className="flex items-center gap-2">
                              {result.car}
                              <span className="text-[9px] bg-rose-950/60 text-rose-500 border border-rose-900/40 px-1.5 py-0.5 rounded-md font-extrabold uppercase tracking-wider">YOU</span>
                            </span>
                          ) : (
                            <span>{result.car}</span>
                          )}
                        </td>
                        <td className="py-4 px-5 text-right font-mono">
                          {result.isPlayer || result.status === 'finished' || !result.status ? (
                            formatResultTime(result.time)
                          ) : result.status === 'lapped' ? (
                            `+${result.lapsBehind ?? 1} LAP${(result.lapsBehind ?? 1) === 1 ? '' : 'S'}`
                          ) : (
                            'IN PROGRESS'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Credit Reward Info */}
              <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-2xl px-5 py-4 mt-6">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-500" /> Credits Reward
                </span>
                <span className="text-base font-black font-mono text-amber-500">
                  +{placement === 1 ? '1,000' : placement === 2 ? '600' : placement === 3 ? '300' : placement === 4 ? '150' : placement === 5 ? '100' : '50'} CR
                </span>
              </div>

              {/* Replay and garage actions */}
              <div className="mt-8 flex flex-col items-center gap-3">
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    onClick={saveReplay}
                    className="inline-flex items-center gap-1.5 border border-rose-800/70 bg-rose-950/40 px-3 py-2 text-zinc-300 hover:border-rose-500 hover:text-white font-mono text-xs tracking-wider uppercase transition-colors duration-200 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    save replay
                  </button>
                  <button
                    onClick={exitToGarage}
                    className="text-zinc-550 hover:text-rose-500 font-mono text-xs tracking-wider uppercase transition-colors duration-200 cursor-pointer bg-transparent border-0 outline-none flex items-center gap-1.5"
                  >
                    return to garage &gt;
                  </button>
                </div>
                {replaySaveMessage && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                    {replaySaveMessage}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Default success screen (License / Tutorial / Test Drive) */
          <div className="bg-zinc-950/90 border border-zinc-800 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center select-none">
            <div className="w-12 h-12 rounded-full bg-emerald-950/30 border border-emerald-900/40 mx-auto flex items-center justify-center mb-4">
              <Check className="w-6 h-6 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-black italic text-emerald-500 tracking-wider">
              CHALLENGE COMPLETED
            </h2>
            <p className="text-zinc-400 font-medium text-xs mt-3 px-2 leading-relaxed">
              {statusMessage}
            </p>

            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={() => {
                  if (activeMode === 'license') startLicenseTest(activeLicenseTestId);
                  else if (activeMode === 'race') startRace(activeTrackId);
                  else if (activeMode === 'tutorial') startTutorial();
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl transition-all cursor-pointer"
              >
                Retry Challenge
              </button>
              <button
                onClick={exitToGarage}
                className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 font-bold py-3 px-6 rounded-xl transition-all cursor-pointer"
              >
                Return to Garage
              </button>
            </div>
          </div>
        )
      )}

      {/* Failed Screen */}
      {gameStatus === 'failed' && (
        <div className="bg-zinc-950/90 border border-zinc-800 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center select-none">
          <div className="w-12 h-12 rounded-full bg-rose-950/30 border border-rose-900/40 mx-auto flex items-center justify-center mb-4">
            <RotateCcw className="w-6 h-6 text-rose-500" />
          </div>
          <h2 className="text-2xl font-black italic text-rose-500 tracking-wider">
            CHALLENGE FAILED
          </h2>
          <p className="text-zinc-400 font-medium text-xs mt-3 px-2 leading-relaxed">
            {statusMessage}
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={() => {
                if (activeMode === 'license') startLicenseTest(activeLicenseTestId);
                else if (activeMode === 'race') startRace(activeTrackId);
                else if (activeMode === 'tutorial') startTutorial();
              }}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-6 rounded-xl transition-all cursor-pointer border border-rose-500"
            >
              Retry Challenge
            </button>
            <button
              onClick={exitToGarage}
              className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 font-bold py-3 px-6 rounded-xl transition-all cursor-pointer"
            >
              Return to Garage
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
