/**
 * Emblems for Spell and Trap Cards: one recognisable motif per card, drawn with SVG primitives.
 */
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
  | 'fiendish';

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

export function Motif({ kind, p }: { kind: MotifKind; p: MotifPalette }) {
  const body = (() => {
    switch (kind) {
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
      <circle cx={50} cy={50} r={40} fill={p.glow} opacity={0.18} />
      {body}
    </g>
  );
}
