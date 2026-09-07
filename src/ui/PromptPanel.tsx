import { useEffect, useState } from 'react';
import type { CardDefinition } from '../cards';
import type { GameState, Prompt } from '../engine';
import { CardView, linkArrowText, typeLine } from './CardView';
import { defOf } from './cardDef';

/** Compact read-out of a card offered in a prompt, so choices can be compared without leaving the prompt. */
function CardSummary({ def, onClose }: { def: CardDefinition; onClose: () => void }) {
  const level = def.linkRating ? `LINK-${def.linkRating} ${linkArrowText(def)}` : def.rank ? `Rank ${def.rank}` : def.level !== undefined ? `Level ${def.level}` : '';
  return (
    <div className="card-summary">
      <div className="card-summary-head">
        <b>{def.name}</b>
        <button type="button" className="btn btn-link" onClick={onClose}>
          close preview
        </button>
      </div>
      <div className="muted small">
        {typeLine(def)}
        {def.cardType === 'Monster' ? ` · ${def.attribute} · ${level} · ATK ${def.atk} / ${def.linkRating ? 'no DEF' : `DEF ${def.def}`}` : ''}
        {def.pendulumScale !== undefined ? ` · Scale ${def.pendulumScale}` : ''}
      </div>
      <div className="card-summary-text">{def.text}</div>
    </div>
  );
}

interface Props {
  view: GameState;
  prompt: Prompt;
  selection: string[];
  onToggleCard: (uid: string) => void;
  /** Show a card offered in the prompt in the Card details panel. */
  onInspect: (uid: string) => void;
  onConfirmCards: () => void;
  onOption: (id: string) => void;
  onActivate: (uid: string, effectId: string) => void;
  onPass: () => void;
  onCancel: () => void;
  onUndo: () => void;
}

export function PromptPanel({ view, prompt, selection, onToggleCard, onInspect, onConfirmCards, onOption, onActivate, onPass, onCancel, onUndo }: Props) {
  const player = view.players[prompt.player].name;
  const cancellable = 'cancellable' in prompt && prompt.cancellable;
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => setPreview(null), [prompt]);
  const previewDef = preview && view.cards[preview] ? defOf(view.cards[preview]) : null;
  const showPreview = (uid: string) => {
    setPreview(uid);
    onInspect(uid);
  };
  if (prompt.type === 'fastEffects') {
    return (
      <div className="prompt prompt-response">
        <div className="prompt-badge">RESPONSE AVAILABLE</div>
        <h3>{player}, you can respond</h3>
        <p className="prompt-context">{prompt.description}</p>
        <div className="response-options">
          {prompt.options.map((o) => {
            const c = view.cards[o.uid];
            return (
              <div key={`${o.uid}-${o.effectId}`} className="response-option">
                <CardView card={c} size="sm" onClick={() => showPreview(o.uid)} />
                <div className="response-text">
                  <div className="response-name">
                    {defOf(c).name}{' '}
                    <button type="button" className="btn btn-link pick-details" onClick={() => showPreview(o.uid)}>
                      read card
                    </button>
                  </div>
                  <div className="response-label">{o.label}</div>
                  {o.why && <div className="why why-rule">{o.why}</div>}
                </div>
                <button className="btn btn-primary" onClick={() => onActivate(o.uid, o.effectId)}>
                  Activate
                </button>
              </div>
            );
          })}
        </div>
        {previewDef && <CardSummary def={previewDef} onClose={() => setPreview(null)} />}
        <div className="prompt-buttons">
          <button className="btn" onClick={onPass}>
            Decline (do not respond)
          </button>
          <button className="btn btn-link" onClick={onUndo}>
            Undo
          </button>
        </div>
      </div>
    );
  }
  if (prompt.type === 'selectOption') {
    return (
      <div className="prompt">
        <div className="prompt-badge">{player} decides</div>
        <h3>{prompt.title}</h3>
        {prompt.description && <p className="prompt-context">{prompt.description}</p>}
        <div className="option-list">
          {prompt.options.map((o) => (
            <button key={o.id} className="btn btn-option" onClick={() => onOption(o.id)} title={o.description}>
              <span>{o.label}</span>
              {o.description && <small>{o.description}</small>}
            </button>
          ))}
        </div>
        <div className="prompt-buttons">
          {cancellable && (
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="btn btn-link" onClick={onUndo}>
            Undo
          </button>
        </div>
      </div>
    );
  }
  if (prompt.type === 'selectZone') {
    return (
      <div className="prompt">
        <div className="prompt-badge">{player} decides</div>
        <h3>{prompt.title}</h3>
        <p className="prompt-context">{prompt.description ?? 'Click one of the highlighted zones on the board.'}</p>
        <div className="prompt-buttons">
          {cancellable && (
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="btn btn-link" onClick={onUndo}>
            Undo
          </button>
        </div>
      </div>
    );
  }
  // selectCards
  const n = selection.length;
  const ok = n >= prompt.min && n <= prompt.max;
  return (
    <div className="prompt">
      <div className="prompt-badge">{player} decides</div>
      <h3>{prompt.title}</h3>
      <p className="prompt-context">
        {prompt.description ?? ''} Choose {prompt.min === prompt.max ? prompt.min : `${prompt.min}–${prompt.max}`} card{prompt.max > 1 ? 's' : ''} (click cards below or on the board). Use{' '}
        <b>read card</b> to see a card's Level, stats and effect before choosing.
      </p>
      <div className="pick-grid">
        {prompt.cards.map((uid) => {
          const c = view.cards[uid];
          return (
            <div key={uid} className={`pick-item${preview === uid ? ' previewing' : ''}`}>
              <CardView
                card={c}
                size="sm"
                selected={selection.includes(uid)}
                onClick={() => {
                  onToggleCard(uid);
                  setPreview(uid);
                }}
              />
              <div className="pick-name">{defOf(c).name}</div>
              <button type="button" className="btn btn-link pick-details" onClick={() => showPreview(uid)}>
                read card
              </button>
            </div>
          );
        })}
      </div>
      {previewDef && <CardSummary def={previewDef} onClose={() => setPreview(null)} />}
      <div className="prompt-buttons">
        <button className="btn btn-primary" disabled={!ok} onClick={onConfirmCards}>
          Confirm ({n}/{prompt.max})
        </button>
        {cancellable && (
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn btn-link" onClick={onUndo}>
          Undo
        </button>
      </div>
    </div>
  );
}
