/**
 * End-of-Duel overlay: a VICTORY celebration (gold rays, confetti, fanfare) and a DEFEAT
 * sequence (cracked screen, falling shards, a falling sting). On a shared screen the loser's
 * moment plays first, then the winner's; online, each player only sees their own outcome.
 */
import { useEffect, useMemo, useState } from 'react';
import type { GameState, PlayerId } from '../engine';
import { playSound } from './sound';

interface Props {
  view: GameState;
  /** The local seat online; null on a shared screen. */
  me: PlayerId | null;
  animations: boolean;
  online: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onEnd: () => void;
}

const CONFETTI_COLORS = ['#ffd166', '#f0b429', '#fff3b0', '#4cc9f0', '#06d6a0', '#ff5c8a', '#ffffff'];

function Confetti({ count }: { count: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 37 + (i % 7) * 11) % 100,
        delay: ((i * 53) % 100) / 100,
        dur: 2.6 + ((i * 29) % 100) / 60,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + ((i * 13) % 8),
        spin: ((i * 71) % 360),
      })),
    [count],
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: p.color, width: p.size, height: p.size * 1.6, transform: `rotate(${p.spin}deg)` }} />
      ))}
    </div>
  );
}

function Shards({ count }: { count: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 41 + (i % 5) * 9) % 100,
        top: (i * 23) % 60,
        delay: ((i * 31) % 100) / 200,
        size: 14 + ((i * 17) % 22),
        rot: (i * 47) % 360,
      })),
    [count],
  );
  return (
    <div className="shards" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} style={{ left: `${p.left}%`, top: `${p.top}%`, animationDelay: `${p.delay}s`, width: p.size, height: p.size * 1.3, transform: `rotate(${p.rot}deg)` }} />
      ))}
    </div>
  );
}

/** Cracks drawn across the screen for the defeat animation. */
function Cracks() {
  return (
    <svg className="cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <g fill="none" stroke="rgba(255,255,255,.85)" strokeWidth=".35" strokeLinecap="round">
        <path className="crack" d="M50 50 L38 32 L30 28 M38 32 L27 20 L22 4" />
        <path className="crack" d="M50 50 L64 36 L72 33 M64 36 L78 22 L84 6" />
        <path className="crack" d="M50 50 L70 58 L88 56 M70 58 L86 70 L96 78" />
        <path className="crack" d="M50 50 L30 62 L12 60 M30 62 L20 78 L8 92" />
        <path className="crack" d="M50 50 L54 72 L50 88 L56 98 M54 72 L66 84" />
        <path className="crack" d="M50 50 L44 26 L48 8 M44 26 L36 14" />
      </g>
    </svg>
  );
}

export function DuelEnd({ view, me, animations, online, canUndo, onUndo, onEnd }: Props) {
  const winner = view.winner!;
  const loser: PlayerId = winner === 0 ? 1 : 0;
  const localLost = me !== null && me !== winner;
  // Shared screen: defeat first, then victory. Online: only the local outcome.
  const sequence: ('defeat' | 'victory')[] = me === null ? ['defeat', 'victory'] : localLost ? ['defeat'] : ['victory'];
  const [step, setStep] = useState(0);
  const [showButtons, setShowButtons] = useState(!animations);
  const stage = animations ? sequence[Math.min(step, sequence.length - 1)] : sequence[sequence.length - 1];

  useEffect(() => {
    const timers: number[] = [];
    let t = 0;
    sequence.forEach((s, i) => {
      timers.push(window.setTimeout(() => { setStep(i); playSound(s); }, t));
      t += s === 'defeat' ? 2200 : 2600;
    });
    timers.push(window.setTimeout(() => setShowButtons(true), animations ? Math.min(t, 3000) : 0));
    return () => timers.forEach((x) => window.clearTimeout(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = (p: PlayerId) => view.players[p].name;
  const buttons = (
    <div className={`prompt-buttons duel-end-buttons${showButtons ? ' visible' : ''}`}>
      <button className="btn" onClick={onUndo} disabled={!canUndo}>
        {online ? 'Ask to undo the last action' : 'Undo last action'}
      </button>
      <button className="btn btn-primary" onClick={onEnd}>
        {online ? 'Leave the Duel' : 'New Duel'}
      </button>
    </div>
  );

  if (stage === 'defeat') {
    return (
      <div className={`duel-end duel-end-defeat${animations ? ' animated' : ''}`} key="defeat">
        {animations && <Cracks />}
        {animations && <Shards count={36} />}
        <div className="duel-end-card">
          <div className="duel-end-title">DEFEAT</div>
          <div className="duel-end-sub">{name(loser)} has lost the Duel</div>
          <p className="duel-end-reason">{view.winReason}</p>
          {buttons}
        </div>
      </div>
    );
  }
  return (
    <div className={`duel-end duel-end-victory${animations ? ' animated' : ''}`} key="victory">
      {animations && <div className="rays" aria-hidden />}
      {animations && <Confetti count={90} />}
      <div className="duel-end-card">
        <div className="duel-end-crown" aria-hidden>
          <svg viewBox="0 0 64 40">
            <path d="M4 34 L10 10 L22 22 L32 4 L42 22 L54 10 L60 34 Z" fill="#ffd166" stroke="#b7791f" strokeWidth="2" strokeLinejoin="round" />
            <rect x="4" y="32" width="56" height="6" rx="2" fill="#f0b429" stroke="#b7791f" strokeWidth="1.5" />
            <circle cx="32" cy="16" r="3" fill="#ff5c8a" />
            <circle cx="14" cy="20" r="2.2" fill="#4cc9f0" />
            <circle cx="50" cy="20" r="2.2" fill="#06d6a0" />
          </svg>
        </div>
        <div className="duel-end-title">VICTORY</div>
        <div className="duel-end-sub">{name(winner)} wins the Duel!</div>
        <p className="duel-end-reason">{view.winReason}</p>
        {buttons}
      </div>
    </div>
  );
}
