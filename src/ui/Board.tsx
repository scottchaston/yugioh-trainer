import { useEffect, useRef, useState } from 'react';
import { Game, type GameState, type PlayerId, type Prompt, type ZoneRef } from '../engine';
import { CardView } from './CardView';
import { defOf } from './cardDef';

export interface BoardProps {
  view: GameState;
  bottom: PlayerId;
  revealAll: boolean;
  selectedUid: string | null;
  highlightUids: Set<string>;
  prompt: Prompt | null;
  promptSelection: string[];
  onCardClick: (uid: string) => void;
  onZoneClick: (z: ZoneRef) => void;
  onPileClick: (player: PlayerId, pile: 'graveyard' | 'banished' | 'extra' | 'deck') => void;
  animations: boolean;
}

/** Tracks zone changes between renders to drive small animations. */
function useAnimations(view: GameState, enabled: boolean): Record<string, string> {
  const prev = useRef<GameState | null>(null);
  const [anims, setAnims] = useState<Record<string, string>>({});
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p || !enabled) return;
    const next: Record<string, string> = {};
    for (const c of Object.values(view.cards)) {
      const o = p.cards[c.uid];
      if (!o) continue;
      if (o.zone !== c.zone) {
        if (c.zone === 'monster' || c.zone === 'extraMonster') next[c.uid] = 'anim-summon';
        else if (c.zone === 'graveyard') next[c.uid] = 'anim-togy';
        else if (c.zone === 'hand') next[c.uid] = 'anim-draw';
        else if (c.zone === 'spellTrap' || c.zone === 'field') next[c.uid] = 'anim-place';
        else if (c.zone === 'banished') next[c.uid] = 'anim-banish';
      } else if (!o.faceUp && c.faceUp) {
        next[c.uid] = 'anim-flip';
      }
    }
    if (view.battle?.attacker && view.battle.attacker !== p.battle?.attacker) next[view.battle.attacker] = 'anim-attack';
    if (Object.keys(next).length) {
      setAnims(next);
      const t = setTimeout(() => setAnims({}), 900);
      return () => clearTimeout(t);
    }
  }, [view, enabled]);
  return anims;
}

export function Board(props: BoardProps) {
  const { view, bottom, revealAll, selectedUid, highlightUids, prompt, promptSelection, onCardClick, onZoneClick, onPileClick } = props;
  const g = new Game(view);
  const top: PlayerId = bottom === 0 ? 1 : 0;
  const anims = useAnimations(view, props.animations);

  const selectableCards = prompt?.type === 'selectCards' ? new Set(prompt.cards) : null;
  const selectableZones = prompt?.type === 'selectZone' ? prompt.zones : null;
  const zoneSelectable = (z: ZoneRef) => !!selectableZones?.some((x) => x.player === z.player && x.zone === z.zone && x.index === z.index);

  const cardEl = (uid: string, opts: { faceDownOverride?: boolean; size?: 'sm' | 'md' } = {}) => {
    const c = view.cards[uid];
    const faceDown = opts.faceDownOverride ?? (!c.faceUp && !revealAll);
    const stats = c.faceUp && (c.zone === 'monster' || c.zone === 'extraMonster') ? g.stats(uid) : null;
    const inPrompt = selectableCards?.has(uid);
    const dimmed = selectableCards ? !inPrompt : false;
    const badge = c.treatedAsSpell === 'continuous' ? 'Continuous Spell' : c.treatedAsSpell === 'equip' ? 'Equip Spell' : c.treatedAsSpell === 'pendulum' ? 'Pendulum Zone' : c.equippedTo ? 'Equipped' : c.flags['effectsNegated'] ? 'Negated' : c.counters['Crystal Counter'] ? `${c.counters['Crystal Counter']} Crystal Counter${c.counters['Crystal Counter'] > 1 ? 's' : ''}` : undefined;
    return (
      <CardView
        key={uid}
        card={c}
        faceDown={faceDown}
        size={opts.size ?? 'md'}
        stats={stats}
        selected={selectedUid === uid || promptSelection.includes(uid)}
        highlighted={highlightUids.has(uid) || !!inPrompt}
        dimmed={dimmed}
        anim={anims[uid]}
        onClick={() => onCardClick(uid)}
        badge={badge}
        title={faceDown && !revealAll ? 'Face-down card' : undefined}
      />
    );
  };

  const zoneCell = (player: PlayerId, zone: 'monster' | 'spellTrap', index: number) => {
    const pl = view.players[player];
    const uid = zone === 'monster' ? pl.monsterZones[index] : pl.spellTrapZones[index];
    const ref: ZoneRef = { player, zone, index };
    const sel = zoneSelectable(ref);
    const isAttackTarget = view.battle?.target === uid && uid;
    const isAttacker = view.battle?.attacker === uid && uid;
    return (
      <div
        key={`${player}-${zone}-${index}`}
        className={`zone zone-${zone}${sel ? ' zone-selectable' : ''}${isAttackTarget ? ' zone-target' : ''}${isAttacker ? ' zone-attacker' : ''}`}
        onClick={() => (sel ? onZoneClick(ref) : undefined)}
        data-zone-owner={player}
      >
        {uid ? cardEl(uid) : <span className="zone-label">{zone === 'monster' ? 'Monster' : zone === 'spellTrap' && (index === 0 || index === 4) ? 'Spell / Trap (Pendulum)' : 'Spell / Trap'}</span>}
        {sel && <span className="zone-choose">{view.players[player].name}: choose</span>}
      </div>
    );
  };

  const fieldCell = (player: PlayerId) => {
    const uid = view.players[player].fieldZone;
    const ref: ZoneRef = { player, zone: 'field', index: 0 };
    const sel = zoneSelectable(ref);
    return (
      <div className={`zone zone-field${sel ? ' zone-selectable' : ''}`} onClick={() => (sel ? onZoneClick(ref) : undefined)}>
        {uid ? cardEl(uid) : <span className="zone-label">Field</span>}
        {sel && <span className="zone-choose">{view.players[player].name}: choose</span>}
      </div>
    );
  };

  const pile = (player: PlayerId, kind: 'deck' | 'graveyard' | 'banished' | 'extra') => {
    const pl = view.players[player];
    const list = kind === 'deck' ? pl.deck : kind === 'graveyard' ? pl.graveyard : kind === 'banished' ? pl.banished : pl.extra;
    const label = kind === 'deck' ? 'Deck' : kind === 'graveyard' ? 'Graveyard' : kind === 'banished' ? 'Banished' : 'Extra Deck';
    const topUid = kind === 'graveyard' && list.length ? list[list.length - 1] : null;
    return (
      <div className={`zone zone-pile zone-${kind}`} onClick={() => onPileClick(player, kind)} title={`${label}: ${list.length} card${list.length === 1 ? '' : 's'} (click to view)`}>
        {topUid ? (
          <CardView card={view.cards[topUid]} size="sm" />
        ) : list.length > 0 ? (
          <CardView faceDown size="sm" />
        ) : (
          <span className="zone-label">{label}</span>
        )}
        <span className="pile-count">
          {label} · {list.length}
        </span>
      </div>
    );
  };

  const emzCell = (index: number) => {
    const uid = view.extraMonsterZones[index];
    const ref: ZoneRef = { player: bottom, zone: 'extraMonster', index };
    const sel = zoneSelectable(ref);
    return (
      <div key={`emz-${index}`} className={`zone zone-emz${sel ? ' zone-selectable' : ''}`} onClick={() => (sel ? onZoneClick(ref) : undefined)}>
        {uid ? cardEl(uid) : <span className="zone-label">Extra Monster Zone</span>}
        {sel && <span className="zone-choose">choose</span>}
      </div>
    );
  };

  const hand = (player: PlayerId, isBottom: boolean) => {
    const pl = view.players[player];
    const faceDown = !isBottom && !revealAll;
    return (
      <div className={`hand ${isBottom ? 'hand-bottom' : 'hand-top'}`}>
        {pl.hand.map((uid) => cardEl(uid, { faceDownOverride: faceDown, size: 'md' }))}
        {pl.hand.length === 0 && <span className="zone-label">No cards in hand</span>}
      </div>
    );
  };

  const order = (player: PlayerId, isBottom: boolean) => (isBottom ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0]).map((i) => i);

  const sideTag = (player: PlayerId) => <span className={`side-tag side-tag-${player === bottom ? 'bottom' : 'top'}`}>{view.players[player].name}'s side</span>;

  const playerBanner = (player: PlayerId, isBottom: boolean) => {
    const pl = view.players[player];
    const isTurn = view.turnPlayer === player;
    return (
      <div className={`player-banner ${isBottom ? 'banner-bottom' : 'banner-top'}${isTurn ? ' is-turn' : ''}`} data-lp-player={player}>
        <div className="player-name">
          {pl.name}
          {isTurn && <span className="turn-tag">TURN PLAYER</span>}
        </div>
        <div className="player-lp">
          <span className="lp-label">LP</span>
          <span className="lp-value" key={pl.lp}>
            {pl.lp}
          </span>
        </div>
        <div className="player-meta">
          Hand {pl.hand.length} · Deck {pl.deck.length} · GY {pl.graveyard.length}
        </div>
      </div>
    );
  };

  return (
    <div className="board">
      {playerBanner(top, false)}
      {hand(top, false)}
      <div className="field-rows">
        {sideTag(top)}
        <div className="field-row">
          {pile(top, 'deck')}
          {order(top, false).map((i) => zoneCell(top, 'spellTrap', i))}
          {pile(top, 'extra')}
        </div>
        <div className="field-row">
          {pile(top, 'graveyard')}
          {order(top, false).map((i) => zoneCell(top, 'monster', i))}
          {fieldCell(top)}
        </div>
        <div className="field-row emz-row">
          {pile(top, 'banished')}
          <div className="zone zone-spacer" />
          {emzCell(0)}
          <div className="zone zone-spacer center-marker">
            <span className="phase-marker">Turn {view.turn}</span>
          </div>
          {emzCell(1)}
          <div className="zone zone-spacer" />
          {pile(bottom, 'banished')}
        </div>
        <div className="field-row">
          {fieldCell(bottom)}
          {order(bottom, true).map((i) => zoneCell(bottom, 'monster', i))}
          {pile(bottom, 'graveyard')}
        </div>
        <div className="field-row">
          {pile(bottom, 'extra')}
          {order(bottom, true).map((i) => zoneCell(bottom, 'spellTrap', i))}
          {pile(bottom, 'deck')}
        </div>
        {sideTag(bottom)}
      </div>
      {hand(bottom, true)}
      {playerBanner(bottom, true)}
    </div>
  );
}

export function cardName(view: GameState, uid: string): string {
  return defOf(view.cards[uid]).name;
}
