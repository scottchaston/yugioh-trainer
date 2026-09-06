import { useState } from 'react';
import { getCard } from '../cards';
import { Game, actionsForCard, type GameState, type LegalActionInfo, type PlayerId } from '../engine';
import { CardView, typeLine } from './CardView';

interface Props {
  view: GameState;
  committed: GameState;
  uid: string | null;
  hidden: boolean;
  onAction: (a: LegalActionInfo) => void;
  disabledBecausePending: boolean;
}

export function Inspector({ view, committed, uid, hidden, onAction, disabledBecausePending }: Props) {
  const [whyOpen, setWhyOpen] = useState<string | null>(null);
  if (!uid || !view.cards[uid]) {
    return (
      <div className="panel inspector">
        <h3>Card details</h3>
        <p className="muted">Click any card to read it and see which actions are legal right now.</p>
      </div>
    );
  }
  const c = view.cards[uid];
  const d = getCard(c.cardId);
  if (hidden) {
    return (
      <div className="panel inspector">
        <h3>Face-down card</h3>
        <p className="muted">This card is face-down and belongs to the other player. Its identity is hidden (turn on "Reveal all" in Settings for learning games).</p>
      </div>
    );
  }
  const g = new Game(view);
  const stats = c.zone === 'monster' || c.zone === 'extraMonster' ? g.stats(uid) : null;
  const owner = view.players[c.owner].name;
  const controller = view.players[c.controller].name;
  const actions = committed.cards[uid] ? actionsForCard(committed, c.controller as PlayerId, uid) : [];
  const where =
    c.zone === 'hand'
      ? `${owner}'s hand`
      : c.zone === 'monster'
        ? `${controller}'s Monster Zone ${c.index + 1} (${g.positionLabel(c)})`
        : c.zone === 'spellTrap'
          ? `${controller}'s Spell & Trap Zone ${c.index + 1} (${c.faceUp ? 'face-up' : 'Set'})${c.treatedAsSpell === 'continuous' ? ' — treated as a Continuous Spell' : c.treatedAsSpell === 'equip' ? ' — treated as an Equip Spell' : ''}`
          : c.zone === 'field'
            ? `${controller}'s Field Zone`
            : c.zone === 'graveyard'
              ? `${owner}'s Graveyard`
              : c.zone === 'banished'
                ? `${owner}'s banished cards`
                : c.zone === 'extra'
                  ? `${owner}'s Extra Deck`
                  : c.zone === 'deck'
                    ? `${owner}'s Deck`
                    : 'Extra Monster Zone';
  return (
    <div className="panel inspector">
      <div className="inspector-top">
        <CardView card={c} size="lg" stats={stats} />
        <div className="inspector-facts">
          <h3>{d.name}</h3>
          <div className="fact">{typeLine(d)}</div>
          {d.cardType === 'Monster' && (
            <>
              <div className="fact">
                {d.attribute} · Level {d.level}
                {d.pendulumScale !== undefined ? ` · Scale ${d.pendulumScale}` : ''}
              </div>
              <div className="fact">
                ATK {stats ? stats.atk : d.atk} / DEF {stats ? stats.def : d.def}
                {stats && (stats.atk !== d.atk || stats.def !== d.def) ? ` (printed ${d.atk}/${d.def})` : ''}
              </div>
            </>
          )}
          <div className="fact muted">{where}</div>
          {c.summonedThisTurn && <div className="fact muted">Summoned this turn</div>}
          {c.setThisTurn && <div className="fact muted">Set this turn</div>}
          {c.equippedTo && view.cards[c.equippedTo] && <div className="fact muted">Equipped to {getCard(view.cards[c.equippedTo].cardId).name}</div>}
        </div>
      </div>
      {d.materials && <p className="card-text materials">{d.materials}</p>}
      {d.pendulumEffect && (
        <p className="card-text">
          <b>Pendulum Effect:</b> {d.pendulumEffect}
        </p>
      )}
      <p className="card-text">{d.text}</p>
      {actions.length > 0 && (
        <div className="actions">
          <h4>Actions</h4>
          {actions.map((a) => {
            const key = `${a.action.type}:${'effectId' in a.action ? a.action.effectId : ''}:${'procId' in a.action ? a.action.procId : ''}`;
            return (
              <div key={key} className={`action-row${a.legal ? '' : ' illegal'}`}>
                <button className={a.legal ? 'btn btn-primary' : 'btn btn-disabled'} disabled={!a.legal || disabledBecausePending} onClick={() => onAction(a)}>
                  {a.label}
                </button>
                <button className="btn btn-link" onClick={() => setWhyOpen(whyOpen === key ? null : key)}>
                  {a.legal ? 'Rule' : 'Why not?'}
                </button>
                {whyOpen === key && <div className={`why ${a.legal ? 'why-rule' : 'why-reason'}`}>{a.legal ? a.rule : a.reason}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
