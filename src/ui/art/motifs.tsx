/**
 * Emblems for Spell and Trap Cards: one recognisable motif per card, drawn with SVG primitives.
 */
import { useId } from 'react';
import { shade } from './creatures';

export interface MotifPalette {
  main: string;
  accent: string;
  glow: string;
}

export type MotifKind =
  | 'swords'
  | 'ankh'
  | 'shrine'
  | 'cry'
  | 'burst'
  | 'stomp'
  | 'wings'
  | 'cards'
  | 'tactics'
  | 'soul'
  | 'controller'
  | 'castle'
  | 'chain'
  | 'condenser'
  | 'tomb'
  | 'ejector'
  | 'shield'
  | 'crystal'
  | 'beacon'
  | 'tree'
  | 'release'
  | 'abundance'
  | 'blessing'
  | 'miracle'
  | 'brilliance'
  | 'pair'
  | 'conclave'
  | 'aegis'
  | 'bond'
  | 'wand'
  | 'boon'
  | 'promise'
  | 'counter'
  | 'prism'
  | 'bridge'
  | 'heartbridge'
  | 'ruins'
  | 'darkOrb'
  | 'awakening'
  | 'ferret'
  | 'globe'
  | 'cyclone'
  | 'shovel'
  | 'melody'
  | 'value'
  | 'fiendish'
  | 'hole'
  | 'garden'
  | 'tune'
  | 'lightning'
  | 'feather'
  | 'armor'
  | 'sanctum'
  | 'scales'
  | 'flame'
  | 'crimson'
  | 'gear'
  | 'horn'
  | 'pot'
  | 'golem'
  | 'zone'
  | 'crown'
  | 'fist'
  | 'roots';

function Gem({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g>
      <polygon points={`${x},${y - r} ${x + r * 0.75},${y - r * 0.2} ${x + r * 0.45},${y + r} ${x - r * 0.45},${y + r} ${x - r * 0.75},${y - r * 0.2}`} fill={color} stroke="#fff" strokeWidth={0.7} strokeOpacity={0.8} />
      <polygon points={`${x},${y - r} ${x + r * 0.75},${y - r * 0.2} ${x - r * 0.75},${y - r * 0.2}`} fill="#fff" fillOpacity={0.45} />
    </g>
  );
}

function Cluster({ p, n = 3 }: { p: MotifPalette; n?: number }) {
  const gems = [
    { x: 50, y: 52, r: 18, c: p.main },
    { x: 30, y: 62, r: 11, c: p.accent },
    { x: 70, y: 62, r: 11, c: p.accent },
    { x: 40, y: 78, r: 7, c: p.main },
    { x: 62, y: 78, r: 7, c: p.main },
  ].slice(0, n);
  return (
    <g>
      {gems.map((g, i) => (
        <Gem key={i} x={g.x} y={g.y} r={g.r} color={g.c} />
      ))}
    </g>
  );
}

function RainbowArc({ cx, cy, r, w = 4 }: { cx: number; cy: number; r: number; w?: number }) {
  const colors = ['#ff4d6d', '#ff9f1c', '#ffe066', '#3ee3b6', '#4cc9f0', '#b388ff'];
  return (
    <g fill="none" strokeWidth={w}>
      {colors.map((c, i) => (
        <path key={c} d={`M${cx - r + i * w},${cy} A${r - i * w},${r - i * w} 0 0 1 ${cx + r - i * w},${cy}`} stroke={c} />
      ))}
    </g>
  );
}

export function Motif({ kind, p: raw, backdrop = true }: { kind: MotifKind; p: MotifPalette; backdrop?: boolean }) {
  const id = useId().replace(/:/g, '');
  const p: MotifPalette = { main: `url(#${id}-m)`, accent: `url(#${id}-a)`, glow: raw.glow };
  const body = (() => {
    switch (kind) {
      case 'hole':
        return (
          <g>
            <ellipse cx={50} cy={62} rx={34} ry={14} fill="#0b0d14" stroke={p.main} strokeWidth={3} />
            <ellipse cx={50} cy={62} rx={24} ry={9} fill="#000" />
            <path d="M26,58 L30,66 L34,58 L38,66 L42,58 M58,58 L62,66 L66,58 L70,66 L74,58" stroke={p.accent} strokeWidth={1.4} fill="none" />
            <path d="M50,20 L50,44 M44,38 L50,46 L56,38" stroke={p.glow} strokeWidth={3} fill="none" strokeLinecap="round" />
            <ellipse cx={50} cy={84} rx={30} ry={4} fill="#0006" />
          </g>
        );
      case 'garden':
        return (
          <g>
            <rect x={14} y={70} width={72} height={14} rx={4} fill={p.accent} />
            {[24, 40, 56, 72].map((x, i) => (
              <g key={x}>
                <path d={`M${x},70 L${x},${48 - i * 2}`} stroke={p.main} strokeWidth={3} strokeLinecap="round" />
                {[0, 72, 144, 216, 288].map((r) => (
                  <ellipse key={r} cx={x} cy={44 - i * 2} rx={5} ry={2.4} fill={i % 2 ? p.glow : '#ff7aa0'} transform={`rotate(${r} ${x} ${44 - i * 2})`} />
                ))}
              </g>
            ))}
            <ellipse cx={50} cy={64} rx={22} ry={6} fill="#0b0d14" opacity={0.8} />
          </g>
        );
      case 'tune':
        return (
          <g>
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(${28 + i * 20} ${40 + (i % 2) * 14})`}>
                <ellipse cx={-4} cy={12} rx={6} ry={4} fill={p.main} transform="rotate(-20 -4 12)" />
                <rect x={1} y={-18} width={3} height={30} fill={p.main} />
                <path d="M4,-18 C14,-14 16,-4 8,0" stroke={p.accent} strokeWidth={3} fill="none" />
              </g>
            ))}
            <path d="M14,80 q18,-10 36,0 q18,10 36,0" stroke={p.glow} strokeWidth={2} fill="none" opacity={0.7} />
          </g>
        );
      case 'lightning':
        return (
          <g>
            <path d="M54,6 L36,50 L50,50 L40,94 L70,42 L54,42 L66,6Z" fill={p.glow} stroke={p.accent} strokeWidth={1.5} strokeLinejoin="round" />
            <path d="M22,30 L14,44 L22,44 L16,58" stroke={p.main} strokeWidth={2} fill="none" opacity={0.7} />
            <path d="M80,36 L74,48 L82,48 L76,62" stroke={p.main} strokeWidth={2} fill="none" opacity={0.7} />
          </g>
        );
      case 'feather':
        return (
          <g>
            <path d="M28,84 C30,50 52,22 78,14 C76,40 60,72 28,84Z" fill={p.main} stroke="#0007" strokeWidth={0.7} />
            <path d="M28,84 C46,60 62,40 78,14" stroke={p.accent} strokeWidth={2} fill="none" />
            {[0, 1, 2, 3, 4].map((i) => (
              <path key={i} d={`M${40 + i * 7},${70 - i * 10} L${52 + i * 6},${66 - i * 11}`} stroke="#0006" strokeWidth={0.8} />
            ))}
            <circle cx={22} cy={30} r={4} fill={p.glow} opacity={0.6} />
            <circle cx={84} cy={64} r={3} fill={p.glow} opacity={0.6} />
          </g>
        );
      case 'armor':
        return (
          <g>
            <path d="M30,22 L50,14 L70,22 L74,60 C74,74 62,84 50,90 C38,84 26,74 26,60Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <path d="M50,20 L50,86 M32,44 L68,44 M34,64 L66,64" stroke={p.accent} strokeWidth={2} />
            <circle cx={50} cy={54} r={6} fill={p.glow} opacity={0.8} />
          </g>
        );
      case 'sanctum':
        return (
          <g>
            <rect x={22} y={40} width={56} height={44} fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <path d="M16,42 L50,16 L84,42Z" fill={p.accent} />
            {[30, 46, 62].map((x) => (
              <rect key={x} x={x} y={52} width={8} height={32} fill="#0b0d14" opacity={0.7} />
            ))}
            <circle cx={50} cy={30} r={5} fill={p.glow} />
          </g>
        );
      case 'scales':
        return (
          <g>
            <rect x={48} y={16} width={4} height={64} fill={p.main} />
            <rect x={30} y={80} width={40} height={6} rx={2} fill={p.main} />
            <path d="M14,30 L86,30" stroke={p.accent} strokeWidth={3} />
            <path d="M14,30 L4,52 L24,52Z M86,30 L76,52 L96,52Z" fill={p.accent} opacity={0.9} />
            <ellipse cx={14} cy={52} rx={10} ry={3} fill={p.glow} opacity={0.6} />
            <ellipse cx={86} cy={52} rx={10} ry={3} fill={p.glow} opacity={0.6} />
          </g>
        );
      case 'flame':
        return (
          <g>
            <path d="M50,10 C62,26 74,38 70,58 C68,76 58,86 50,90 C42,86 32,76 30,58 C26,38 38,26 50,10Z" fill={p.main} />
            <path d="M50,34 C58,44 62,52 60,64 C58,74 54,80 50,82 C46,80 42,74 40,64 C38,52 42,44 50,34Z" fill={p.glow} />
            <path d="M50,54 C54,60 55,66 52,72 C50,76 50,76 48,72 C45,66 46,60 50,54Z" fill="#fff3b0" />
            <path d="M22,70 q6,-14 14,-4 M78,70 q-6,-14 -14,-4" stroke={p.accent} strokeWidth={2} fill="none" />
          </g>
        );
      case 'crimson':
        return (
          <g>
            <circle cx={50} cy={50} r={30} fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <path d="M22,44 C34,36 46,40 58,32 C66,28 74,32 80,42" stroke={p.accent} strokeWidth={5} fill="none" opacity={0.8} />
            <path d="M24,62 C36,70 50,60 62,68 C70,72 76,66 78,58" stroke={p.accent} strokeWidth={4} fill="none" opacity={0.7} />
            <ellipse cx={50} cy={50} rx={40} ry={9} fill="none" stroke={p.glow} strokeWidth={2} transform="rotate(-18 50 50)" />
          </g>
        );
      case 'gear':
        return (
          <g>
            {[0, 1].map((k) => {
              const cx = k === 0 ? 40 : 66;
              const cy = k === 0 ? 50 : 64;
              const r = k === 0 ? 20 : 13;
              return (
                <g key={k}>
                  {Array.from({ length: 8 }, (_, i) => (
                    <rect key={i} x={cx - 3} y={cy - r - 5} width={6} height={10} fill={p.main} transform={`rotate(${i * 45} ${cx} ${cy})`} />
                  ))}
                  <circle cx={cx} cy={cy} r={r} fill={p.main} stroke="#0007" strokeWidth={0.8} />
                  <circle cx={cx} cy={cy} r={r * 0.4} fill={p.accent} />
                </g>
              );
            })}
            <circle cx={40} cy={50} r={4} fill={p.glow} />
          </g>
        );
      case 'horn':
        return (
          <g>
            <path d="M20,60 C34,54 48,52 60,40 C68,32 74,30 84,32 C78,44 72,54 60,62 C48,70 34,74 20,68Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <ellipse cx={84} cy={32} rx={6} ry={9} fill={p.accent} transform="rotate(30 84 32)" />
            <path d="M20,60 q-6,4 0,8" stroke={p.accent} strokeWidth={3} fill="none" />
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M${88 + i * 4},${24 - i * 4} q6,-4 8,-8`} stroke={p.glow} strokeWidth={2} fill="none" opacity={0.7 - i * 0.2} />
            ))}
          </g>
        );
      case 'pot':
        return (
          <g>
            <path d="M32,36 C30,20 70,20 68,36 L76,74 C78,84 22,84 24,74Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <ellipse cx={50} cy={34} rx={18} ry={6} fill={p.accent} />
            <ellipse cx={50} cy={34} rx={11} ry={3.5} fill="#0b0d14" />
            <circle cx={42} cy={54} r={4} fill={p.glow} opacity={0.9} />
            <circle cx={58} cy={60} r={3} fill={p.glow} opacity={0.9} />
            <path d="M40,66 q10,4 20,0" stroke={p.glow} strokeWidth={2} fill="none" />
          </g>
        );
      case 'golem':
        return (
          <g>
            <rect x={34} y={24} width={32} height={26} rx={6} fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <rect x={26} y={50} width={48} height={30} rx={6} fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <rect x={14} y={52} width={12} height={26} rx={4} fill={p.accent} />
            <rect x={74} y={52} width={12} height={26} rx={4} fill={p.accent} />
            <rect x={30} y={80} width={14} height={12} rx={3} fill={p.accent} />
            <rect x={56} y={80} width={14} height={12} rx={3} fill={p.accent} />
            <rect x={40} y={32} width={8} height={5} fill={p.glow} />
            <rect x={52} y={32} width={8} height={5} fill={p.glow} />
          </g>
        );
      case 'zone':
        return (
          <g>
            <path d="M14,70 L36,30 L64,30 L86,70Z" fill={p.main} opacity={0.85} stroke={p.accent} strokeWidth={2} />
            {[38, 50, 62].map((x) => (
              <path key={x} d={`M${x - 6},70 L${x},30 L${x + 6},70`} stroke={p.accent} strokeWidth={1} fill="none" opacity={0.5} />
            ))}
            <path d="M30,50 L70,50" stroke={p.glow} strokeWidth={2} strokeDasharray="4 3" />
            <circle cx={50} cy={22} r={5} fill={p.glow} />
          </g>
        );
      case 'crown':
        return (
          <g>
            <path d="M22,72 L18,30 L36,50 L50,22 L64,50 L82,30 L78,72Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <rect x={22} y={70} width={56} height={12} fill={p.accent} />
            <circle cx={50} cy={22} r={4} fill={p.glow} />
            <circle cx={18} cy={30} r={3} fill={p.glow} />
            <circle cx={82} cy={30} r={3} fill={p.glow} />
            {[34, 50, 66].map((x) => (
              <circle key={x} cx={x} cy={76} r={2.5} fill={p.glow} />
            ))}
          </g>
        );
      case 'fist':
        return (
          <g>
            <path d="M30,88 L30,54 C30,42 40,36 52,38 L70,42 L70,66 C70,80 60,88 48,88Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            {[46, 56, 66].map((y) => (
              <path key={y} d={`M32,${y} L68,${y}`} stroke="#0007" strokeWidth={0.8} />
            ))}
            <path d="M30,60 L18,54 L20,44 L32,50" fill={p.accent} stroke="#0007" strokeWidth={0.6} />
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M${60 + i * 8},${26 - i * 4} L${64 + i * 8},${14 - i * 4}`} stroke={p.glow} strokeWidth={2.5} strokeLinecap="round" />
            ))}
          </g>
        );
      case 'roots':
        return (
          <g>
            <rect x={44} y={10} width={12} height={40} rx={4} fill={p.accent} />
            <path d="M50,50 C40,60 30,64 20,80 M50,50 C54,64 62,70 74,84 M50,50 C48,66 42,76 36,90 M50,50 C58,60 64,64 84,66" stroke={p.main} strokeWidth={5} fill="none" strokeLinecap="round" />
            <path d="M30,68 C26,72 24,74 18,72 M66,74 C72,76 74,78 80,76" stroke={p.main} strokeWidth={3} fill="none" strokeLinecap="round" />
            <circle cx={50} cy={52} r={5} fill={p.glow} />
          </g>
        );
      case 'swords':
        return (
          <g>
            {[-22, 0, 22].map((dx, i) => (
              <g key={i} transform={`translate(${50 + dx} 50) rotate(${(i - 1) * 18})`}>
                <rect x={-3} y={-36} width={6} height={52} fill="#e8edf5" stroke="#0006" strokeWidth={0.6} />
                <rect x={-9} y={16} width={18} height={4} fill={p.accent} />
                <rect x={-2.5} y={20} width={5} height={14} fill={p.main} />
              </g>
            ))}
            <circle cx={50} cy={20} r={12} fill={p.glow} opacity={0.4} />
          </g>
        );
      case 'ankh':
        return (
          <g>
            <ellipse cx={50} cy={32} rx={12} ry={16} fill="none" stroke={p.main} strokeWidth={8} />
            <rect x={46} y={44} width={8} height={40} fill={p.main} />
            <rect x={30} y={50} width={40} height={8} fill={p.main} />
            <ellipse cx={50} cy={32} rx={5} ry={8} fill={p.accent} opacity={0.6} />
          </g>
        );
      case 'shrine':
        return (
          <g>
            <path d="M20,40 L50,18 L80,40Z" fill={p.main} />
            <rect x={26} y={40} width={48} height={5} fill={p.accent} />
            <rect x={30} y={45} width={8} height={36} fill={p.main} />
            <rect x={62} y={45} width={8} height={36} fill={p.main} />
            <rect x={22} y={81} width={56} height={6} fill={p.accent} />
            <path d="M42,70 C44,58 56,58 58,70 L54,64 L50,72 L46,64Z" fill={p.glow} />
          </g>
        );
      case 'cry':
        return (
          <g>
            <path d="M22,54 L50,34 L70,40 L64,52 L44,58 L30,64Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <path d="M38,38 L34,22 L46,36Z M50,34 L52,20 L58,36Z" fill={p.accent} />
            <circle cx={56} cy={44} r={2.4} fill={p.accent} />
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M${66 + i * 8},${34 - i * 4} A${10 + i * 8},${10 + i * 8} 0 0 1 ${66 + i * 8},${62 + i * 4}`} stroke={p.glow} strokeWidth={2.5} fill="none" opacity={0.9 - i * 0.25} />
            ))}
          </g>
        );
      case 'burst':
        return (
          <g>
            {Array.from({ length: 10 }).map((_, i) => (
              <path key={i} d="M50,50 L96,44 L96,56Z" fill={i % 2 ? p.accent : p.main} opacity={0.85} transform={`rotate(${i * 36} 50 50)`} />
            ))}
            <circle cx={50} cy={50} r={16} fill="#fff" />
            <circle cx={50} cy={50} r={10} fill={p.glow} />
          </g>
        );
      case 'stomp':
        return (
          <g>
            <ellipse cx={50} cy={64} rx={22} ry={16} fill={p.main} />
            {[-18, -6, 6, 18].map((dx, i) => (
              <ellipse key={i} cx={50 + dx} cy={40 - (i === 1 || i === 2 ? 6 : 0)} rx={6} ry={9} fill={p.main} />
            ))}
            {[-18, -6, 6, 18].map((dx, i) => (
              <path key={i} d={`M${50 + dx},${30 - (i === 1 || i === 2 ? 6 : 0)} L${48 + dx},${16 - (i === 1 || i === 2 ? 6 : 0)} L${52 + dx},${28 - (i === 1 || i === 2 ? 6 : 0)}Z`} fill={p.accent} />
            ))}
            <path d="M18,84 L30,74 M82,84 L70,74 M50,90 L50,82" stroke={p.glow} strokeWidth={2.5} strokeLinecap="round" />
          </g>
        );
      case 'wings':
        return (
          <g>
            <path d="M50,52 C40,26 22,16 8,20 C16,24 18,30 14,36 C22,34 28,36 30,42 C24,46 22,52 26,58 C34,54 42,54 50,60Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <path d="M50,52 C60,26 78,16 92,20 C84,24 82,30 86,36 C78,34 72,36 70,42 C76,46 78,52 74,58 C66,54 58,54 50,60Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <path d="M20,74 C34,70 44,76 58,70 M30,84 C44,80 54,86 68,80" stroke={p.glow} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          </g>
        );
      case 'cards':
        return (
          <g>
            <rect x={22} y={26} width={30} height={42} rx={3} fill={p.main} stroke="#0007" strokeWidth={0.8} transform="rotate(-12 37 47)" />
            <rect x={48} y={30} width={30} height={42} rx={3} fill={p.accent} stroke="#0007" strokeWidth={0.8} transform="rotate(10 63 51)" />
            <path d="M28,84 L46,84 L42,78 M72,84 L54,84 L58,90" stroke={p.glow} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          </g>
        );
      case 'tactics':
        return (
          <g>
            <path d="M34,84 L66,84 L62,72 L38,72Z" fill={p.accent} />
            <path d="M40,72 C40,56 46,52 44,40 C48,30 60,26 66,34 C64,42 60,44 60,52 L62,72Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <circle cx={58} cy={36} r={1.8} fill={p.glow} />
            <path d="M14,24 L26,18 L26,40 Z M86,24 L74,18 L74,40Z" fill={p.accent} opacity={0.8} />
          </g>
        );
      case 'soul':
        return (
          <g>
            <path d="M50,20 C70,20 78,40 66,54 C58,62 50,58 50,66 C50,58 42,62 34,54 C22,40 30,20 50,20Z" fill={p.main} opacity={0.85} />
            <path d="M50,66 C56,74 62,80 56,88 C52,84 48,84 44,88 C38,80 44,74 50,66Z" fill={p.accent} opacity={0.8} />
            <circle cx={44} cy={38} r={2.5} fill={p.glow} />
            <circle cx={56} cy={38} r={2.5} fill={p.glow} />
          </g>
        );
      case 'controller':
        return (
          <g>
            <rect x={16} y={36} width={68} height={32} rx={14} fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <rect x={28} y={46} width={14} height={4} fill={p.accent} />
            <rect x={33} y={41} width={4} height={14} fill={p.accent} />
            <circle cx={64} cy={46} r={3} fill={p.glow} />
            <circle cx={72} cy={52} r={3} fill={p.glow} />
            <circle cx={56} cy={52} r={3} fill={p.accent} />
            <circle cx={64} cy={58} r={3} fill={p.accent} />
          </g>
        );
      case 'castle':
        return (
          <g>
            <rect x={20} y={46} width={60} height={40} fill={p.main} stroke="#0007" strokeWidth={0.8} />
            {[20, 44, 68].map((x) => (
              <rect key={x} x={x} y={30} width={12} height={20} fill={p.main} stroke="#0007" strokeWidth={0.8} />
            ))}
            {[22, 46, 70].map((x) => (
              <rect key={x} x={x} y={24} width={8} height={8} fill={p.accent} />
            ))}
            <path d="M44,86 L44,66 A6,6 0 0 1 56,66 L56,86Z" fill={p.accent} />
            <circle cx={50} cy={16} r={8} fill={p.glow} opacity={0.5} />
          </g>
        );
      case 'chain':
        return (
          <g>
            {[0, 1, 2, 3, 4].map((i) => (
              <ellipse key={i} cx={22 + i * 14} cy={30 + i * 10} rx={8} ry={5} fill="none" stroke={p.accent} strokeWidth={3} transform={`rotate(35 ${22 + i * 14} ${30 + i * 10})`} />
            ))}
            <path d="M74,72 L90,88 M62,66 L74,72 L70,84Z" stroke={p.main} strokeWidth={4} fill={p.main} strokeLinejoin="round" />
            <circle cx={90} cy={88} r={4} fill={p.glow} />
          </g>
        );
      case 'condenser':
        return (
          <g>
            <rect x={30} y={30} width={40} height={50} rx={6} fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <rect x={42} y={22} width={16} height={8} rx={2} fill={p.accent} />
            <polyline points="54,38 46,54 54,54 46,72" stroke={p.glow} strokeWidth={4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      case 'tomb':
        return (
          <g>
            <path d="M32,88 L32,40 A18,18 0 0 1 68,40 L68,88Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <rect x={44} y={46} width={12} height={4} fill={p.accent} />
            <rect x={48} y={42} width={4} height={14} fill={p.accent} />
            <path d="M14,88 C20,80 24,70 20,60 M22,66 L26,56 M18,60 L14,50" stroke={p.glow} strokeWidth={3} fill="none" strokeLinecap="round" />
            <ellipse cx={50} cy={90} rx={36} ry={4} fill={p.accent} opacity={0.5} />
          </g>
        );
      case 'ejector':
        return (
          <g>
            <rect x={26} y={60} width={48} height={24} rx={4} fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <rect x={36} y={50} width={28} height={10} fill={p.accent} />
            <path d="M50,44 L50,14 M36,28 L50,12 L64,28" stroke={p.glow} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      case 'shield':
        return (
          <g>
            <path d="M50,14 L80,26 C80,54 70,76 50,88 C30,76 20,54 20,26Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <path d="M50,22 L72,31 C72,52 64,68 50,78 C36,68 28,52 28,31Z" fill={p.accent} opacity={0.6} />
            <path d="M38,56 L42,42 L50,50 L58,42 L62,56Z" fill={p.glow} />
          </g>
        );
      case 'crystal':
        return <Cluster p={p} />;
      case 'beacon':
        return (
          <g>
            {[-30, -15, 0, 15, 30].map((a) => (
              <path key={a} d="M50,44 L50,4" stroke={p.glow} strokeWidth={2.5} strokeLinecap="round" transform={`rotate(${a} 50 44)`} opacity={0.8} />
            ))}
            <Gem x={50} y={54} r={16} color={p.main} />
            <rect x={38} y={70} width={24} height={16} fill={p.accent} />
          </g>
        );
      case 'tree':
        return (
          <g>
            <rect x={46} y={56} width={8} height={32} fill="#7a4b2a" />
            <path d="M50,58 C40,52 34,46 30,36 M50,52 C58,46 64,40 68,30 M50,46 C46,40 44,32 44,24" stroke="#7a4b2a" strokeWidth={4} fill="none" strokeLinecap="round" />
            <Gem x={30} y={30} r={6} color={p.main} />
            <Gem x={68} y={26} r={6} color={p.accent} />
            <Gem x={44} y={18} r={6} color={p.glow} />
            <Gem x={58} y={44} r={5} color={p.main} />
          </g>
        );
      case 'release':
        return (
          <g>
            <Gem x={50} y={50} r={16} color={p.main} />
            {[0, 1].map((i) => (
              <ellipse key={i} cx={20 + i * 60} cy={50} rx={9} ry={5} fill="none" stroke={p.accent} strokeWidth={3} />
            ))}
            <path d="M28,50 L34,50 M66,50 L72,50" stroke={p.accent} strokeWidth={3} />
            <path d="M22,34 L18,26 M78,34 L82,26 M22,66 L18,74 M78,66 L82,74" stroke={p.glow} strokeWidth={2} strokeLinecap="round" />
          </g>
        );
      case 'abundance':
        return <Cluster p={p} n={5} />;
      case 'blessing':
        return (
          <g>
            <ellipse cx={50} cy={22} rx={18} ry={5} fill="none" stroke={p.glow} strokeWidth={3} />
            <Gem x={50} y={56} r={18} color={p.main} />
            <path d="M22,80 C34,72 66,72 78,80" stroke={p.accent} strokeWidth={3} fill="none" strokeLinecap="round" />
          </g>
        );
      case 'miracle':
        return (
          <g>
            <path d="M50,10 L58,40 L90,40 L64,58 L74,88 L50,70 L26,88 L36,58 L10,40 L42,40Z" fill={p.glow} opacity={0.9} />
            <Gem x={50} y={52} r={12} color={p.main} />
          </g>
        );
      case 'brilliance':
        return (
          <g>
            {Array.from({ length: 12 }).map((_, i) => (
              <path key={i} d="M50,50 L50,6" stroke={i % 2 ? p.accent : p.glow} strokeWidth={2} strokeLinecap="round" transform={`rotate(${i * 30} 50 50)`} />
            ))}
            <Gem x={50} y={50} r={15} color={p.main} />
          </g>
        );
      case 'pair':
        return (
          <g>
            <Gem x={34} y={52} r={14} color={p.main} />
            <Gem x={66} y={52} r={14} color={p.accent} />
            <path d="M44,76 C48,84 52,84 56,76" stroke={p.glow} strokeWidth={3} fill="none" strokeLinecap="round" />
          </g>
        );
      case 'conclave':
        return (
          <g>
            <circle cx={50} cy={52} r={28} fill="none" stroke={p.accent} strokeWidth={2} strokeDasharray="4 3" />
            {Array.from({ length: 6 }).map((_, i) => {
              const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
              return <Gem key={i} x={50 + Math.cos(a) * 28} y={52 + Math.sin(a) * 28} r={6} color={i % 2 ? p.main : p.glow} />;
            })}
            <Gem x={50} y={52} r={8} color={p.main} />
          </g>
        );
      case 'aegis':
        return (
          <g>
            <path d="M50,14 L80,26 C80,54 70,76 50,88 C30,76 20,54 20,26Z" fill={p.accent} stroke="#0007" strokeWidth={0.8} />
            <Gem x={50} y={48} r={14} color={p.main} />
          </g>
        );
      case 'bond':
        return (
          <g>
            <Gem x={30} y={40} r={12} color={p.main} />
            <Gem x={70} y={64} r={12} color={p.accent} />
            <path d="M38,46 C50,50 50,54 62,58" stroke={p.glow} strokeWidth={4} fill="none" strokeLinecap="round" />
            <path d="M42,52 C50,52 50,52 58,52" stroke="#fff" strokeWidth={1.5} fill="none" opacity={0.6} />
          </g>
        );
      case 'wand':
        return (
          <g>
            <path d="M24,84 L66,32" stroke="#c9a23f" strokeWidth={4} strokeLinecap="round" />
            <Gem x={70} y={26} r={10} color={p.main} />
            {[[84, 16], [88, 40], [56, 14]].map(([x, y], i) => (
              <path key={i} d={`M${x},${y - 5} L${x},${y + 5} M${x - 5},${y} L${x + 5},${y}`} stroke={p.glow} strokeWidth={2} strokeLinecap="round" />
            ))}
          </g>
        );
      case 'boon':
        return (
          <g>
            <rect x={24} y={44} width={52} height={40} fill={p.accent} stroke="#0007" strokeWidth={0.8} />
            <rect x={20} y={36} width={60} height={12} fill={p.main} />
            <rect x={46} y={36} width={8} height={48} fill={p.glow} />
            <Gem x={50} y={26} r={9} color={p.main} />
          </g>
        );
      case 'promise':
        return (
          <g>
            <path d="M14,60 C26,44 38,44 50,56 C62,44 74,44 86,60" stroke={p.accent} strokeWidth={8} fill="none" strokeLinecap="round" />
            <Gem x={50} y={44} r={11} color={p.main} />
            <circle cx={50} cy={72} r={5} fill={p.glow} />
          </g>
        );
      case 'counter':
        return (
          <g>
            <Gem x={50} y={50} r={20} color={p.main} />
            {[[22, 24], [78, 24], [22, 76], [78, 76]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={7} fill={p.accent} stroke="#fff" strokeWidth={1} />
            ))}
          </g>
        );
      case 'prism':
        return (
          <g>
            <path d="M50,18 L80,72 L20,72Z" fill={p.main} opacity={0.85} stroke="#fff" strokeWidth={1} strokeOpacity={0.5} />
            <path d="M8,50 L36,50" stroke="#fff" strokeWidth={2.5} />
            {['#ff4d6d', '#ff9f1c', '#ffe066', '#3ee3b6', '#4cc9f0', '#b388ff'].map((c, i) => (
              <path key={c} d={`M62,50 L94,${34 + i * 6}`} stroke={c} strokeWidth={2.5} />
            ))}
          </g>
        );
      case 'bridge':
        return (
          <g>
            <RainbowArc cx={50} cy={70} r={40} w={4} />
            <path d="M6,76 C20,70 36,80 50,76 C64,72 80,82 94,76" stroke={p.accent} strokeWidth={3} fill="none" />
          </g>
        );
      case 'heartbridge':
        return (
          <g>
            <RainbowArc cx={50} cy={72} r={40} w={4} />
            <path d="M50,64 C42,52 30,56 32,66 C34,74 44,78 50,86 C56,78 66,74 68,66 C70,56 58,52 50,64Z" fill={p.main} stroke="#fff" strokeWidth={1} />
          </g>
        );
      case 'ruins':
        return (
          <g>
            <RainbowArc cx={50} cy={60} r={42} w={3} />
            {[22, 40, 60, 78].map((x, i) => (
              <rect key={x} x={x - 5} y={50 + (i % 2) * 10} width={10} height={40 - (i % 2) * 10} fill={p.main} stroke="#0007" strokeWidth={0.8} />
            ))}
            <rect x={14} y={88} width={72} height={4} fill={p.accent} />
          </g>
        );
      case 'darkOrb':
        return (
          <g>
            <circle cx={50} cy={50} r={30} fill={p.accent} opacity={0.35} />
            <circle cx={50} cy={50} r={20} fill={p.main} />
            <circle cx={44} cy={44} r={5} fill="#fff" opacity={0.25} />
            {[0, 1, 2].map((i) => (
              <ellipse key={i} cx={50} cy={50} rx={36} ry={8} fill="none" stroke={p.glow} strokeWidth={1.5} transform={`rotate(${-30 + i * 40} 50 50)`} opacity={0.7} />
            ))}
          </g>
        );
      case 'awakening':
        return (
          <g>
            <path d="M50,88 C50,70 44,62 52,50 C58,42 64,40 70,30 C62,36 58,44 52,46 C48,36 40,30 30,26 C40,34 46,44 44,56 C38,60 34,66 34,76Z" fill={p.main} opacity={0.9} />
            <Gem x={22} y={82} r={7} color={p.accent} />
            <Gem x={78} y={78} r={7} color={p.glow} />
            <Gem x={80} y={50} r={5} color={p.accent} />
            <circle cx={68} cy={30} r={3} fill={p.glow} />
          </g>
        );
      case 'ferret':
        return (
          <g>
            <path d="M22,70 C20,56 32,50 44,54 C56,58 70,52 80,60 C86,64 84,72 76,72 L30,74Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <circle cx={22} cy={64} r={8} fill={p.main} />
            <circle cx={19} cy={62} r={1.6} fill={p.glow} />
            {[36, 52, 68].map((x, i) => (
              <path key={x} d={`M${x},52 C${x + 4},42 ${x + 2},34 ${x - 2},28 C${x - 6},36 ${x - 8},44 ${x - 4},52Z`} fill={i % 2 ? p.accent : p.glow} />
            ))}
          </g>
        );
      case 'globe':
        return (
          <g>
            <circle cx={50} cy={50} r={32} fill={p.main} opacity={0.5} stroke={p.accent} strokeWidth={2} />
            <ellipse cx={50} cy={50} rx={14} ry={32} fill="none" stroke={p.accent} strokeWidth={1.5} />
            <path d="M18,50 L82,50 M24,34 L76,34 M24,66 L76,66" stroke={p.accent} strokeWidth={1.5} />
            <circle cx={50} cy={50} r={6} fill={p.glow} />
          </g>
        );
      case 'cyclone':
        return (
          <g>
            <path d="M50,50 C60,40 74,44 74,56 C74,70 56,76 44,68 C30,60 32,40 48,32 C64,24 86,34 86,54" stroke={p.main} strokeWidth={5} fill="none" strokeLinecap="round" />
            <path d="M50,50 C42,42 30,46 30,56 C30,66 42,72 50,64" stroke={p.accent} strokeWidth={4} fill="none" strokeLinecap="round" />
            <circle cx={50} cy={50} r={4} fill={p.glow} />
            {[[16, 22], [84, 80], [20, 78]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={2} fill={p.glow} />
            ))}
          </g>
        );
      case 'shovel':
        return (
          <g>
            <path d="M28,20 L64,56" stroke="#7a4b2a" strokeWidth={5} strokeLinecap="round" />
            <path d="M60,52 L84,60 L76,84 L52,76Z" fill={p.main} stroke="#0007" strokeWidth={0.8} />
            <rect x={14} y={54} width={26} height={34} rx={3} fill={p.accent} stroke="#0007" strokeWidth={0.8} transform="rotate(-8 27 71)" />
            <ellipse cx={50} cy={90} rx={40} ry={4} fill={p.glow} opacity={0.4} />
          </g>
        );
      case 'melody':
        return (
          <g>
            <path d="M40,24 L40,68 M40,24 L66,18 L66,62" stroke={p.main} strokeWidth={4} fill="none" strokeLinecap="round" />
            <ellipse cx={32} cy={70} rx={9} ry={6} fill={p.main} />
            <ellipse cx={58} cy={64} rx={9} ry={6} fill={p.main} />
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M${72 + i * 6},${40 - i * 6} A${8 + i * 6},${8 + i * 6} 0 0 1 ${72 + i * 6},${60 + i * 6}`} stroke={p.glow} strokeWidth={2} fill="none" opacity={0.9 - i * 0.25} />
            ))}
          </g>
        );
      case 'value':
        return (
          <g>
            <Gem x={50} y={40} r={18} color={p.main} />
            {[30, 50, 70].map((x, i) => (
              <ellipse key={x} cx={x} cy={76 - (i === 1 ? 4 : 0)} rx={11} ry={5} fill={p.accent} stroke="#0007" strokeWidth={0.8} />
            ))}
          </g>
        );
      case 'fiendish':
        return (
          <g>
            <path d="M50,26 C66,26 74,40 70,54 C68,66 58,74 50,80 C42,74 32,66 30,54 C26,40 34,26 50,26Z" fill={p.main} opacity={0.9} />
            {[0, 1, 2, 3].map((i) => (
              <ellipse key={i} cx={24 + i * 17} cy={54} rx={9} ry={5} fill="none" stroke={p.accent} strokeWidth={3} />
            ))}
            <circle cx={44} cy={44} r={2.5} fill={p.glow} />
            <circle cx={56} cy={44} r={2.5} fill={p.glow} />
          </g>
        );
    }
  })();
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-m`} cx="35%" cy="30%" r="85%">
          <stop offset="0%" stopColor={shade(raw.main, 1.3)} />
          <stop offset="55%" stopColor={raw.main} />
          <stop offset="100%" stopColor={shade(raw.main, 0.5)} />
        </radialGradient>
        <radialGradient id={`${id}-a`} cx="35%" cy="30%" r="85%">
          <stop offset="0%" stopColor={shade(raw.accent, 1.25)} />
          <stop offset="60%" stopColor={raw.accent} />
          <stop offset="100%" stopColor={shade(raw.accent, 0.5)} />
        </radialGradient>
        <radialGradient id={`${id}-bg`} cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor={shade(raw.glow, 0.45)} />
          <stop offset="100%" stopColor="#07090f" />
        </radialGradient>
        <filter id={`${id}-sh`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#000" floodOpacity="0.6" />
        </filter>
      </defs>
      {backdrop && <rect x={0} y={0} width={100} height={100} fill={`url(#${id}-bg)`} />}
      <circle cx={50} cy={50} r={38} fill="none" stroke={raw.glow} strokeWidth={0.8} opacity={0.35} strokeDasharray="2 3" />
      <circle cx={50} cy={50} r={40} fill={raw.glow} opacity={backdrop ? 0.12 : 0.28} />
      <g filter={`url(#${id}-sh)`}>{body}</g>
    </g>
  );
}
