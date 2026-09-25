'use client';

import React, { useId } from 'react';
import { Sun } from 'lucide-react';

/**
 * Chill cyan-sky dressing for the Amateur Racing Field.
 *
 * Everything here is drawn in code: a drifting sky backdrop for the tier screen and
 * one illustrated poster per amateur event, so the tier reads as its own sunny,
 * relaxed world instead of a blurred photo behind five copies of the same card art.
 */

/** Stable, url()-safe id prefix for gradients and clip paths. */
const useSvgId = () => 'as' + useId().replace(/[^a-zA-Z0-9_-]/g, '');

/** Symmetric ease-in-out for the back-and-forth SMIL loops. */
const EASE2 = {
  calcMode: 'spline',
  keyTimes: '0;0.5;1',
  keySplines: '0.45 0 0.55 1;0.45 0 0.55 1'
} as const;

const bob = (dy: number, dur: number, begin = '0s', dx = 0) => (
  <animateTransform
    attributeName="transform"
    type="translate"
    values={`0 0;${dx} ${-dy};0 0`}
    dur={`${dur}s`}
    begin={begin}
    repeatCount="indefinite"
    {...EASE2}
  />
);

/** Flat-bottomed cartoon cumulus, roughly 118 x 50 in its own units. */
const CLOUD_D =
  'M10 50 a14 14 0 0 1 4-27 a20 20 0 0 1 34-12 a24 24 0 0 1 42 4 a16 16 0 0 1 22 20 a12 12 0 0 1-2 15 z';

const CloudPuff = ({ shade = '#d6f1f8' }: { shade?: string }) => (
  <>
    <path d={CLOUD_D} fill={shade} transform="translate(0 4)" />
    <path d={CLOUD_D} fill="#ffffff" />
  </>
);

const DriftCloud = ({
  x,
  y,
  s = 1,
  dur = 30,
  dx = 14,
  o = 1,
  shade
}: {
  x: number;
  y: number;
  s?: number;
  dur?: number;
  dx?: number;
  o?: number;
  shade?: string;
}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values={`0 0;${dx} 0;0 0`}
        dur={`${dur}s`}
        repeatCount="indefinite"
        {...EASE2}
      />
      <CloudPuff shade={shade} />
    </g>
  </g>
);

/** Hot-air balloon with curved gores, 100 x 134 in its own units. */
const BalloonGlyph = ({ id, a, b, band }: { id: string; a: string; b: string; band: string }) => {
  const envelope =
    'M50 3 C79 3 97 23 97 50 C97 74 80 89 65 103 L35 103 C20 89 3 74 3 50 C3 23 21 3 50 3 Z';
  return (
    <g>
      <defs>
        <clipPath id={`${id}-env`}>
          <path d={envelope} />
        </clipPath>
        <radialGradient id={`${id}-shade`} cx="34%" cy="28%" r="78%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#0c4a6e" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${id}-env)`}>
        <rect width="100" height="104" fill={a} />
        <ellipse cx="50" cy="52" rx="33" ry="56" fill={b} />
        <ellipse cx="50" cy="52" rx="15" ry="56" fill={a} />
        <rect y="86" width="100" height="18" fill={band} />
        <rect width="100" height="104" fill={`url(#${id}-shade)`} />
      </g>
      <path d="M35 103 L65 103 L60 110 L40 110 Z" fill={band} />
      <path d="M40 110 L43 122 M60 110 L57 122" stroke="#7c5a3a" strokeWidth="1.2" />
      <rect x="41" y="121" width="18" height="13" rx="2.5" fill="#c58a55" />
      <rect x="41" y="121" width="18" height="3" rx="1.5" fill="#9a6337" />
    </g>
  );
};

/** Wind turbine standing on (x, y), blades turning around the hub. */
const Turbine = ({
  x,
  y,
  h,
  dur,
  begin = '0s'
}: {
  x: number;
  y: number;
  h: number;
  dur: number;
  begin?: string;
}) => (
  <g transform={`translate(${x} ${y})`}>
    <path
      d={`M${-h * 0.035} 0 L${-h * 0.012} ${-h} L${h * 0.012} ${-h} L${h * 0.035} 0 Z`}
      fill="#ffffff"
    />
    <g transform={`translate(0 ${-h})`}>
      <g>
        {[0, 120, 240].map((angle) => (
          <path
            key={angle}
            transform={`rotate(${angle})`}
            d={`M0 0 C${h * 0.07} ${-h * 0.12} ${h * 0.035} ${-h * 0.42} 0 ${-h * 0.5} C${-h * 0.02} ${-h * 0.4} ${-h * 0.03} ${-h * 0.12} 0 0 Z`}
            fill="#ffffff"
            stroke="#cbe9f0"
            strokeWidth={Math.max(0.4, h * 0.006)}
          />
        ))}
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0"
          to="360"
          dur={`${dur}s`}
          begin={begin}
          repeatCount="indefinite"
        />
      </g>
      <circle r={h * 0.04} fill="#e2f4f8" />
    </g>
  </g>
);

/** Lollipop tree whose trunk base sits on (x, y). */
const Tree = ({ x, y, r, c = '#56c2a8' }: { x: number; y: number; r: number; c?: string }) => (
  <g>
    <rect x={x - r * 0.12} y={y - r * 1.2} width={r * 0.24} height={r * 1.2} rx={r * 0.08} fill="#8a6a4f" />
    <circle cx={x} cy={y - r * 1.6} r={r} fill={c} />
    <circle cx={x - r * 0.35} cy={y - r * 1.95} r={r * 0.34} fill="#ffffff" opacity="0.22" />
  </g>
);

/** Closed ellipse path starting at the left extreme, for cars lapping an oval. */
const ovalPath = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy} A${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}`;

const LapCar = ({
  path,
  color,
  dur,
  begin,
  size = 1
}: {
  path: string;
  color: string;
  dur: number;
  begin: string;
  size?: number;
}) => (
  <g>
    <g transform={`scale(${size})`}>
      <rect x="-5" y="-2.4" width="10" height="4.8" rx="1.6" fill={color} />
      <rect x="0.2" y="-1.8" width="2.8" height="3.6" rx="0.9" fill="#0c4a6e" opacity="0.55" />
    </g>
    <animateMotion path={path} dur={`${dur}s`} begin={begin} repeatCount="indefinite" rotate="auto" />
  </g>
);

const Checker = ({ id, size }: { id: string; size: number }) => (
  <pattern id={id} width={size * 2} height={size * 2} patternUnits="userSpaceOnUse">
    <rect width={size * 2} height={size * 2} fill="#ffffff" />
    <rect width={size} height={size} fill="#0f172a" />
    <rect x={size} y={size} width={size} height={size} fill="#0f172a" />
  </pattern>
);

const SkyFill = ({ id, stops }: { id: string; stops: [number, string][] }) => (
  <>
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        {stops.map(([offset, color]) => (
          <stop key={offset} offset={offset} stopColor={color} />
        ))}
      </linearGradient>
    </defs>
    <rect width="270" height="530" fill={`url(#${id}-sky)`} />
  </>
);

const SunGlow = ({
  id,
  cx,
  cy,
  r,
  core,
  color = '#fffbe8'
}: {
  id: string;
  cx: number;
  cy: number;
  r: number;
  core: number;
  color?: string;
}) => (
  <>
    <defs>
      <radialGradient id={id}>
        <stop offset="0" stopColor={color} stopOpacity="0.95" />
        <stop offset="0.35" stopColor={color} stopOpacity="0.45" />
        <stop offset="1" stopColor={color} stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx={cx} cy={cy} r={r} fill={`url(#${id})`}>
      <animate attributeName="r" values={`${r};${r * 1.08};${r}`} dur="8s" repeatCount="indefinite" {...EASE2} />
    </circle>
    <circle cx={cx} cy={cy} r={core} fill="#fffdf2" />
  </>
);

const Gulls = ({ x, y, s = 1, color = '#0c4a6e' }: { x: number; y: number; s?: number; color?: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round">
    <g>
      {bob(3, 5, '-1s', 6)}
      <path d="M0 0 q5 -5 10 0 q5 -5 10 0" />
      <path d="M16 12 q4 -4 8 0 q4 -4 8 0" opacity="0.8" />
      <path d="M-8 16 q3.5 -3.5 7 0 q3.5 -3.5 7 0" opacity="0.65" />
    </g>
  </g>
);

/* ------------------------------------------------------------------ */
/* Event posters (270 x 530, the card's own proportions)               */
/* ------------------------------------------------------------------ */

/** Sunday Clubman Cup: a lazy balloon morning over the club hill. */
const BalloonPoster = ({ id }: { id: string }) => (
  <>
    <SkyFill id={id} stops={[[0, '#0a79a8'], [0.34, '#35bde6'], [0.7, '#b9eff9'], [1, '#e8fbff']]} />
    <SunGlow id={`${id}-sun`} cx={214} cy={176} r={92} core={22} />
    <DriftCloud x={128} y={222} s={0.8} dur={34} dx={16} />
    <DriftCloud x={-34} y={300} s={1.2} dur={40} dx={-14} />
    <DriftCloud x={158} y={352} s={0.95} dur={28} dx={12} />

    <g transform="translate(26 158) scale(0.3)">
      <g>
        {bob(16, 7, '-2s')}
        <BalloonGlyph id={`${id}-b2`} a="#ffffff" b="#fb7185" band="#0ea5e9" />
      </g>
    </g>
    <g transform="translate(78 172) scale(1.2)">
      <g>
        {bob(7, 8)}
        <BalloonGlyph id={`${id}-b1`} a="#ffffff" b="#22d3ee" band="#fb7185" />
      </g>
    </g>
    <g transform="translate(206 290) scale(0.36)">
      <g>
        {bob(14, 6, '-3s')}
        <BalloonGlyph id={`${id}-b3`} a="#ffffff" b="#34d399" band="#f59e0b" />
      </g>
    </g>

    <defs>
      <Checker id={`${id}-chk`} size={5} />
    </defs>
    <path d="M0 402 C50 380 110 384 160 398 C205 410 240 396 270 386 L270 530 L0 530 Z" fill="#8edbc6" />
    <Tree x={30} y={398} r={9} />
    <Tree x={52} y={394} r={7} c="#4fbba1" />
    <Tree x={238} y={396} r={8} />
    <path d="M120 404 V372 M176 404 V372" stroke="#ffffff" strokeWidth="2" />
    <rect x="120" y="372" width="56" height="10" fill={`url(#${id}-chk)`} />
    <path d="M0 438 C70 418 150 426 200 440 C232 449 255 444 270 438 L270 530 L0 530 Z" fill="#5ec6ae" />
    {[[24, 440, '#ffffff'], [70, 432, '#fde68a'], [210, 446, '#fbcfe8'], [248, 441, '#ffffff']].map(([cx, cy, c]) => (
      <circle key={`${cx}`} cx={cx as number} cy={cy as number} r="2.2" fill={c as string} />
    ))}
  </>
);

/** Rookie Speedway Challenge: a toy-sized oval with an airshow loop overhead. */
const SpeedwayPoster = ({ id }: { id: string }) => {
  const lap = ovalPath(135, 388, 118, 40);
  return (
    <>
      <SkyFill id={id} stops={[[0, '#08739f'], [0.36, '#2fb9e0'], [0.58, '#a3eaf6'], [1, '#dff9fd']]} />
      <SunGlow id={`${id}-sun`} cx={226} cy={150} r={70} core={16} />
      <DriftCloud x={150} y={196} s={0.6} dur={30} dx={12} />
      <DriftCloud x={-24} y={236} s={0.9} dur={38} dx={-10} />
      <path
        d="M18 212 C58 186 108 190 116 214 C124 238 92 248 86 228 C80 206 140 184 232 196"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="1 6"
        opacity="0.9"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-28" dur="2.4s" repeatCount="indefinite" />
      </path>
      <path d="M232 196 l11 -1.5 l-4 3 l4 3 z" fill="#ffffff" />

      <path d="M0 290 C60 272 130 276 190 286 C225 292 250 284 270 280 L270 530 L0 530 Z" fill="#a3e4d6" />

      {/* Grandstand with pennants */}
      <path d="M34 296 L236 296 L226 285 L44 285 Z" fill="#0ea5e9" />
      <rect x="34" y="295" width="202" height="2" fill="#ffffff" />
      <rect x="40" y="297" width="190" height="25" rx="2" fill="#f8fafc" />
      <path d="M44 302 H226" stroke="#22d3ee" strokeWidth="4" strokeDasharray="3 1.5" />
      <path d="M44 308 H226" stroke="#fb7185" strokeWidth="4" strokeDasharray="3 1.5" />
      <path d="M44 314 H226" stroke="#fde047" strokeWidth="4" strokeDasharray="3 1.5" />
      {Array.from({ length: 11 }, (_, i) => 50 + i * 17).map((px, i) => (
        <path
          key={px}
          d={`M${px - 4} 285 L${px + 4} 285 L${px} 277 Z`}
          fill={['#fb7185', '#fde047', '#ffffff', '#22d3ee'][i % 4]}
        />
      ))}

      <defs>
        <linearGradient id={`${id}-grass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7bd9c0" />
          <stop offset="1" stopColor="#52bea3" />
        </linearGradient>
        <Checker id={`${id}-chk`} size={4} />
      </defs>
      <rect y="322" width="270" height="208" fill={`url(#${id}-grass)`} />

      <ellipse cx="135" cy="388" rx="118" ry="40" fill="#93e5cd" />
      <ellipse cx="135" cy="388" rx="118" ry="40" fill="none" stroke="#ffffff" strokeWidth="24" />
      <ellipse cx="135" cy="388" rx="118" ry="40" fill="none" stroke="#5f7a8a" strokeWidth="19" />
      <ellipse cx="135" cy="388" rx="118" ry="40" fill="none" stroke="#ffffff" strokeWidth="0.8" strokeDasharray="4 6" opacity="0.7" />
      <rect x="131" y="338.5" width="8" height="19" fill={`url(#${id}-chk)`} />
      {/* Infield picnic tents */}
      <path d="M96 396 L108 380 L120 396 Z" fill="#ffffff" />
      <path d="M104 396 L108 380 L112 396 Z" fill="#22d3ee" />
      <path d="M150 398 L162 382 L174 398 Z" fill="#ffffff" />
      <path d="M158 398 L162 382 L166 398 Z" fill="#fb7185" />
      <Tree x={78} y={392} r={6} />
      <Tree x={194} y={392} r={7} c="#4fbba1" />

      <LapCar path={lap} color="#fb7185" dur={9} begin="-1s" />
      <LapCar path={lap} color="#fde047" dur={11} begin="-4s" />
      <LapCar path={lap} color="#ffffff" dur={13} begin="-8s" />
    </>
  );
};

/** One diamond kite, gently swaying on its string. */
const Kite = ({
  cx,
  cy,
  w,
  h,
  c1,
  c2,
  dur,
  begin
}: {
  cx: number;
  cy: number;
  w: number;
  h: number;
  c1: string;
  c2: string;
  dur: number;
  begin: string;
}) => {
  const top = cy - h * 0.35;
  const bottom = cy + h * 0.65;
  const left = cx - w / 2;
  const right = cx + w / 2;
  const bows = [0.22, 0.48, 0.74];
  return (
    <g>
      <animateTransform
        attributeName="transform"
        type="rotate"
        values={`-6 ${cx} ${cy};6 ${cx} ${cy};-6 ${cx} ${cy}`}
        dur={`${dur}s`}
        begin={begin}
        repeatCount="indefinite"
        {...EASE2}
      />
      <line x1={cx} y1={cy} x2={120} y2={600} stroke="#ffffff" strokeWidth="0.7" opacity="0.6" />
      <path
        d={`M${cx} ${bottom} c${-w * 0.12} ${h * 0.2} ${w * 0.14} ${h * 0.36} 0 ${h * 0.55} s${-w * 0.12} ${h * 0.36} ${w * 0.06} ${h * 0.56}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.2"
      />
      {bows.map((t) => {
        const by = bottom + h * 1.1 * t;
        const bx = cx + Math.sin(t * 9) * w * 0.08;
        return (
          <path
            key={t}
            d={`M${bx - 5} ${by - 3} L${bx + 5} ${by + 3} L${bx + 5} ${by - 3} L${bx - 5} ${by + 3} Z`}
            fill={t === 0.48 ? c2 : c1}
          />
        );
      })}
      <path d={`M${cx} ${top} L${left} ${cy} L${cx} ${cy} Z`} fill={c1} />
      <path d={`M${cx} ${top} L${right} ${cy} L${cx} ${cy} Z`} fill={c2} />
      <path d={`M${cx} ${cy} L${right} ${cy} L${cx} ${bottom} Z`} fill={c1} />
      <path d={`M${cx} ${cy} L${left} ${cy} L${cx} ${bottom} Z`} fill={c2} />
      <path d={`M${cx} ${top} V${bottom} M${left} ${cy} H${right}`} stroke="#ffffff" strokeWidth="0.9" opacity="0.85" />
    </g>
  );
};

/** Novice Clubman Challenge: kite day on the paddock meadow. */
const KitePoster = ({ id }: { id: string }) => (
  <>
    <SkyFill id={id} stops={[[0, '#0f7fb0'], [0.38, '#49c8ea'], [0.72, '#d3f4fb'], [1, '#ece8ff']]} />
    <SunGlow id={`${id}-sun`} cx={222} cy={132} r={80} core={17} />
    <DriftCloud x={140} y={184} s={0.7} dur={32} dx={14} />
    <DriftCloud x={-14} y={326} s={1} dur={36} dx={-12} shade="#e4e2fb" />
    <DriftCloud x={168} y={384} s={0.8} dur={27} dx={10} shade="#e4e2fb" />
    <Kite cx={76} cy={268} w={44} h={64} c1="#22d3ee" c2="#ffffff" dur={4.5} begin="-1s" />
    <Kite cx={222} cy={318} w={30} h={44} c1="#a78bfa" c2="#ffffff" dur={4} begin="-2.2s" />
    <Kite cx={172} cy={208} w={70} h={100} c1="#fb7185" c2="#fde68a" dur={5.5} begin="0s" />
    <Gulls x={34} y={196} s={0.7} />
    <path d="M0 418 C60 400 140 404 200 414 C230 419 252 414 270 410 V530 H0 Z" fill="#9fe6c6" />
    <path d="M0 446 C80 430 160 434 270 444 V530 H0 Z" fill="#6fd3ad" />
    {[
      [18, 424, '#ffffff'], [46, 416, '#fde68a'], [96, 418, '#fbcfe8'], [150, 420, '#ffffff'],
      [186, 424, '#c4b5fd'], [232, 418, '#fde68a'], [258, 424, '#ffffff'], [70, 436, '#ffffff']
    ].map(([cx, cy, c]) => (
      <circle key={`${cx}-${cy}`} cx={cx as number} cy={cy as number} r="2" fill={c as string} />
    ))}
  </>
);

/** A little sailboat whose waterline sits on (x, y). */
const Sailboat = ({ x, y, s, begin }: { x: number; y: number; s: number; begin: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <g>
      {bob(1.6, 3.6, begin)}
      <path d="M-10 0 L10 0 L6.5 4.5 L-6.5 4.5 Z" fill="#0f5f7a" />
      <path d="M0 -1 V-22" stroke="#0f5f7a" strokeWidth="0.9" />
      <path d="M1 -2 L1 -21 L12 -2 Z" fill="#ffffff" />
      <path d="M-1 -2 L-1 -16 L-9 -2 Z" fill="#fb7185" />
    </g>
  </g>
);

/** Coastal Horizon Trophy: lighthouse point at golden hour. */
const CoastPoster = ({ id }: { id: string }) => (
  <>
    <SkyFill id={id} stops={[[0, '#0a7eac'], [0.3, '#3ec4e6'], [0.5, '#bdeef7'], [0.6, '#ffe4cf']]} />
    <SunGlow id={`${id}-sun`} cx={188} cy={316} r={104} core={28} color="#fff1d6" />
    <DriftCloud x={124} y={176} s={0.6} dur={30} dx={12} shade="#fbe2dc" />
    <DriftCloud x={-22} y={232} s={0.8} dur={36} dx={-10} shade="#fbe2dc" />
    <Gulls x={196} y={214} s={0.9} />

    <defs>
      <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1aa8c4" />
        <stop offset="1" stopColor="#5ad3dc" />
      </linearGradient>
      <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fffbe6" stopOpacity="0.8" />
        <stop offset="1" stopColor="#fffbe6" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-beamL`} x1="1" y1="0" x2="0" y2="0">
        <stop offset="0" stopColor="#fffbe6" stopOpacity="0.8" />
        <stop offset="1" stopColor="#fffbe6" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect y="316" width="270" height="214" fill={`url(#${id}-sea)`} />
    {[
      [322, 44], [330, 34], [339, 26], [349, 18], [360, 12]
    ].map(([ry, rw], i) => (
      <rect key={ry} x={188 - rw / 2} y={ry} width={rw} height="2.5" rx="1.25" fill="#fff6dd">
        <animate attributeName="opacity" values="0.45;0.95;0.45" dur="3.2s" begin={`${-i * 0.6}s`} repeatCount="indefinite" />
      </rect>
    ))}
    <g stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.5">
      {bob(0, 5, '0s', 8)}
      <path d="M120 374 H160 M206 382 H250 M150 400 H196 M226 414 H262 M130 426 H170" />
    </g>
    <Sailboat x={146} y={338} s={0.8} begin="0s" />
    <Sailboat x={228} y={364} s={1.1} begin="-1.4s" />

    {/* Cliff and lighthouse */}
    <path d="M0 238 C22 232 48 238 70 250 C86 260 94 290 98 320 C102 360 106 420 110 530 L0 530 Z" fill="#cad8da" />
    <path d="M70 250 C86 260 94 290 98 320 C102 360 106 420 110 530 L92 530 C88 430 84 340 74 290 C70 272 66 260 60 254 Z" fill="#aebfc3" />
    <path d="M0 236 C22 230 48 236 70 248 C78 253 84 260 88 268 C70 262 50 258 30 260 C18 261 8 262 0 262 Z" fill="#6fcfae" />
    <path d="M40 187 L270 150 L270 224 Z" fill={`url(#${id}-beam)`}>
      <animate attributeName="opacity" values="0;0.85;0" dur="5s" repeatCount="indefinite" />
    </path>
    <path d="M40 187 L0 174 L0 200 Z" fill={`url(#${id}-beamL)`}>
      <animate attributeName="opacity" values="0;0.85;0" dur="5s" begin="-2.5s" repeatCount="indefinite" />
    </path>
    <path d="M31 250 L49 250 L46 196 L34 196 Z" fill="#ffffff" />
    <path d="M31.4 244 L48.6 244 L48 234 L32 234 Z" fill="#fb7185" />
    <path d="M32.6 224 L47.4 224 L46.8 214 L33.2 214 Z" fill="#fb7185" />
    <rect x="31" y="192" width="18" height="4" rx="1" fill="#0f5f7a" />
    <rect x="34" y="182" width="12" height="10" fill="#fef3c7" stroke="#0f5f7a" strokeWidth="0.8" />
    <path d="M32 182 L48 182 L40 172 Z" fill="#fb7185" />

    <path d="M140 530 C160 478 212 458 270 452 L270 530 Z" fill="#f6e5c3" />
    <path d="M140 530 C160 478 212 458 270 452" fill="none" stroke="#ffffff" strokeWidth="3" opacity="0.85" />
  </>
);

/** Grassroots Sprint Clash: a straight country sprint through the wind farm. */
const WindPoster = ({ id }: { id: string }) => (
  <>
    <SkyFill id={id} stops={[[0, '#0981a5'], [0.36, '#33c2dd'], [0.66, '#c0f2f0'], [1, '#e4fff6']]} />
    <SunGlow id={`${id}-sun`} cx={222} cy={146} r={80} core={17} />
    <DriftCloud x={146} y={204} s={0.7} dur={30} dx={14} />
    <DriftCloud x={-22} y={262} s={0.9} dur={36} dx={-12} />
    <path d="M0 332 C50 316 110 318 160 330 C200 340 240 326 270 318 V530 H0 Z" fill="#ade8c8" />
    <Turbine x={58} y={328} h={96} dur={7} />
    <Turbine x={214} y={324} h={112} dur={9} begin="-3s" />
    <Turbine x={156} y={338} h={56} dur={6} begin="-1s" />
    <path d="M0 360 C60 344 120 350 170 362 C210 372 245 362 270 356 V530 H0 Z" fill="#88dbaf" />
    <path d="M0 390 C80 378 190 380 270 392 V530 H0 Z" fill="#63c996" />

    <defs>
      <Checker id={`${id}-chk`} size={4} />
    </defs>
    <path d="M92 530 L147 352 L151 352 L178 530 Z" fill="#6f8a99" />
    <path d="M95 530 L147.6 352 M175 530 L150.4 352" stroke="#ffffff" strokeWidth="1.4" opacity="0.9" />
    <path d="M135 530 L149 352" stroke="#ffffff" strokeWidth="2" strokeDasharray="12 12">
      <animate attributeName="stroke-dashoffset" from="0" to="24" dur="0.9s" repeatCount="indefinite" />
    </path>
    <path d="M118 424 V396 M170 424 V396" stroke="#ffffff" strokeWidth="2" />
    <rect x="118" y="396" width="52" height="8" fill={`url(#${id}-chk)`} />

    <g stroke="#ffffff" strokeLinecap="round" strokeWidth="1.2">
      {[
        [18, 452, 58, 0], [30, 470, 76, 0.4], [206, 458, 246, 0.8], [196, 476, 250, 0.2]
      ].map(([x1, y1, x2, delay]) => (
        <path key={`${x1}-${y1}`} d={`M${x1} ${y1} H${x2}`} opacity="0">
          <animate attributeName="opacity" values="0;0.8;0" dur="1.6s" begin={`${-delay}s`} repeatCount="indefinite" />
        </path>
      ))}
    </g>
    {[
      [40, 400, 0], [88, 372, 2], [196, 392, 4], [232, 366, 1], [124, 344, 3]
    ].map(([sx, sy, delay]) => (
      <g key={`${sx}-${sy}`} opacity="0">
        <animate attributeName="opacity" values="0;1;0" dur="9s" begin={`${-delay}s`} repeatCount="indefinite" />
        <animateTransform attributeName="transform" type="translate" values="0 0;16 -70" dur="9s" begin={`${-delay}s`} repeatCount="indefinite" />
        <circle cx={sx} cy={sy} r="1.5" fill="#ffffff" />
        <path d={`M${sx} ${sy} l-2 -3 M${sx} ${sy} l0 -3.5 M${sx} ${sy} l2 -3`} stroke="#ffffff" strokeWidth="0.6" />
      </g>
    ))}
  </>
);

const POSTERS: Record<string, (props: { id: string }) => React.ReactElement> = {
  amateur_sunday_cup: BalloonPoster,
  amateur_oval_derby: SpeedwayPoster,
  amateur_novice_trophy: KitePoster,
  amateur_coastal_sprint: CoastPoster,
  amateur_grassroots_derby: WindPoster
};

export const hasAmateurPoster = (eventId: string) => eventId in POSTERS;

/** Illustrated poster art for an amateur event card. */
export function AmateurEventPoster({ eventId }: { eventId: string }) {
  const id = useSvgId();
  const Poster = POSTERS[eventId];
  if (!Poster) return null;
  return (
    <svg
      viewBox="0 0 270 530"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden
    >
      <Poster id={id} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Tier backdrop                                                       */
/* ------------------------------------------------------------------ */

const BACKDROP_CSS = `
.amsky-layer { animation: amsky-drift linear infinite; will-change: transform; }
.amsky-bob { animation: amsky-bob ease-in-out infinite; }
.amsky-sway { animation: amsky-sway ease-in-out infinite alternate; }
.amsky-flock { animation: amsky-fly linear infinite; will-change: transform; }
.amsky-flap { animation: amsky-flap 0.9s ease-in-out infinite; transform-origin: 50% 70%; }
.amsky-mote { animation: amsky-rise ease-in-out infinite; }
.amsky-rays {
  position: absolute; left: 0; top: 0; width: 1900px; height: 1900px;
  background: repeating-conic-gradient(from 0deg, rgba(255,255,255,0.16) 0deg 5deg, rgba(255,255,255,0) 5deg 15deg);
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,0.45) 24%, transparent 58%);
  mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,0.45) 24%, transparent 58%);
  animation: amsky-spin 180s linear infinite;
}
.amsky-halo {
  position: absolute; left: 0; top: 0; width: 560px; height: 560px; border-radius: 9999px;
  background: radial-gradient(circle, rgba(255,253,235,0.8) 0%, rgba(255,255,255,0.3) 36%, rgba(255,255,255,0) 70%);
  animation: amsky-pulse 9s ease-in-out infinite;
}
.amsky-sun {
  position: absolute; left: 0; top: 0; width: 112px; height: 112px; border-radius: 9999px;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle at 45% 42%, #ffffff 0%, #fffbe6 55%, #fff0c0 100%);
  box-shadow: 0 0 60px 22px rgba(255,250,225,0.75), 0 0 150px 70px rgba(255,255,255,0.32);
}
@keyframes amsky-drift { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
@keyframes amsky-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
@keyframes amsky-sway { from { transform: translateX(-18px) rotate(-2deg); } to { transform: translateX(18px) rotate(2deg); } }
@keyframes amsky-fly { from { transform: translate3d(-14vw, 0, 0); } to { transform: translate3d(114vw, -7vh, 0); } }
@keyframes amsky-flap { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.35); } }
@keyframes amsky-rise {
  0% { transform: translateY(0) scale(0.6); opacity: 0; }
  25% { opacity: 0.9; }
  100% { transform: translateY(-170px) scale(1); opacity: 0; }
}
@keyframes amsky-spin { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(360deg); } }
@keyframes amsky-pulse {
  0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 0.92; }
  50% { transform: translate(-50%,-50%) scale(1.07); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .amsky-layer, .amsky-bob, .amsky-sway, .amsky-flock, .amsky-flap, .amsky-mote, .amsky-rays, .amsky-halo { animation: none !important; }
}
`;

type CloudSpec = [left: number, top: number, width: number];

/**
 * Three parallax cloud decks. Each deck is two identical halves scrolled by -50%,
 * so every cloud keeps left + width inside its half to loop without a pop.
 */
const CLOUD_LAYERS: { dur: number; opacity: number; shade: string; clouds: CloudSpec[] }[] = [
  {
    dur: 280,
    opacity: 0.62,
    shade: '#cfeef7',
    clouds: [[3, 9, 120], [21, 26, 90], [38, 7, 150], [56, 30, 100], [72, 13, 130], [86, 36, 80]]
  },
  {
    dur: 180,
    opacity: 0.86,
    shade: '#d3f0f8',
    clouds: [[6, 33, 220], [31, 17, 180], [52, 43, 250], [74, 23, 200]]
  },
  {
    dur: 115,
    opacity: 0.95,
    shade: '#d9f2f8',
    clouds: [[1, 55, 360], [34, 60, 300], [60, 52, 400]]
  }
];

const BALLOONS = [
  { left: '6%', top: '19%', w: 92, a: '#ffffff', b: '#22d3ee', band: '#fb7185', bob: 8, sway: 34 },
  { left: '87%', top: '43%', w: 64, a: '#fff7ed', b: '#fb923c', band: '#0ea5e9', bob: 7, sway: 28 },
  { left: '26%', top: '8%', w: 40, a: '#ffffff', b: '#34d399', band: '#22d3ee', bob: 6, sway: 40 },
  { left: '66%', top: '11%', w: 30, a: '#ffffff', b: '#a78bfa', band: '#fde047', bob: 5, sway: 46 }
];

/** Deterministic floating light motes, lower two thirds of the screen. */
const MOTES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37.3 + 11) % 100,
  top: 38 + ((i * 53.7) % 52),
  size: 3 + (i % 3),
  dur: 9 + (i % 5) * 1.7,
  delay: -((i * 1.9) % 12)
}));

const FLOCKS = [
  { top: '24%', dur: 52, delay: -8, scale: 1 },
  { top: '14%', dur: 70, delay: -41, scale: 0.7 }
];

/** The animated sky that sits behind the amateur tier carousel. */
export function AmateurSkyBackdrop() {
  const id = useSvgId();
  const trackLap = ovalPath(1150, 238, 150, 19);
  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{BACKDROP_CSS}</style>

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #1ea6d4 0%, #4ccae9 24%, #92e3f3 48%, #cff4fa 66%, #effdff 80%)'
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[62%]"
        style={{
          background:
            'radial-gradient(120% 70% at 50% 100%, rgba(255,226,210,0.42) 0%, rgba(255,226,210,0) 62%)'
        }}
      />

      {/* Sun, halo and slow turning rays */}
      <div className="absolute" style={{ left: '82%', top: '15%' }}>
        <div className="amsky-rays" />
        <div className="amsky-halo" />
        <div className="amsky-sun" />
      </div>

      {/* Parallax cloud decks */}
      {CLOUD_LAYERS.map((layer, li) => (
        <div
          key={li}
          className="amsky-layer absolute inset-y-0 left-0 flex w-[200%]"
          style={{ animationDuration: `${layer.dur}s`, opacity: layer.opacity }}
        >
          {[0, 1].map((half) => (
            <div key={half} className="relative h-full w-1/2">
              {layer.clouds.map(([left, top, width], ci) => (
                <svg
                  key={ci}
                  viewBox="-6 -4 130 62"
                  className="absolute"
                  style={{ left: `${left}%`, top: `${top}%`, width, height: 'auto' }}
                >
                  <CloudPuff shade={layer.shade} />
                </svg>
              ))}
            </div>
          ))}
        </div>
      ))}

      {/* Rolling hills, wind farm and the little club speedway on the horizon */}
      <svg
        viewBox="0 0 1600 420"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 bottom-0 h-[52vh] w-full"
      >
        <defs>
          <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#62c8b0" />
            <stop offset="1" stopColor="#3fae9b" />
          </linearGradient>
        </defs>

        <path
          d="M0 190 C150 150 290 160 440 182 C600 205 740 150 920 156 C1100 162 1250 190 1400 176 C1500 166 1560 170 1600 174 L1600 420 L0 420 Z"
          fill="#b3ebe4"
        />
        <Turbine x={250} y={172} h={80} dur={8} />
        <Turbine x={330} y={178} h={64} dur={7} begin="-2s" />
        <Turbine x={410} y={186} h={52} dur={6.5} begin="-4s" />
        <Turbine x={1478} y={176} h={72} dur={9} begin="-1s" />
        <rect y="130" width="1600" height="140" fill={`url(#${id}-haze)`} />

        <path
          d="M760 262 C900 214 1120 206 1280 226 C1420 244 1530 256 1600 252 L1600 420 L760 420 Z"
          fill="#9fe2d3"
        />
        {/* Grandstand and flags on the hilltop */}
        <path d="M1086 204 L1214 204 L1206 196 L1094 196 Z" fill="#0ea5e9" />
        <rect x="1090" y="204" width="120" height="14" rx="1.5" fill="#f8fafc" />
        <path d="M1094 209 H1206" stroke="#22d3ee" strokeWidth="2.5" strokeDasharray="2 1" />
        <path d="M1094 214 H1206" stroke="#fb7185" strokeWidth="2.5" strokeDasharray="2 1" />
        <path d="M1070 222 V196 M1232 222 V194" stroke="#ffffff" strokeWidth="1.5" />
        <path d="M1070 196 L1082 199 L1070 202 Z" fill="#fb7185" />
        <path d="M1232 194 L1244 197 L1232 200 Z" fill="#fde047" />
        <ellipse cx="1150" cy="238" rx="150" ry="19" fill="#bff1e2" />
        <ellipse cx="1150" cy="238" rx="150" ry="19" fill="none" stroke="#ffffff" strokeWidth="9" />
        <ellipse cx="1150" cy="238" rx="150" ry="19" fill="none" stroke="#7b94a4" strokeWidth="6.5" />
        <LapCar path={trackLap} color="#fb7185" dur={12} begin="-2s" size={0.7} />
        <LapCar path={trackLap} color="#fde047" dur={14} begin="-7s" size={0.7} />
        <LapCar path={trackLap} color="#ffffff" dur={16} begin="-11s" size={0.7} />

        <path
          d="M0 282 C140 244 290 238 440 262 C580 284 700 290 840 280 C980 270 1100 290 1220 298 C1380 306 1500 292 1600 288 L1600 420 L0 420 Z"
          fill="#85dbc3"
        />
        {[
          [110, 262, 11], [138, 258, 8], [166, 256, 12], [520, 276, 10], [548, 280, 7],
          [700, 290, 9], [1290, 304, 10], [1318, 302, 8], [1420, 298, 11]
        ].map(([tx, ty, tr]) => (
          <Tree key={`${tx}`} x={tx} y={ty} r={tr} c={tx % 2 ? '#4fbba1' : '#5cc5ab'} />
        ))}

        {/* Country road winding up to the speedway */}
        <path
          d="M-20 372 C180 352 300 318 470 306 C620 296 780 288 1010 250"
          fill="none"
          stroke="#e3f5f7"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M-20 372 C180 352 300 318 470 306 C620 296 780 288 1010 250"
          fill="none"
          stroke="#9fd6de"
          strokeWidth="1.2"
          strokeDasharray="10 10"
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="3s" repeatCount="indefinite" />
        </path>

        <path
          d="M0 336 C200 304 380 312 560 332 C740 352 900 350 1060 338 C1240 324 1420 320 1600 332 L1600 420 L0 420 Z"
          fill={`url(#${id}-front)`}
        />
        <g transform="translate(0 -3)">
          <path
            d="M0 336 C200 304 380 312 560 332 C740 352 900 350 1060 338 C1240 324 1420 320 1600 332"
            fill="none"
            stroke="#ffffff"
            strokeWidth="9"
            strokeDasharray="2 9"
            opacity="0.85"
          />
          <path
            d="M0 333 C200 301 380 309 560 329 C740 349 900 347 1060 335 C1240 321 1420 317 1600 329"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.4"
            opacity="0.85"
          />
        </g>
        <Tree x={70} y={352} r={22} c="#4ab59c" />
        <Tree x={1540} y={350} r={20} c="#4ab59c" />
        {[
          [240, 350, '#ffffff'], [300, 356, '#fde68a'], [640, 364, '#fbcfe8'], [980, 362, '#ffffff'],
          [1180, 352, '#fde68a'], [1360, 350, '#ffffff'], [420, 362, '#c4b5fd']
        ].map(([fx, fy, fc]) => (
          <circle key={`${fx}`} cx={fx as number} cy={fy as number} r="3" fill={fc as string} />
        ))}
      </svg>

      {/* Balloons drifting in front of the hills */}
      {BALLOONS.map((balloon, i) => (
        <div
          key={i}
          className="amsky-sway absolute"
          style={{ left: balloon.left, top: balloon.top, animationDuration: `${balloon.sway}s` }}
        >
          <div className="amsky-bob" style={{ animationDuration: `${balloon.bob}s`, animationDelay: `${-i * 1.7}s` }}>
            <svg viewBox="0 0 100 136" style={{ width: balloon.w, height: 'auto' }} aria-hidden>
              <BalloonGlyph id={`${id}-bal${i}`} a={balloon.a} b={balloon.b} band={balloon.band} />
            </svg>
          </div>
        </div>
      ))}

      {/* Gliding birds */}
      {FLOCKS.map((flock, fi) => (
        <div
          key={fi}
          className="amsky-flock absolute left-0"
          style={{ top: flock.top, animationDuration: `${flock.dur}s`, animationDelay: `${flock.delay}s` }}
        >
          <div className="relative h-10 w-24" style={{ transform: `scale(${flock.scale})` }}>
            {[
              [0, 14, 0], [26, 0, 0.3], [30, 26, 0.55]
            ].map(([bx, by, delay]) => (
              <svg
                key={`${bx}-${by}`}
                viewBox="0 0 20 8"
                className="amsky-flap absolute w-6"
                style={{ left: bx, top: by, animationDelay: `${delay}s` }}
              >
                <path d="M1 6 Q5 1 10 6 Q15 1 19 6" fill="none" stroke="#0e5a78" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ))}
          </div>
        </div>
      ))}

      {/* Floating light motes */}
      {MOTES.map((mote, i) => (
        <span
          key={i}
          className="amsky-mote absolute rounded-full bg-white"
          style={{
            left: `${mote.left}%`,
            top: `${mote.top}%`,
            width: mote.size,
            height: mote.size,
            boxShadow: '0 0 8px 2px rgba(255,255,255,0.8)',
            animationDuration: `${mote.dur}s`,
            animationDelay: `${mote.delay}s`
          }}
        />
      ))}

      {/* Soft top shade so the header glass keeps its contrast */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#0b6f99]/25 to-transparent" />
    </div>
  );
}

/** Centred tier name plate for the amateur top bar. */
export function AmateurTierBadge({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-full border border-white/70 bg-white/35 py-1.5 pl-2 pr-6 shadow-[0_10px_30px_rgba(14,116,144,0.22)] backdrop-blur-xl">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-amber-200 via-yellow-100 to-white shadow-[0_0_18px_rgba(253,230,138,0.9)]">
        <Sun className="h-5 w-5 text-amber-500" strokeWidth={2.5} />
      </div>
      <div className="flex flex-col leading-none">
        <span
          className="text-[19px] font-extrabold tracking-wide text-sky-950"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          {name}
        </span>
        <span className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.32em] text-cyan-700">
          {subtitle}
        </span>
      </div>
    </div>
  );
}
