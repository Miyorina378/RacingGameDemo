'use client';

import React from 'react';

interface HelpModalProps {
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
}

export default function HelpModal({ showHelp, setShowHelp }: HelpModalProps) {
  if (!showHelp) return null;

  return (
    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-40 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-lg w-full shadow-[0_0_40px_rgba(0,255,255,0.15)] flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black italic tracking-wider text-cyan-400">
            DRIVING MANUAL & DETAILS
          </h2>
          <button
            onClick={() => setShowHelp(false)}
            className="text-slate-500 hover:text-slate-300 font-bold p-1 cursor-pointer"
          >
            CLOSE
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-300">
          <div>
            <h4 className="font-bold text-slate-100 flex items-center gap-2 mb-1.5 text-left">
              <span className="w-1.5 h-3 bg-pink-500 rounded" />
              Vehicle Controls
            </h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-400 text-left">
              <li>Use <span className="text-white font-semibold">W / A / S / D</span> or the <span className="text-white font-semibold">Arrow Keys</span> to steer, accelerate, and brake.</li>
              <li>Hold <span className="text-white font-semibold">Spacebar</span> while turning to engage high-speed drifting.</li>
              <li>Press <span className="text-white font-semibold">R</span> to reset the car position if you get stuck or go out-of-bounds.</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-100 flex items-center gap-2 mb-1.5 text-left">
              <span className="w-1.5 h-3 bg-pink-500 rounded" />
              Earning Credits (CR)
            </h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-400 text-left">
              <li><span className="text-white font-semibold">Drifting</span>: Accumulate slide points. Completing a drift successfully awards credits.</li>
              <li><span className="text-white font-semibold">Crystals</span>: Search the Open World to find yellow crystals (+50 Credits each).</li>
              <li><span className="text-white font-semibold">Racing</span>: Complete circuit laps before the countdown limit. Medals award massive Credit payouts!</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-100 flex items-center gap-2 mb-1.5 text-left">
              <span className="w-1.5 h-3 bg-pink-500 rounded" />
              A-License Unlock
            </h4>
            <p className="text-slate-400 leading-relaxed text-left">
              Start the <span className="text-yellow-400 font-semibold">License Test</span>, which is a timed gate navigation. Complete all checkpoints before time runs out to unlock the license, giving access to the high-difficulty <span className="text-pink-500 font-semibold">Pro Race</span> and the <span className="text-fuchsia-400 font-semibold">Apex Hypercar</span>!
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowHelp(false)}
          className="w-full bg-cyan-600 hover:bg-cyan-500 border border-cyan-500 py-3 rounded-xl text-xs font-bold transition-all text-white mt-2 shadow-[0_0_15px_rgba(6,182,212,0.2)] cursor-pointer"
        >
          Back to Game
        </button>
      </div>
    </div>
  );
}
