/**
 * Stylised creature illustrations drawn with SVG primitives. Every monster in the supported decks maps
 * to an archetype (dragon, feline, tortoise ...) with its own palette and features. No card artwork is used.
 */
import type { ReactNode } from 'react';

export interface Palette {
  body: string;
  belly: string;
  accent: string;
  eye: string;
  glow: string;
}

export type Archetype =
  | 'dragon'
  | 'feline'
  | 'tortoise'
  | 'bird'
  | 'pegasus'
  | 'mammoth'
  | 'carbuncle'
  | 'angel'
  | 'warrior'
  | 'mage'
  | 'serpent'
  | 'insect'
  | 'ghost'
  | 'titan'
  | 'stone';

export interface CreatureSpec {
  archetype: Archetype;
  palette: Palette;
  /** Feature flags: rainbow wings, crystal gem, stripes, horns, ears, rider, fire, crystals, portal, storm, halo... */
  features?: string[];
}

let gradientCounter = 0;

function Gem({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g>
      <polygon points={`${x},${y - r} ${x + r * 0.8},${y} ${x},${y + r} ${x - r * 0.8},${y}`} fill={color} stroke="#fff" strokeWidth={0.6} strokeOpacity={0.8} />
      <polygon points={`${x},${y - r} ${x + r * 0.8},${y} ${x},${y}`} fill="#fff" fillOpacity={0.45} />
    </g>
  );
}

function Rainbow({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#ff4d6d" />
      <stop offset="20%" stopColor="#ff9f1c" />
      <stop offset="40%" stopColor="#ffe066" />
      <stop offset="60%" stopColor="#3ee3b6" />
      <stop offset="80%" stopColor="#4cc9f0" />
      <stop offset="100%" stopColor="#b388ff" />
    </linearGradient>
  );
}

function Fire({ x, y, s = 1, color = '#ff9f1c' }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0,-14 C5,-8 8,-4 6,2 C5,6 2,8 0,8 C-3,8 -6,5 -6,1 C-6,-3 -3,-6 -1,-9 C0,-7 1,-6 2,-5 C2,-8 1,-11 0,-14Z" fill={color} />
      <path d="M0,-6 C2,-3 3,-1 2,2 C1,4 0,5 0,5 C-2,5 -3,3 -3,1 C-3,-1 -2,-3 0,-6Z" fill="#fff3b0" />
    </g>
  );
}

function Wing({ side, color, spread = 1, pattern }: { side: 'L' | 'R'; color: string; spread?: number; pattern?: string }) {
  const sx = side === 'L' ? -1 : 1;
  const d = `M0,0 C${12 * spread},-22 ${30 * spread},-30 ${46 * spread},-26 C${40 * spread},-18 ${38 * spread},-12 ${44 * spread},-6 C${36 * spread},-4 ${30 * spread},0 ${34 * spread},6 C${26 * spread},6 ${18 * spread},8 ${16 * spread},14 C${10 * spread},8 ${4 * spread},6 0,4Z`;
  return (
    <g transform={`scale(${sx} 1)`}>
      <path d={d} fill={pattern ? `url(#${pattern})` : color} stroke="#0008" strokeWidth={0.8} />
      <path d={`M0,0 L${46 * spread},-26 M0,0 L${44 * spread},-6 M0,0 L${34 * spread},6`} stroke="#0006" strokeWidth={1} fill="none" />
    </g>
  );
}

function Dragon({ p, f }: { p: Palette; f: Set<string> }) {
  const gid = `rb${gradientCounter++}`;
  const rainbow = f.has('rainbow');
  return (
    <g>
      <defs>{rainbow && <Rainbow id={gid} />}</defs>
      <g transform="translate(46 44)">
        <Wing side="L" color={p.accent} pattern={rainbow ? gid : undefined} />
        <Wing side="R" color={p.accent} pattern={rainbow ? gid : undefined} />
      </g>
      {/* tail */}
      <path d="M54,70 C70,72 84,78 92,92" stroke={p.body} strokeWidth={7} fill="none" strokeLinecap="round" />
      <path d="M86,84 L94,88 L90,96Z" fill={p.accent} />
      {/* legs */}
      <ellipse cx={40} cy={78} rx={7} ry={5} fill={p.body} />
      <ellipse cx={60} cy={80} rx={7} ry={5} fill={p.body} />
      {/* body */}
      <ellipse cx={50} cy={64} rx={19} ry={14} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <ellipse cx={50} cy={68} rx={11} ry={8} fill={p.belly} />
      {/* neck + head */}
      <path d="M50,54 C50,42 56,34 64,28" stroke={p.body} strokeWidth={11} fill="none" strokeLinecap="round" />
      <path d="M58,22 L84,27 L80,34 L64,36 L58,32Z" fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M64,36 L80,34 L78,38 L66,39Z" fill={p.belly} />
      {f.has('ears') ? (
        <>
          <ellipse cx={56} cy={12} rx={4} ry={11} fill={p.body} stroke="#0006" strokeWidth={0.6} />
          <ellipse cx={66} cy={12} rx={4} ry={11} fill={p.body} stroke="#0006" strokeWidth={0.6} />
        </>
      ) : (
        <>
          <path d="M60,22 L54,10 L64,20Z" fill={p.accent} />
          <path d="M66,22 L64,9 L71,21Z" fill={p.accent} />
        </>
      )}
      <circle cx={70} cy={28} r={2.6} fill={p.eye} />
      <circle cx={70.6} cy={27.4} r={0.9} fill="#fff" />
      {f.has('crystal') && <Gem x={50} y={60} r={5} color={p.eye} />}
      {f.has('fire') && <Fire x={88} y={30} s={0.9} />}
      {f.has('storm') && (
        <g stroke="#e0e6ff" strokeWidth={1.4} fill="none" strokeLinecap="round">
          <polyline points="20,20 24,28 18,30 23,40" />
          <polyline points="80,60 84,66 79,68 84,78" />
        </g>
      )}
      {f.has('rider') && (
        <g>
          <circle cx={48} cy={44} r={4} fill="#f2c9a0" />
          <path d="M44,48 L52,48 L54,58 L42,58Z" fill={p.accent} />
        </g>
      )}
    </g>
  );
}

function Feline({ p, f }: { p: Palette; f: Set<string> }) {
  return (
    <g>
      <path d="M68,62 C84,60 90,48 84,38" stroke={p.body} strokeWidth={6} fill="none" strokeLinecap="round" />
      <ellipse cx={50} cy={64} rx={24} ry={13} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <ellipse cx={50} cy={70} rx={14} ry={6} fill={p.belly} />
      {[34, 44, 58, 68].map((x) => (
        <rect key={x} x={x - 3.5} y={70} width={7} height={14} rx={3} fill={p.body} />
      ))}
      <circle cx={28} cy={48} r={12} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M18,40 L15,26 L27,36Z" fill={p.body} />
      <path d="M36,38 L41,25 L30,35Z" fill={p.body} />
      <path d="M19,39 L17,30 L25,37Z" fill={p.belly} />
      <path d="M35,38 L39,29 L31,36Z" fill={p.belly} />
      <ellipse cx={26} cy={54} rx={6} ry={4} fill={p.belly} />
      <circle cx={23} cy={46} r={2} fill={p.eye} />
      <circle cx={33} cy={46} r={2} fill={p.eye} />
      {f.has('stripes') && (
        <g stroke={p.accent} strokeWidth={2.4} strokeLinecap="round" fill="none">
          <path d="M42,54 L40,62" />
          <path d="M50,52 L49,60" />
          <path d="M58,53 L58,61" />
          <path d="M66,56 L67,63" />
          <path d="M30,38 L32,42" />
        </g>
      )}
      {f.has('crystal') && <Gem x={28} y={37} r={3.5} color={p.eye} />}
    </g>
  );
}

function Tortoise({ p, f }: { p: Palette; f: Set<string> }) {
  return (
    <g>
      {[26, 40, 60, 74].map((x) => (
        <ellipse key={x} cx={x} cy={78} rx={6} ry={5} fill={p.body} />
      ))}
      <ellipse cx={50} cy={72} rx={30} ry={6} fill={p.body} />
      <path d="M22,70 C22,44 78,44 78,70Z" fill={p.accent} stroke="#0007" strokeWidth={0.8} />
      <g stroke="#0005" strokeWidth={0.8} fill="none">
        <path d="M40,70 L44,58 L56,58 L60,70" />
        <path d="M30,70 L36,62 L44,58 M56,58 L64,62 L70,70" />
        <path d="M44,58 L50,48 L56,58" />
      </g>
      <ellipse cx={82} cy={64} rx={9} ry={6} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <circle cx={86} cy={62} r={1.8} fill={p.eye} />
      {f.has('crystal') && <Gem x={50} y={56} r={5} color={p.eye} />}
    </g>
  );
}

function Bird({ p, f }: { p: Palette; f: Set<string> }) {
  return (
    <g>
      <g transform="translate(50 50)">
        <Wing side="L" color={p.accent} spread={1.05} />
        <Wing side="R" color={p.accent} spread={1.05} />
      </g>
      <path d="M44,74 L50,90 L56,74Z" fill={p.body} />
      <ellipse cx={50} cy={58} rx={11} ry={17} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <ellipse cx={50} cy={62} rx={6} ry={10} fill={p.belly} />
      <circle cx={50} cy={38} r={8} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M50,38 L62,42 L50,45Z" fill="#f5b400" />
      <circle cx={47} cy={36} r={1.8} fill={p.eye} />
      {f.has('crystal') && <Gem x={50} y={56} r={4} color={p.eye} />}
    </g>
  );
}

function Pegasus({ p, f }: { p: Palette; f: Set<string> }) {
  return (
    <g>
      <g transform="translate(50 46)">
        <Wing side="L" color={p.accent} spread={0.9} />
        <Wing side="R" color={p.accent} spread={0.9} />
      </g>
      {[38, 46, 60, 68].map((x, i) => (
        <path key={x} d={`M${x},70 L${x + (i < 2 ? -3 : 3)},90`} stroke={p.body} strokeWidth={5} strokeLinecap="round" />
      ))}
      <ellipse cx={53} cy={62} rx={21} ry={12} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M34,58 C30,48 26,40 24,32" stroke={p.body} strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d="M14,30 L30,26 L34,34 L22,38Z" fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M28,24 C34,30 36,42 36,52" stroke={p.accent} strokeWidth={4} fill="none" strokeLinecap="round" />
      <path d="M74,58 C84,60 88,70 84,80" stroke={p.accent} strokeWidth={4} fill="none" strokeLinecap="round" />
      <circle cx={22} cy={31} r={1.8} fill={p.eye} />
      {f.has('crystal') && <Gem x={28} y={22} r={3.5} color={p.eye} />}
    </g>
  );
}

function Mammoth({ p, f }: { p: Palette; f: Set<string> }) {
  return (
    <g>
      {[34, 46, 60, 72].map((x) => (
        <rect key={x} x={x - 5} y={68} width={10} height={20} rx={4} fill={p.body} />
      ))}
      <ellipse cx={54} cy={56} rx={28} ry={20} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M28,44 C40,34 66,34 80,44" stroke={p.accent} strokeWidth={3} fill="none" />
      <circle cx={26} cy={50} r={14} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <ellipse cx={16} cy={46} rx={5} ry={8} fill={p.accent} />
      <path d="M22,60 C16,68 14,78 20,88" stroke={p.body} strokeWidth={7} fill="none" strokeLinecap="round" />
      <path d="M26,62 C10,64 4,74 8,84" stroke="#f6f1e3" strokeWidth={3.5} fill="none" strokeLinecap="round" />
      <path d="M30,64 C18,70 14,80 18,90" stroke="#f6f1e3" strokeWidth={3.5} fill="none" strokeLinecap="round" />
      <circle cx={23} cy={46} r={2} fill={p.eye} />
      {f.has('crystal') && <Gem x={30} y={38} r={4} color={p.eye} />}
    </g>
  );
}

function Carbuncle({ p, f }: { p: Palette; f: Set<string> }) {
  return (
    <g>
      <circle cx={72} cy={58} r={13} fill={p.accent} stroke="#0006" strokeWidth={0.8} />
      <ellipse cx={50} cy={68} rx={15} ry={10} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      {[42, 50, 58].map((x) => (
        <ellipse key={x} cx={x} cy={78} rx={4} ry={3} fill={p.body} />
      ))}
      <circle cx={42} cy={52} r={11} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <ellipse cx={30} cy={32} rx={5} ry={14} fill={p.body} stroke="#0006" strokeWidth={0.6} transform="rotate(-20 30 32)" />
      <ellipse cx={52} cy={32} rx={5} ry={14} fill={p.body} stroke="#0006" strokeWidth={0.6} transform="rotate(20 52 32)" />
      <ellipse cx={30} cy={33} rx={2.5} ry={9} fill={p.belly} transform="rotate(-20 30 33)" />
      <ellipse cx={52} cy={33} rx={2.5} ry={9} fill={p.belly} transform="rotate(20 52 33)" />
      <circle cx={38} cy={50} r={2.2} fill={p.eye} />
      <circle cx={46} cy={50} r={2.2} fill={p.eye} />
      <ellipse cx={42} cy={56} rx={4} ry={2.5} fill={p.belly} />
      {f.has('crystal') && <Gem x={80} y={48} r={5} color={p.eye} />}
    </g>
  );
}

function Angel({ p, f }: { p: Palette; f: Set<string> }) {
  return (
    <g>
      <g transform="translate(50 44)">
        <Wing side="L" color={p.accent} spread={0.85} />
        <Wing side="R" color={p.accent} spread={0.85} />
      </g>
      <path d="M50,36 L34,88 L66,88Z" fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M50,46 L42,84 L58,84Z" fill={p.belly} />
      <circle cx={50} cy={28} r={8} fill="#f2c9a0" stroke="#0007" strokeWidth={0.6} />
      <path d="M42,26 C44,18 56,18 58,26 C56,22 44,22 42,26Z" fill={p.accent} />
      {f.has('halo') && <ellipse cx={50} cy={16} rx={10} ry={3} fill="none" stroke={p.eye} strokeWidth={2} />}
      <circle cx={47} cy={28} r={1.2} fill={p.eye} />
      <circle cx={53} cy={28} r={1.2} fill={p.eye} />
    </g>
  );
}

function Warrior({ p, f }: { p: Palette; f: Set<string> }) {
  return (
    <g>
      <path d="M34,44 L26,90 L74,90 L66,44Z" fill={p.accent} opacity={0.9} />
      <rect x={38} y={40} width={24} height={30} rx={5} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <rect x={40} y={70} width={8} height={18} rx={3} fill={p.belly} />
      <rect x={52} y={70} width={8} height={18} rx={3} fill={p.belly} />
      <ellipse cx={34} cy={44} rx={7} ry={4} fill={p.belly} />
      <ellipse cx={66} cy={44} rx={7} ry={4} fill={p.belly} />
      <circle cx={50} cy={28} r={9} fill="#f2c9a0" stroke="#0007" strokeWidth={0.6} />
      <path d="M41,26 C42,16 58,16 59,26 L59,22 C56,18 44,18 41,22Z" fill={p.accent} />
      <path d="M70,80 L84,22" stroke="#e8edf5" strokeWidth={3} strokeLinecap="round" />
      <path d="M66,74 L78,78" stroke="#c9a23f" strokeWidth={3} strokeLinecap="round" />
      {f.has('crystals') && (
        <>
          <Gem x={50} y={52} r={5} color={p.eye} />
          <Gem x={22} y={30} r={3} color={p.eye} />
        </>
      )}
      <circle cx={47} cy={28} r={1.2} fill={p.eye} />
      <circle cx={53} cy={28} r={1.2} fill={p.eye} />
    </g>
  );
}

function Mage({ p, f }: { p: Palette; f: Set<string> }) {
  return (
    <g>
      {f.has('portal') && <circle cx={50} cy={50} r={34} fill="none" stroke={p.accent} strokeWidth={3} strokeDasharray="6 4" opacity={0.8} />}
      <path d="M50,26 L30,90 L70,90Z" fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M50,40 L40,86 L60,86Z" fill={p.belly} />
      <path d="M38,30 C40,16 60,16 62,30 L50,24Z" fill={p.accent} />
      <circle cx={50} cy={30} r={7} fill="#f2c9a0" />
      <path d="M22,88 L28,30" stroke="#c9a23f" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={28} cy={26} r={5} fill={p.eye} />
      <circle cx={28} cy={26} r={8} fill={p.eye} opacity={0.3} />
      {f.has('crystals') && (
        <>
          <Gem x={76} y={34} r={5} color={p.eye} />
          <Gem x={82} y={56} r={4} color={p.accent} />
          <Gem x={70} y={72} r={3.5} color={p.eye} />
        </>
      )}
      <circle cx={47.5} cy={30} r={1.1} fill={p.eye} />
      <circle cx={52.5} cy={30} r={1.1} fill={p.eye} />
    </g>
  );
}

function Serpent({ p }: { p: Palette }) {
  return (
    <g>
      <path d="M14,84 C24,60 40,60 50,72 C60,84 76,84 84,64 C90,50 84,36 72,34" stroke={p.body} strokeWidth={12} fill="none" strokeLinecap="round" />
      <path d="M14,84 C24,60 40,60 50,72 C60,84 76,84 84,64 C90,50 84,36 72,34" stroke={p.belly} strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray="3 5" />
      <path d="M30,60 L36,46 L44,60Z M60,78 L66,64 L74,78Z" fill={p.accent} />
      <path d="M70,26 L58,30 L60,40 L74,42 L82,36Z" fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M74,24 L70,12 L80,22Z" fill={p.accent} />
      <circle cx={66} cy={33} r={2} fill={p.eye} />
    </g>
  );
}

function Insect({ p }: { p: Palette }) {
  return (
    <g>
      <ellipse cx={38} cy={56} rx={18} ry={9} fill={p.accent} opacity={0.5} transform="rotate(-25 38 56)" />
      <ellipse cx={62} cy={56} rx={18} ry={9} fill={p.accent} opacity={0.5} transform="rotate(25 62 56)" />
      <g stroke={p.body} strokeWidth={3} strokeLinecap="round" fill="none">
        <path d="M40,60 L22,50 L14,60" />
        <path d="M40,66 L20,70 L12,82" />
        <path d="M60,60 L78,50 L86,60" />
        <path d="M60,66 L80,70 L88,82" />
      </g>
      <ellipse cx={50} cy={70} rx={12} ry={16} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <ellipse cx={50} cy={52} rx={10} ry={9} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <circle cx={50} cy={38} r={7} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M46,32 C40,22 36,20 30,16 M54,32 C60,22 64,20 70,16" stroke={p.body} strokeWidth={2} fill="none" />
      <circle cx={46} cy={37} r={2.2} fill={p.eye} />
      <circle cx={54} cy={37} r={2.2} fill={p.eye} />
    </g>
  );
}

function Ghost({ p, f }: { p: Palette; f: Set<string> }) {
  return (
    <g>
      {f.has('flames') && (
        <>
          <Fire x={22} y={40} s={0.8} color={p.accent} />
          <Fire x={78} y={44} s={0.7} color={p.accent} />
          <Fire x={30} y={74} s={0.6} color={p.accent} />
        </>
      )}
      <path d="M32,40 C32,20 68,20 68,40 L68,80 C62,72 58,86 50,78 C42,86 38,72 32,80Z" fill={p.body} stroke="#0007" strokeWidth={0.8} opacity={0.95} />
      <path d="M36,44 C36,26 64,26 64,44 L64,70 L36,70Z" fill={p.belly} opacity={0.6} />
      <circle cx={50} cy={36} r={7} fill="#f7dcd0" />
      <path d="M40,32 C42,22 58,22 60,32 L58,36 C56,30 44,30 42,36Z" fill={p.accent} />
      <circle cx={47.5} cy={36} r={1.3} fill={p.eye} />
      <circle cx={52.5} cy={36} r={1.3} fill={p.eye} />
    </g>
  );
}

function Titan({ p }: { p: Palette }) {
  return (
    <g>
      <g stroke={p.accent} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="12,10 18,26 10,30 20,48" />
        <polyline points="88,8 82,24 90,28 80,46" />
      </g>
      <path d="M30,88 L34,56 L28,40 L40,34 L60,34 L72,40 L66,56 L70,88Z" fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M28,40 L10,20 L18,44Z M72,40 L90,18 L82,44Z" fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <rect x={42} y={50} width={16} height={22} rx={3} fill={p.belly} />
      <circle cx={50} cy={26} r={10} fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M40,22 L36,10 L46,20Z M60,22 L64,10 L54,20Z" fill={p.accent} />
      <circle cx={46} cy={26} r={2} fill={p.eye} />
      <circle cx={54} cy={26} r={2} fill={p.eye} />
    </g>
  );
}

function Stone({ p }: { p: Palette }) {
  return (
    <g>
      <path d="M30,80 L22,54 L34,34 L60,28 L80,44 L78,70 L60,84Z" fill={p.body} stroke="#0007" strokeWidth={0.8} />
      <path d="M40,60 L50,44 L62,58 L56,74Z" fill={p.belly} opacity={0.6} />
      <path d="M46,40 C52,46 56,54 52,62 C58,60 62,52 60,44" stroke={p.accent} strokeWidth={3} fill="none" strokeLinecap="round" />
      <circle cx={50} cy={50} r={3} fill={p.eye} />
      <circle cx={50} cy={52} r={22} fill={p.glow} opacity={0.18} />
    </g>
  );
}

export function Creature({ spec, children }: { spec: CreatureSpec; children?: ReactNode }) {
  const f = new Set(spec.features ?? []);
  const p = spec.palette;
  const body = (() => {
    switch (spec.archetype) {
      case 'dragon':
        return <Dragon p={p} f={f} />;
      case 'feline':
        return <Feline p={p} f={f} />;
      case 'tortoise':
        return <Tortoise p={p} f={f} />;
      case 'bird':
        return <Bird p={p} f={f} />;
      case 'pegasus':
        return <Pegasus p={p} f={f} />;
      case 'mammoth':
        return <Mammoth p={p} f={f} />;
      case 'carbuncle':
        return <Carbuncle p={p} f={f} />;
      case 'angel':
        return <Angel p={p} f={f} />;
      case 'warrior':
        return <Warrior p={p} f={f} />;
      case 'mage':
        return <Mage p={p} f={f} />;
      case 'serpent':
        return <Serpent p={p} />;
      case 'insect':
        return <Insect p={p} />;
      case 'ghost':
        return <Ghost p={p} f={f} />;
      case 'titan':
        return <Titan p={p} />;
      case 'stone':
        return <Stone p={p} />;
    }
  })();
  return (
    <g>
      <circle cx={50} cy={52} r={40} fill={p.glow} opacity={0.22} />
      {body}
      {children}
    </g>
  );
}
