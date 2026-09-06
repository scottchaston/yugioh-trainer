import { useEffect, useMemo, useState } from 'react';
import { getCard } from '../cards';
import { getLegalActions, PHASE_LABEL, type LegalActionInfo, type PlayerId, type ZoneRef } from '../engine';
import { answer, cancelPending, clearGame, committedState, currentView, dispatch, newGame, rewindTo, setNotice, undo, updateSettings, useStore } from '../state/store';
import { Board } from './Board';
import { Inspector } from './Inspector';
import { LogPanel } from './LogPanel';
import { PileModal } from './PileModal';
import { PromptPanel } from './PromptPanel';
import { Setup } from './Setup';

const PHASES = ['DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END'] as const;
const PHASE_SHORT: Record<string, string> = { DRAW: 'Draw', STANDBY: 'Standby', MAIN1: 'Main 1', BATTLE: 'Battle', MAIN2: 'Main 2', END: 'End' };

const PHASE_HELP: Record<string, string> = {
  DRAW: 'Draw Phase: the turn player draws 1 card (except the very first turn of the Duel).',
  STANDBY: 'Standby Phase: some card effects happen here. Usually nothing to do.',
  MAIN1: 'Main Phase 1: Normal Summon or Set one monster, Set Spells/Traps, activate Spells and effects, change battle positions.',
  BATTLE: 'Battle Phase: attack with face-up Attack Position monsters, one attack each. Your opponent can respond to attacks with Traps and Quick Effects.',
  MAIN2: 'Main Phase 2: like Main Phase 1 (you still only get one Normal Summon/Set per turn in total).',
  END: 'End Phase: discard down to 6 cards if needed; some effects end or trigger here.',
};

export function App() {
  const store = useStore();
  const view = currentView(store);
  const committed = committedState(store);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [promptSelection, setPromptSelection] = useState<string[]>([]);
  const [whatCanIDo, setWhatCanIDo] = useState(false);
  const [pileModal, setPileModal] = useState<{ player: PlayerId; pile: 'graveyard' | 'banished' | 'extra' | 'deck' } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [whyPhase, setWhyPhase] = useState<string | null>(null);

  useEffect(() => {
    setPromptSelection([]);
  }, [store.pending?.prompt]);

  // Keyboard: Ctrl/Cmd+Z = undo, Escape = clear selection
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if (e.key === 'Escape') {
        setSelectedUid(null);
        setWhatCanIDo(false);
        setPileModal(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const legal = useMemo(() => (committed ? getLegalActions(committed, committed.turnPlayer) : []), [committed]);

  if (!view || !committed) {
    return <Setup onStart={(cfg) => newGame({ players: [{ name: cfg.names[0] || 'Player 1', deckId: cfg.decks[0] }, { name: cfg.names[1] || 'Player 2', deckId: cfg.decks[1] }], firstPlayer: cfg.first, seed: cfg.seed })} />;
  }

  const prompt = store.pending?.prompt ?? null;
  const actingPlayer: PlayerId = prompt ? prompt.player : view.turnPlayer;
  const bottom: PlayerId = store.settings.perspective === 'auto' ? actingPlayer : store.settings.perspective;
  const legalOnly = legal.filter((a) => a.legal);
  const highlightUids = new Set<string>();
  if (whatCanIDo) for (const a of legalOnly) if (a.uid) highlightUids.add(a.uid);

  const phaseAction = (type: 'TO_BATTLE_PHASE' | 'TO_MAIN2' | 'END_TURN') => legal.find((a) => a.action.type === type);

  const onCardClick = (uid: string) => {
    if (prompt?.type === 'selectCards') {
      if (!prompt.cards.includes(uid)) {
        setSelectedUid(uid);
        return;
      }
      setPromptSelection((sel) => {
        if (sel.includes(uid)) return sel.filter((x) => x !== uid);
        if (sel.length >= prompt.max) return prompt.max === 1 ? [uid] : sel;
        return [...sel, uid];
      });
      return;
    }
    setSelectedUid(uid);
  };

  const onZoneClick = (z: ZoneRef) => {
    if (prompt?.type === 'selectZone') answer({ zone: z });
  };

  const runAction = (a: LegalActionInfo) => {
    if (!a.legal) {
      setNotice({ title: 'Not allowed right now', text: a.reason ?? '', kind: 'error' });
      return;
    }
    setWhatCanIDo(false);
    dispatch(a.action);
  };

  const selectedCard = selectedUid ? view.cards[selectedUid] : null;
  const selectedHidden = !!selectedCard && !selectedCard.faceUp && !store.settings.revealAll && (selectedCard.zone === 'hand' ? selectedCard.owner !== bottom : selectedCard.controller !== bottom) && selectedCard.zone !== 'deck';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Yu-Gi-Oh! Practice Table</div>
        <div className="phase-track">
          <span className="turn-label">Turn {view.turn}</span>
          {PHASES.map((p) => (
            <button key={p} className={`phase-chip${view.phase === p ? ' active' : ''}`} onClick={() => setWhyPhase(whyPhase === p ? null : p)} title={PHASE_HELP[p]}>
              {PHASE_SHORT[p]}
            </button>
          ))}
          <span className="turn-player">{view.players[view.turnPlayer].name}'s turn</span>
        </div>
        <div className="topbar-actions">
          {(['TO_BATTLE_PHASE', 'TO_MAIN2', 'END_TURN'] as const).map((t) => {
            const a = phaseAction(t);
            if (!a) return null;
            return (
              <button
                key={t}
                className={`btn ${a.legal ? (t === 'END_TURN' ? 'btn-warn' : 'btn-primary') : 'btn-disabled'}`}
                disabled={!!prompt}
                onClick={() => runAction(a)}
                title={a.legal ? a.rule : a.reason}
              >
                {a.label}
              </button>
            );
          })}
          <button className={`btn btn-teach${whatCanIDo ? ' active' : ''}`} onClick={() => setWhatCanIDo(!whatCanIDo)} disabled={!!prompt}>
            What can I do?
          </button>
          <button className="btn" onClick={() => undo()} title="Undo (Ctrl+Z)" disabled={store.history.length <= 1 && !store.pending}>
            Undo
          </button>
          <button className="btn" onClick={() => setShowHistory(!showHistory)}>
            Rewind
          </button>
          <button className="btn" onClick={() => setShowSettings(!showSettings)}>
            Settings
          </button>
        </div>
      </header>
      {whyPhase && (
        <div className="phase-help">
          <b>{PHASE_LABEL[whyPhase as keyof typeof PHASE_LABEL]}.</b> {PHASE_HELP[whyPhase]}
          <button className="btn btn-link" onClick={() => setWhyPhase(null)}>
            close
          </button>
        </div>
      )}
      <div className="main">
        <div className="board-wrap">
          {prompt && (
            <div className={`decision-banner${prompt.type === 'fastEffects' ? ' decision-response' : ''}`}>
              {prompt.type === 'fastEffects' ? 'RESPONSE AVAILABLE — ' : 'DECISION — '}
              <b>{view.players[prompt.player].name}</b>: {prompt.type === 'fastEffects' ? 'you may respond (see the panel on the right)' : prompt.title}
            </div>
          )}
          <Board
            view={view}
            bottom={bottom}
            revealAll={store.settings.revealAll}
            selectedUid={selectedUid}
            highlightUids={highlightUids}
            prompt={prompt}
            promptSelection={promptSelection}
            onCardClick={onCardClick}
            onZoneClick={onZoneClick}
            onPileClick={(player, pile) => setPileModal({ player, pile })}
            animations={store.settings.animations}
          />
          {view.winner !== null && (
            <div className="modal-backdrop">
              <div className="modal winner">
                <h2>{view.players[view.winner].name} wins the Duel!</h2>
                <p>{view.winReason}</p>
                <div className="prompt-buttons">
                  <button className="btn" onClick={() => undo()}>
                    Undo last action
                  </button>
                  <button className="btn btn-primary" onClick={() => clearGame()}>
                    New Duel
                  </button>
                </div>
              </div>
            </div>
          )}
          {store.notice && (
            <div className={`notice notice-${store.notice.kind}`}>
              <b>{store.notice.title}</b>
              <div>{store.notice.text}</div>
              <button className="btn btn-link" onClick={() => setNotice(null)}>
                dismiss
              </button>
            </div>
          )}
          {whatCanIDo && !prompt && (
            <div className="panel teach-panel">
              <div className="modal-head">
                <h3>What can {view.players[view.turnPlayer].name} do right now?</h3>
                <button className="btn" onClick={() => setWhatCanIDo(false)}>
                  Close
                </button>
              </div>
              <p className="muted small">{PHASE_HELP[view.phase]}</p>
              <TeachList actions={legal} view={view} onAction={runAction} />
            </div>
          )}
        </div>
        <aside className="sidebar">
          {prompt && (
            <PromptPanel
              view={view}
              prompt={prompt}
              selection={promptSelection}
              onToggleCard={onCardClick}
              onConfirmCards={() => answer({ cards: promptSelection })}
              onOption={(id) => answer({ option: id })}
              onActivate={(uid, effectId) => answer({ activation: { uid, effectId } })}
              onPass={() => answer({ activation: null })}
              onCancel={() => cancelPending()}
              onUndo={() => undo()}
            />
          )}
          <Inspector view={view} committed={committed} uid={selectedUid} hidden={selectedHidden} onAction={runAction} disabledBecausePending={!!prompt} />
          <LogPanel view={view} />
        </aside>
      </div>
      {pileModal && (
        <PileModal
          view={view}
          player={pileModal.player}
          pile={pileModal.pile}
          revealAll={store.settings.revealAll}
          onSelect={(uid) => {
            setSelectedUid(uid);
            setPileModal(null);
          }}
          onClose={() => setPileModal(null)}
        />
      )}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal settings" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Settings</h3>
              <button className="btn" onClick={() => setShowSettings(false)}>
                Close
              </button>
            </div>
            <label className="setting">
              <input type="checkbox" checked={store.settings.askAtPhaseWindows} onChange={(e) => updateSettings({ askAtPhaseWindows: e.target.checked })} />
              <span>
                <b>Also pause during the Draw Phase, Standby Phase and Battle Phase steps when a response is possible.</b>
                <br />
                <small>The table always pauses for summons, attacks, card activations and the End Phase. Rules-accurate play also allows Traps and Quick-Play Spells at these quieter moments; turn this on once you are comfortable.</small>
              </span>
            </label>
            <label className="setting">
              <input type="checkbox" checked={store.settings.revealAll} onChange={(e) => updateSettings({ revealAll: e.target.checked })} />
              <span>
                <b>Reveal all (learning mode).</b>
                <br />
                <small>Show both hands and all face-down cards. Useful when learning together.</small>
              </span>
            </label>
            <label className="setting">
              <input type="checkbox" checked={store.settings.animations} onChange={(e) => updateSettings({ animations: e.target.checked })} />
              <span>
                <b>Animations</b>
              </span>
            </label>
            <label className="setting">
              <span>
                <b>Board perspective</b>
                <br />
                <select value={String(store.settings.perspective)} onChange={(e) => updateSettings({ perspective: e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as PlayerId) })}>
                  <option value="auto">Follow the player who must act</option>
                  <option value="0">{view.players[0].name} at the bottom</option>
                  <option value="1">{view.players[1].name} at the bottom</option>
                </select>
              </span>
            </label>
            <div className="prompt-buttons">
              <button className="btn btn-warn" onClick={() => { if (confirm('Abandon this Duel and return to setup?')) { clearGame(); setShowSettings(false); } }}>
                New Duel
              </button>
            </div>
          </div>
        </div>
      )}
      {showHistory && (
        <div className="modal-backdrop" onClick={() => setShowHistory(false)}>
          <div className="modal history" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Rewind to an earlier point</h3>
              <button className="btn" onClick={() => setShowHistory(false)}>
                Close
              </button>
            </div>
            <p className="muted small">Click an entry to go back to the game state right after that action. Everything after it is undone.</p>
            <div className="history-list">
              {store.history.map((h, i) => (
                <button key={i} className={`history-item${i === store.history.length - 1 ? ' current' : ''}`} onClick={() => { rewindTo(i); setShowHistory(false); }}>
                  <span className="history-turn">T{h.state.turn} {PHASE_SHORT[h.state.phase]}</span>
                  <span>{h.label}</span>
                </button>
              )).reverse()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeachList({ actions, view, onAction }: { actions: LegalActionInfo[]; view: NonNullable<ReturnType<typeof currentView>>; onAction: (a: LegalActionInfo) => void }) {
  const [openWhy, setOpenWhy] = useState<number | null>(null);
  const legal = actions.filter((a) => a.legal);
  const illegal = actions.filter((a) => !a.legal);
  const name = (uid?: string) => (uid ? getCard(view.cards[uid].cardId).name : '');
  const row = (a: LegalActionInfo, i: number) => (
    <div key={i} className={`teach-row${a.legal ? '' : ' illegal'}`}>
      <button className={`btn ${a.legal ? 'btn-primary' : 'btn-disabled'}`} disabled={!a.legal} onClick={() => onAction(a)}>
        {a.uid ? `${a.label}: ${name(a.uid)}` : a.label}
      </button>
      <button className="btn btn-link" onClick={() => setOpenWhy(openWhy === i ? null : i)}>
        {a.legal ? 'Why?' : 'Why not?'}
      </button>
      {openWhy === i && <div className={`why ${a.legal ? 'why-rule' : 'why-reason'}`}>{a.legal ? a.rule : a.reason}</div>}
    </div>
  );
  return (
    <div className="teach-list">
      <h4>Legal now ({legal.length})</h4>
      {legal.length === 0 && <p className="muted">Nothing is legal right now except waiting for the other player.</p>}
      {legal.map((a, i) => row(a, i))}
      <h4>Not legal right now ({illegal.length})</h4>
      {illegal.map((a, i) => row(a, 1000 + i))}
    </div>
  );
}
