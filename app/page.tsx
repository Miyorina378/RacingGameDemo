'use client';

import dynamic from 'next/dynamic';

// Import the Game component dynamically with SSR disabled
// as Three.js/WebGL require client-side APIs (window, document)
const Game = dynamic(() => import('../components/Game'), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-zinc-950 font-sans text-white">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-extrabold tracking-[0.4em] text-rose-500 uppercase italic">
            VELOCITY
          </span>
          <span className="text-sm font-black tracking-[0.2em] uppercase text-zinc-300">
            MOTORSPORT
          </span>
        </div>
        {/* Sleek, flat loader line */}
        <div className="w-40 h-0.5 bg-zinc-900 rounded-full overflow-hidden">
          <div className="h-full bg-rose-600 rounded-full w-full animate-pulse" />
        </div>
        <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase animate-pulse">
          INITIALIZING WEBGL CORE...
        </span>
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="w-screen h-screen overflow-hidden bg-slate-950">
      <Game />
    </main>
  );
}
