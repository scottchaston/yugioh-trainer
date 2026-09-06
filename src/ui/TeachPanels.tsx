import { useState } from 'react';
import { Game, PHASE_LABEL, type GameState, type PlayerId, type Prompt } from '../engine';
import { suggestMoves, type Suggestion } from '../strategy/suggest';
import { defOf } from './cardDef';

/** The chain being built or resolved, newest link on top. */
export function ChainStack({ view }: { view: GameState }) {
  if (view.chain.length === 0) return null;
  const g = new Game(view);
  const links = view.chain.map((l, i) => ({ l, i })).reverse();
  return (
    <div className="panel chain-panel">
      <h3>Chain {view.resolvingChain ? '(resolving)' : '(building)'}</h3>
      <p className="muted small">Cards resolve from the top of the chain down: the last card activated resolves first.</p>
      <div className="chain-list">
        {links.map(({ l, i }) => (
          <div key={i} className={`chain-link${l.negated ? ' negated' : ''}${view.resolvingChain && view.resolvingLinkIndex === i ? ' resolving' : ''}`}>
            <span className="chain-no">Link {i + 1}</span>
            <span className="chain-card">{g.name(l.uid)}</span>
            <span className="chain-player">{view.players[l.player].name}</span>
            <span className="chain-speed">SS{l.spellSpeed}</span>
            {l.negated && <span className="chain-negated">negated</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** What the turn player has done / can still do this turn. */
export function TurnChecklist({ view }: { view: GameState }) {
  const g = new Game(view);
  const p = view.turnPlayer;
  const pl = view.players[p];
  const items: { ok: boolean; text: string }[] = [
    { ok: pl.normalSummonsUsed < pl.normalSummonsAllowed, text: pl.normalSummonsUsed < pl.normalSummonsAllowed ? 'Normal Summon / Set available' : 'Normal Summon / Set used' },
    { ok: view.turn > 1 && !pl.turnFlags['skipBattlePhase'], text: view.turn === 1 ? 'No Battle Phase on the first turn' : pl.turnFlags['skipBattlePhase'] ? 'Battle Phase not allowed this turn' : view.phase === 'BATTLE' ? 'In the Battle Phase' : ['MAIN2', 'END'].includes(view.phase) ? 'Battle Phase done' : 'Battle Phase available' },
    { ok: pl.hand.length <= 6, text: `${pl.hand.length} card${pl.hand.length === 1 ? '' : 's'} in hand (limit 6 at the End Phase)` },
  ];
  const attackers = g.fieldMonsters(p).filter((m) => m.faceUp && m.position === 'ATK');
  if (attackers.length) items.push({ ok: attackers.some((m) => m.attacksDeclaredThisTurn === 0), text: `${attackers.filter((m) => m.attacksDeclaredThisTurn === 0).length} of ${attackers.length} attackers still able to attack` });
  if (g.pendulumCards(p).length === 2) items.push({ ok: !pl.pendulumSummonUsed, text: pl.pendulumSummonUsed ? 'Pendulum Summon used' : 'Pendulum Summon available' });
  return (
    <div className="panel checklist">
      <h3>
        Turn {view.turn} · {PHASE_LABEL[view.phase]} · {pl.name}
      </h3>
      <ul>
        {items.map((it, i) => (
          <li key={i} className={it.ok ? 'ok' : 'done'}>
            {it.ok ? '○' : '●'} {it.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SuggestPanel({ view, player, prompt, onAct, onActivate, onClose }: { view: GameState; player: PlayerId; prompt: Prompt | null; onAct: (s: Suggestion) => void; onActivate: (a: { uid: string; effectId: string }) => void; onClose: () => void }) {
  const suggestions = suggestMoves(view, player, prompt);
  return (
    <div className="panel suggest-panel">
      <div className="modal-head">
        <h3>
          <span className="strategy-badge">STRATEGY</span> Suggestions for {view.players[player].name}
        </h3>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted small">These are ideas, not rules. The rules engine decides what is legal; you decide what is wise.</p>
      {suggestions.length === 0 && <p className="muted">No particular suggestion right now: it is not your turn, or a decision is pending.</p>}
      {suggestions.map((s, i) => (
        <div key={i} className={`suggestion suggestion-${s.kind}`}>
          <div className="suggestion-title">{s.title}</div>
          <div className="suggestion-reason">{s.reason}</div>
          {s.action && (
            <button className="btn btn-primary" onClick={() => onAct(s)}>
              Do this
            </button>
          )}
          {s.activation && (
            <button className="btn btn-primary" onClick={() => onActivate(s.activation!)}>
              Activate it
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

const HELP: { title: string; body: string }[] = [
  { title: 'The turn', body: 'Draw Phase (draw 1; not on the very first turn) → Standby Phase → Main Phase 1 → Battle Phase (not on the first turn of the Duel) → Main Phase 2 → End Phase (discard down to 6 cards). You may skip the Battle Phase.' },
  { title: 'Normal Summon and Set', body: 'Once per turn you may Normal Summon one monster face-up in Attack Position, or Set it face-down in Defense Position. Level 5-6 monsters need 1 Tribute, Level 7 or higher need 2 Tributes (monsters you control that are sent to the Graveyard).' },
  { title: 'Special Summon', body: 'Any Summon that is not a Normal Summon: by a card effect (Monster Reborn, Call of the Haunted), by a monster\'s own condition (Rainbow Dragon), or by a procedure such as Synchro Summon (Tuner + non-Tuners with matching total Level), Fusion Summon, or Pendulum Summon. Special Summons do not use up your Normal Summon.' },
  { title: 'Battle positions', body: 'Attack Position monsters can attack and take battle damage. Defense Position monsters cannot attack; if attacked, the attacker\'s ATK is compared with their DEF and no damage is dealt to their controller unless the attacker pierces. A monster can change position once per turn, but not the turn it was Summoned/Set and not after attacking.' },
  { title: 'Battle', body: 'Each face-up Attack Position monster may attack once per turn during the Battle Phase. Attack vs Attack: the lower ATK monster is destroyed and its controller takes the difference. Attack vs Defense: if ATK is higher the defender is destroyed (no damage); if DEF is higher the attacker\'s controller takes the difference and nothing is destroyed. If the opponent has no monsters you attack directly for full ATK.' },
  { title: 'Spell Cards', body: 'Normal Spells are used during your Main Phase and go to the Graveyard after resolving. Continuous, Equip and Field Spells stay on the field. Quick-Play Spells can be activated from your hand during your turn, or from a Set position on any turn after the turn they were Set. Field Spells go in the Field Zone.' },
  { title: 'Trap Cards', body: 'Traps must be Set first and cannot be activated during the turn they were Set. From the next turn on you can activate them at the right moment, even during your opponent\'s turn: for example when a monster attacks or is Summoned. Counter Traps are the fastest (Spell Speed 3).' },
  { title: 'Spell Speed and chains', body: 'Spell Speed 1: Normal Spells and most monster effects; used only at a quiet moment in your own Main Phase and cannot respond to anything. Spell Speed 2: Quick-Play Spells, Traps and Quick Effects; can respond to other cards. Spell Speed 3: Counter Traps; only another Counter Trap can respond to them. When cards respond to each other they form a chain, which resolves backwards: the last card activated resolves first.' },
  { title: 'Costs versus effects', body: 'A cost (text before a semicolon or the word "cost") is paid when you activate the card, even if the effect is later negated. The effect happens when the card resolves. "Target" means you choose the card when you activate; if that card is gone when the effect resolves, the effect does nothing.' },
  { title: 'Crystal Beasts', body: 'When a face-up Crystal Beast is destroyed in a Monster Zone, its controller may place it in a Spell & Trap Zone as a Continuous Spell instead of sending it to the Graveyard. There it is not a monster (it cannot attack), but Crystal Beast support such as Ancient City - Rainbow Ruins, Crystal Beacon and Crystal Promise counts or uses it. The Field Zone is separate from the five Spell & Trap Zones.' },
  { title: 'Pendulum Monsters', body: 'A Pendulum Monster can be placed in one of your two Pendulum Zones (the leftmost and rightmost Spell & Trap Zones), where it is treated as a Spell Card with its Pendulum Effect. With Scales in both zones, once per turn you can Pendulum Summon monsters whose Levels are strictly between the two Scales. Destroyed Pendulum Monsters go face-up to the Extra Deck.' },
  { title: 'Gemini Monsters', body: 'A Gemini monster (Darkstorm Dragon) is a Normal Monster with no effect on the field and in the Graveyard. While it is face-up you can use your Normal Summon on it again (no Tributes) to give it its effect.' },
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Rules help</h3>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        {HELP.map((h, i) => (
          <div key={i} className="help-item">
            <button className="help-title" onClick={() => setOpen(open === i ? null : i)}>
              {open === i ? '▾' : '▸'} {h.title}
            </button>
            {open === i && <p className="help-body">{h.body}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function cardName(view: GameState, uid: string): string {
  return defOf(view.cards[uid]).name;
}
