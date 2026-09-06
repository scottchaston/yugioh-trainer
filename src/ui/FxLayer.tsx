/**
 * Plays visual effects (attacks, activations, destruction, damage...) over the board.
 * Driven purely by the engine's `fx` event stream; never affects the rules.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { getCard } from '../cards';
import type { FxEvent, GameState } from '../engine';
import { CardView } from './CardView';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ActiveFx {
  fx: FxEvent;
  key: number;
  from?: Rect;
  to?: Rect;
  duration: number;
}

const DURATION: Record<FxEvent['type'], number> = {
  attack: 1100,
  activate: 1400,
  destroy: 800,
  damage: 1100,
  heal: 1100,
  summon: 700,
  negate: 900,
  flip: 500,
  bounce: 600,
  banish: 600,
  boost: 900,
  control: 800,
  draw: 300,
  toSpellZone: 900,
};
/** How long to wait before starting the next effect (lets effects overlap slightly). */
const LEAD: Record<FxEvent['type'], number> = {
  attack: 850,
  activate: 1000,
  destroy: 450,
  damage: 350,
  heal: 350,
  summon: 350,
  negate: 500,
  flip: 200,
  bounce: 250,
  banish: 250,
  boost: 350,
  control: 400,
  draw: 100,
  toSpellZone: 500,
};

export function FxLayer({ view, enabled, container }: { view: GameState; enabled: boolean; container: RefObject<HTMLDivElement | null> }) {
  const lastId = useRef(0);
  const prevRects = useRef<Map<string, Rect>>(new Map());
  const [active, setActive] = useState<ActiveFx[]>([]);
  const keyRef = useRef(1);
  const timers = useRef<number[]>([]);

  const snapshot = (): Map<string, Rect> => {
    const map = new Map<string, Rect>();
    const el = container.current;
    if (!el) return map;
    const crect = el.getBoundingClientRect();
    el.querySelectorAll<HTMLElement>('[data-uid]').forEach((node) => {
      const r = node.getBoundingClientRect();
      if (r.width === 0) return;
      map.set(node.dataset['uid']!, { x: r.left - crect.left + el.scrollLeft, y: r.top - crect.top + el.scrollTop, w: r.width, h: r.height });
    });
    el.querySelectorAll<HTMLElement>('[data-lp-player]').forEach((node) => {
      const r = node.getBoundingClientRect();
      map.set(`lp:${node.dataset['lpPlayer']}`, { x: r.left - crect.left + el.scrollLeft, y: r.top - crect.top + el.scrollTop, w: r.width, h: r.height });
    });
    return map;
  };

  useLayoutEffect(() => {
    const maxId = view.fx.length ? view.fx[view.fx.length - 1].id : 0;
    if (maxId < lastId.current) lastId.current = 0; // undo / new game: don't replay old effects
    const fresh = view.fx.filter((f) => f.id > lastId.current);
    lastId.current = maxId;
    const old = prevRects.current;
    const now = snapshot();
    prevRects.current = now;
    if (!enabled || fresh.length === 0 || !container.current) return;
    if (old.size === 0) return; // first render: nothing to animate
    const rectFor = (uid: string, preferOld: boolean): Rect | undefined => (preferOld ? old.get(uid) ?? now.get(uid) : now.get(uid) ?? old.get(uid));
    let offset = 0;
    const scheduled: ActiveFx[] = [];
    for (const fx of fresh) {
      let from: Rect | undefined;
      let to: Rect | undefined;
      switch (fx.type) {
        case 'attack':
          from = rectFor(fx.attacker, true);
          to = fx.target ? rectFor(fx.target, true) : now.get(`lp:${fx.defender}`) ?? old.get(`lp:${fx.defender}`);
          break;
        case 'activate':
          from = rectFor(fx.uid, false);
          break;
        case 'destroy':
        case 'bounce':
        case 'banish':
        case 'negate':
        case 'toSpellZone':
          from = rectFor(fx.uid, true);
          break;
        case 'summon':
        case 'flip':
        case 'boost':
        case 'control':
          from = rectFor(fx.uid, false);
          break;
        case 'damage':
        case 'heal':
          from = now.get(`lp:${fx.player}`) ?? old.get(`lp:${fx.player}`);
          break;
        case 'draw':
          break;
      }
      if (!from && fx.type !== 'activate') continue;
      const entry: ActiveFx = { fx, key: keyRef.current++, from, to, duration: DURATION[fx.type] };
      const start = offset;
      timers.current.push(
        window.setTimeout(() => setActive((a) => [...a, entry]), start),
        window.setTimeout(() => setActive((a) => a.filter((x) => x.key !== entry.key)), start + entry.duration),
      );
      scheduled.push(entry);
      offset += LEAD[fx.type];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  if (!enabled || active.length === 0) return null;
  return (
    <div className="fx-layer" aria-hidden="true">
      {active.map((a) => (
        <Effect key={a.key} entry={a} view={view} />
      ))}
    </div>
  );
}

function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function Effect({ entry, view }: { entry: ActiveFx; view: GameState }) {
  const { fx, from, to } = entry;
  switch (fx.type) {
    case 'attack': {
      if (!from || !to) return null;
      const a = center(from);
      const b = center(to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const len = Math.hypot(dx, dy);
      return (
        <>
          <div className="fx-beam" style={{ left: a.x, top: a.y, width: len, transform: `rotate(${angle}deg)` }} />
          <div className="fx-bolt" style={{ left: a.x, top: a.y, ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px` }} />
          <div className="fx-impact" style={{ left: b.x, top: b.y }} />
          <div className="fx-shake" style={{ left: to.x, top: to.y, width: to.w, height: to.h }} />
        </>
      );
    }
    case 'activate': {
      const c = view.cards[fx.uid];
      if (!c) return null;
      const d = getCard(c.cardId);
      const label = fx.what === 'trap' ? 'TRAP ACTIVATED' : fx.what === 'spell' ? 'SPELL ACTIVATED' : 'MONSTER EFFECT';
      return (
        <>
          {from && <div className={`fx-beacon fx-beacon-${fx.what}`} style={{ left: from.x, top: from.y, width: from.w, height: from.h }} />}
          <div className={`fx-spotlight fx-spot-${fx.what}`}>
            <div className="fx-spot-ring" />
            <CardView def={d} size="lg" />
            <div className="fx-spot-label">
              <span>{label}</span>
              <b>{d.name}</b>
            </div>
          </div>
        </>
      );
    }
    case 'destroy': {
      if (!from) return null;
      const c = center(from);
      return (
        <div className="fx-shatter" style={{ left: c.x, top: c.y }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} style={{ ['--i' as string]: i, ['--rot' as string]: `${i * 36}deg` }} />
          ))}
          <div className="fx-flash" />
        </div>
      );
    }
    case 'damage':
    case 'heal': {
      if (!from) return null;
      return (
        <div className={`fx-lp ${fx.type === 'damage' ? 'fx-lp-damage' : 'fx-lp-heal'}`} style={{ left: from.x + from.w * 0.25, top: from.y }}>
          {fx.type === 'damage' ? '−' : '+'}
          {fx.amount}
        </div>
      );
    }
    case 'summon': {
      if (!from) return null;
      const c = center(from);
      return (
        <>
          <div className={`fx-ring ${fx.method === 'special' ? 'fx-ring-special' : ''}`} style={{ left: c.x, top: c.y }} />
          <div className="fx-column" style={{ left: from.x, top: from.y - 40, width: from.w, height: from.h + 40 }} />
        </>
      );
    }
    case 'negate': {
      if (!from) return null;
      const c = center(from);
      return (
        <div className="fx-negate" style={{ left: c.x, top: c.y }}>
          <span>✕</span>
          <small>NEGATED</small>
        </div>
      );
    }
    case 'boost': {
      if (!from) return null;
      const parts: string[] = [];
      if (fx.atk) parts.push(`${fx.atk > 0 ? '+' : ''}${fx.atk} ATK`);
      if (fx.def) parts.push(`${fx.def > 0 ? '+' : ''}${fx.def} DEF`);
      return (
        <div className={`fx-boost ${fx.atk < 0 || fx.def < 0 ? 'fx-boost-down' : ''}`} style={{ left: from.x + from.w / 2, top: from.y }}>
          {parts.join(' ')}
        </div>
      );
    }
    case 'toSpellZone': {
      if (!from) return null;
      const c = center(from);
      return (
        <div className="fx-crystal" style={{ left: c.x, top: c.y }}>
          <span>◆</span>
          <small>Continuous Spell</small>
        </div>
      );
    }
    case 'control': {
      if (!from) return null;
      const c = center(from);
      return (
        <div className="fx-negate fx-control" style={{ left: c.x, top: c.y }}>
          <span>⇄</span>
          <small>CONTROL</small>
        </div>
      );
    }
    case 'bounce':
    case 'banish':
    case 'flip':
    case 'draw':
    default:
      return null;
  }
}
