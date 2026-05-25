'use client';

import dynamic from 'next/dynamic';

// Import the Game component dynamically with SSR disabled
// as Three.js/WebGL require client-side APIs (window, document)
const Game = dynamic(() => import('../components/Game'), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-950 font-sans text-white">
      <div className="flex flex-col items-center gap-4">
        {/* Neon spinner */}
        <div className="w-12 h-12 border-4 border-cyan-400 border-t-pink-500 rounded-full animate-spin shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
        <span className="text-sm font-bold tracking-widest uppercase bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
          Booting Cyber Core...
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
