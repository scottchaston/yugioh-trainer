import { getCard } from '../cards';
import type { GameState, PlayerId } from '../engine';
import { CardView } from './CardView';

interface Props {
  view: GameState;
  player: PlayerId;
  pile: 'graveyard' | 'banished' | 'extra' | 'deck';
  revealAll: boolean;
  onSelect: (uid: string) => void;
  onClose: () => void;
}

export function PileModal({ view, player, pile, revealAll, onSelect, onClose }: Props) {
  const pl = view.players[player];
  const list = pile === 'graveyard' ? pl.graveyard : pile === 'banished' ? pl.banished : pile === 'extra' ? pl.extra : pl.deck;
  const label = pile === 'graveyard' ? 'Graveyard' : pile === 'banished' ? 'Banished cards' : pile === 'extra' ? 'Extra Deck' : 'Deck';
  const hidden = pile === 'deck' && !revealAll;
  const shown = pile === 'graveyard' ? list.slice().reverse() : list;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            {pl.name}'s {label} ({list.length})
          </h3>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        {hidden ? (
          <p className="muted">The Deck is face-down; its order is secret. (Turn on "Reveal all" in Settings to inspect it while learning.)</p>
        ) : list.length === 0 ? (
          <p className="muted">Empty.</p>
        ) : (
          <div className="pick-grid">
            {shown.map((uid) => (
              <div key={uid} className="pick-item" onClick={() => onSelect(uid)}>
                <CardView card={view.cards[uid]} size="sm" faceDown={false} />
                <div className="pick-name">{getCard(view.cards[uid].cardId).name}</div>
              </div>
            ))}
          </div>
        )}
        {pile === 'graveyard' && list.length > 0 && <p className="muted small">Most recently sent card is shown first.</p>}
      </div>
    </div>
  );
}
