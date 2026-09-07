import { useEffect, useMemo, useRef, useState } from 'react';
import { actionsForCard, getLegalActions, PHASE_LABEL, type LegalActionInfo, type PlayerId, type ZoneRef } from '../engine';
import { answer, cancelPending, clearGame, committedState, currentView, dispatch, getStore, newGame, rewindTo, setNotice, undo, updateSettings, useStore } from '../state/store';

// For browser tests and debugging: read the store from the console.
(window as unknown as { __ygoStore: typeof getStore }).__ygoStore = getStore;
import { redactState, waitingText } from '../net/view';
import { currentSession } from '../net/session';
import { ConnectionOverlay, OnlineLobby, UndoRequestModal, leaveOnline, type LobbyMode } from './Online';
import { Board } from './Board';
import { FxLayer } from './FxLayer';
import { DuelEnd } from './DuelEnd';
import { computerSeat, installComputerOpponent, onAiThinking, undoAgainstComputer } from '../ai/controller';
import { DIFFICULTIES } from '../ai';
import { getCard } from '../cards';
import { ParticleCanvas } from './Particles';
import { playCreature, setSfxVolume, setSoundEnabled, unlockAudio } from './sound';
import { setMusicIntensity, setMusicVolume, startMusic, stopMusic } from './music';
import { Inspector } from './Inspector';
import { LogPanel } from './LogPanel';
import { PileModal } from './PileModal';
import { PromptPanel } from './PromptPanel';
import { Setup } from './Setup';
import { CardArt } from './art';
import { ChainStack, HelpModal, SuggestPanel, TurnChecklist } from './TeachPanels';
import { defOf } from './cardDef';
import { allCards } from '../cards';

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
  const online = store.online;
  const isGuest = online?.role === 'guest';
  const remote = isGuest ? online.remote : null;
  const seat: PlayerId | null = online ? online.seat : null;
  // The guest renders what the host sent; the host (and hot-seat play) renders the local engine state.
  const rawView = isGuest ? (remote?.view ?? null) : currentView(store);
  const committed = isGuest ? rawView : committedState(store);
  const fullPrompt = isGuest ? (remote?.prompt ?? null) : (store.pending?.prompt ?? null);
  // Online, the host hides the guest's hidden cards from its own screen too.
  const view = useMemo(() => (online && !isGuest && rawView ? redactState(rawView, online.seat, fullPrompt) : rawView), [online, isGuest, rawView, fullPrompt]);
  const [lobby, setLobby] = useState<LobbyMode | null>(() => {
    const join = new URLSearchParams(window.location.search).get('join');
    return join ? { mode: 'join', code: join } : null;
  });
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [promptSelection, setPromptSelection] = useState<string[]>([]);
  const [whatCanIDo, setWhatCanIDo] = useState(false);
  const [pileModal, setPileModal] = useState<{ player: PlayerId; pile: 'graveyard' | 'banished' | 'extra' | 'deck' } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [whyPhase, setWhyPhase] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  // Phones: zoom the board so all seven columns fit the screen width (the sidebar stacks underneath).
  const [boardZoom, setBoardZoom] = useState(1);
  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const BOARD_WIDTH = 736;
    const update = () => {
      const w = el.clientWidth - 12;
      setBoardZoom(window.innerWidth <= 900 && w < BOARD_WIDTH ? Math.max(0.4, w / BOARD_WIDTH) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rawView]);
  // Phones: bring a new decision into view (the panels sit under the board there).
  const promptRef = useRef<HTMLDivElement | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!fullPrompt || window.innerWidth > 900) return;
    const target = fullPrompt.type === 'selectZone' ? boardWrapRef.current : promptRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [fullPrompt]);

  useEffect(() => {
    setPromptSelection([]);
  }, [fullPrompt]);

  useEffect(() => {
    setSoundEnabled(store.settings.sound);
  }, [store.settings.sound]);
  // Computer opponent: plays its seat from the store; the flag drives the "thinking" banner.
  const [aiThinking, setAiThinking] = useState(false);
  useEffect(() => {
    installComputerOpponent();
    return onAiThinking(setAiThinking);
  }, []);
  const computer = !online ? computerSeat() : null;
  const aiSeat: PlayerId | null = computer ? computer.seat : null;
  const human: PlayerId = aiSeat === 0 ? 1 : 0;
  const doUndo = () => (aiSeat !== null ? undoAgainstComputer() : undo());
  useEffect(() => {
    setSfxVolume(store.settings.sfxVolume);
  }, [store.settings.sfxVolume]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      setAudioUnlocked(true);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);
  const inDuel = !!rawView;
  useEffect(() => {
    if (store.settings.music && audioUnlocked && inDuel) startMusic();
    else stopMusic();
  }, [store.settings.music, audioUnlocked, inDuel]);
  useEffect(() => {
    setMusicVolume(store.settings.musicVolume);
  }, [store.settings.musicVolume]);
  const phaseForMusic = view?.phase;
  useEffect(() => {
    setMusicIntensity(phaseForMusic === 'BATTLE' ? 'battle' : 'calm');
  }, [phaseForMusic]);

  // Keyboard: Ctrl/Cmd+Z = undo, Escape = clear selection
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        doUndo();
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

  const legal = useMemo(() => {
    if (isGuest) return remote?.legal ?? [];
    if (!committed) return [];
    return getLegalActions(committed, seat ?? committed.turnPlayer);
  }, [isGuest, remote, committed, seat]);
  // Guest: strategy suggestions are computed by the host on request.
  useEffect(() => {
    if (showSuggest && isGuest) currentSession()?.requestSuggestions();
  }, [showSuggest, isGuest, rawView]);

  if (new URLSearchParams(window.location.search).has('gallery')) {
    return (
      <div className="gallery">
        {allCards().map((d) => (
          <div key={d.id} className="gallery-item">
            <CardArt def={d} />
            <span>{d.name}</span>
          </div>
        ))}
      </div>
    );
  }
  if (!view || !committed) {
    if (lobby || online) {
      return (
        <OnlineLobby
          lobby={lobby ?? { mode: 'host' }}
          onBack={() => {
            leaveOnline();
            setLobby(null);
            if (window.location.search.includes('join=')) window.history.replaceState(null, '', window.location.pathname);
          }}
        />
      );
    }
    return (
      <Setup
        onStart={(cfg) =>
          newGame({
            players: [
              { name: cfg.names[0] || 'Player 1', deckId: cfg.decks[0] },
              { name: cfg.ai ? `Computer (${DIFFICULTIES.find((d) => d.id === cfg.ai)?.label ?? cfg.ai})` : cfg.names[1] || 'Player 2', deckId: cfg.decks[1], ai: cfg.ai },
            ],
            firstPlayer: cfg.first,
            seed: cfg.seed,
          })
        }
        onOnline={(m) => setLobby(m)}
      />
    );
  }

  const me = seat;
  // Online, only questions for this seat are shown as questions; the rest is "waiting for…".
  const computerActing = aiSeat !== null && view.winner === null && (fullPrompt ? fullPrompt.player === aiSeat : view.turnPlayer === aiSeat);
  const prompt = online && fullPrompt && fullPrompt.player !== me ? null : aiSeat !== null && fullPrompt && fullPrompt.player === aiSeat ? null : fullPrompt;
  const waiting = online ? (isGuest ? (remote?.waiting ?? null) : waitingText(rawView!, fullPrompt, me!)) : null;
  const actingPlayer: PlayerId = fullPrompt ? fullPrompt.player : view.turnPlayer;
  const bottom: PlayerId = online ? me! : aiSeat !== null ? human : store.settings.perspective === 'auto' ? actingPlayer : store.settings.perspective === 'turn' ? view.turnPlayer : store.settings.perspective;
  const revealAll = online ? false : store.settings.revealAll;
  const canUndo = online ? !online.undoRequest && (isGuest ? !!remote?.canUndo : store.history.length > 1 || !!store.pending) && online.status === 'playing' : store.history.length > 1 || !!store.pending;
  const endDuel = () => {
    if (online) {
      leaveOnline();
      setLobby(null);
    } else clearGame();
  };
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
      setSelectedUid(uid);
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
  const selectedHidden = !!selectedCard && !selectedCard.faceUp && !revealAll && (selectedCard.zone === 'hand' ? selectedCard.owner !== bottom : selectedCard.controller !== bottom) && selectedCard.zone !== 'deck';
  const selectedActions: LegalActionInfo[] = !selectedCard
    ? []
    : isGuest
      ? legal.filter((a) => a.uid === selectedUid)
      : online && selectedCard.controller !== me
        ? []
        : committed.cards[selectedUid!]
          ? actionsForCard(committed, selectedCard.controller, selectedUid!)
          : [];

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
          {online && (
            <span className={`online-chip online-${online.status}`} title={`Room code ${online.code}`}>
              Online · {online.code} · you are {view.players[me!].name}
              {online.status !== 'playing' && ' · reconnecting'}
            </span>
          )}
        </div>
        <div className="topbar-actions">
          {(['TO_BATTLE_PHASE', 'TO_MAIN2', 'END_TURN'] as const).map((t) => {
            const a = phaseAction(t);
            if (!a) return null;
            return (
              <button
                key={t}
                className={`btn ${a.legal ? (t === 'END_TURN' ? 'btn-warn' : 'btn-primary') : 'btn-disabled'}`}
                disabled={!!prompt || computerActing}
                onClick={() => runAction(a)}
                title={a.legal ? a.rule : a.reason}
              >
                {a.label}
              </button>
            );
          })}
          <button className={`btn btn-teach${whatCanIDo ? ' active' : ''}`} onClick={() => setWhatCanIDo(!whatCanIDo)} disabled={!!prompt || computerActing}>
            What can I do?
          </button>
          <button className={`btn btn-strategy${showSuggest ? ' active' : ''}`} onClick={() => setShowSuggest(!showSuggest)} title="Optional strategy ideas (not rules)">
            Suggest move
          </button>
          <button className="btn" onClick={() => setShowHelp(true)} title="Beginner rules reference">
            Rules help
          </button>
          <button className="btn" onClick={doUndo} title={online ? 'Ask your opponent to allow an undo' : aiSeat !== null ? 'Take back your last move (Ctrl+Z)' : 'Undo (Ctrl+Z)'} disabled={!canUndo}>
            {online ? 'Ask to undo' : 'Undo'}
          </button>
          {!online && (
            <button className="btn" onClick={() => setShowHistory(!showHistory)}>
              Rewind
            </button>
          )}
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
        <div className="board-wrap" ref={boardWrapRef}>
          {computerActing && (
            <div className="decision-banner waiting-banner computer-banner">
              {aiThinking ? 'COMPUTER — thinking…' : `COMPUTER — ${view.players[aiSeat!].name} is playing`}
            </div>
          )}
          {waiting && !prompt && (
            <div className="decision-banner waiting-banner">
              WAITING — <b>{waiting.text}</b>
            </div>
          )}
          {prompt && (
            <div className={`decision-banner${prompt.type === 'fastEffects' ? ' decision-response' : ''}`}>
              {prompt.type === 'fastEffects' ? 'RESPONSE AVAILABLE — ' : 'DECISION — '}
              <b>{online ? 'You' : view.players[prompt.player].name}</b>: {prompt.type === 'fastEffects' ? 'you may respond (see the panel on the right)' : prompt.title}
              {prompt.type === 'selectZone' && <span className="banner-hint"> · the highlighted zones are on {view.players[prompt.player].name}'s side ({prompt.player === bottom ? 'bottom' : 'top'} of the board)</span>}
              {prompt.type === 'selectCards' && prompt.cards.some((u) => view.cards[u] && ['monster', 'spellTrap', 'field', 'extraMonster'].includes(view.cards[u].zone)) && <span className="banner-hint"> · highlighted cards can be clicked on the board</span>}
            </div>
          )}
          <div className="board-scale" style={boardZoom < 1 ? { zoom: boardZoom } : undefined}>
          <Board
            view={view}
            bottom={bottom}
            revealAll={revealAll}
            selectedUid={selectedUid}
            highlightUids={highlightUids}
            prompt={prompt}
            promptSelection={promptSelection}
            onCardClick={onCardClick}
            onZoneClick={onZoneClick}
            onPileClick={(player, pile) => setPileModal({ player, pile })}
            animations={store.settings.animations}
          />
          </div>
          <FxLayer view={view} enabled={store.settings.animations} container={boardWrapRef} />
          <ParticleCanvas container={boardWrapRef} enabled={store.settings.animations} />
          {view.winner !== null && (
            <DuelEnd view={view} me={online ? me! : aiSeat !== null ? human : null} animations={store.settings.animations} online={!!online} canUndo={canUndo} onUndo={doUndo} onEnd={endDuel} />
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
                <h3>What can {online ? 'you' : view.players[view.turnPlayer].name} do right now?</h3>
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
          <TurnChecklist view={view} />
          <ChainStack view={view} />
          {showSuggest && (
            <SuggestPanel
              view={view}
              player={online ? me! : aiSeat !== null ? human : prompt ? prompt.player : view.turnPlayer}
              prompt={prompt}
              suggestions={isGuest ? (online.suggestions ?? []) : undefined}
              onAct={(sg) => {
                if (sg.action) {
                  setShowSuggest(false);
                  dispatch(sg.action);
                }
              }}
              onActivate={(a) => {
                setShowSuggest(false);
                answer({ activation: a });
              }}
              onClose={() => setShowSuggest(false)}
            />
          )}
          {prompt && (
            <div ref={promptRef} className="prompt-anchor">
            <PromptPanel
              view={view}
              prompt={prompt}
              selection={promptSelection}
              onToggleCard={onCardClick}
              onInspect={(uid) => setSelectedUid(uid)}
              onConfirmCards={() => answer({ cards: promptSelection })}
              onOption={(id) => answer({ option: id })}
              onActivate={(uid, effectId) => answer({ activation: { uid, effectId } })}
              onPass={() => answer({ activation: null })}
              onCancel={() => cancelPending()}
              onUndo={doUndo}
            />
            </div>
          )}
          <div ref={inspectorRef} className="inspector-anchor">
          <Inspector view={view} uid={selectedUid} hidden={selectedHidden} actions={selectedActions} revealHint={!online} onAction={runAction} disabledBecausePending={!!fullPrompt} />
          </div>
          <LogPanel view={view} />
        </aside>
      </div>
      {selectedCard && !selectedHidden && (
        <div className="mobile-cardbar">
          <span className="mobile-cardbar-name">{getCard(selectedCard.cardId).name}</span>
          <button className="btn btn-primary" onClick={() => inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Details
          </button>
          <button className="btn" onClick={() => setSelectedUid(null)} aria-label="Close">
            ✕
          </button>
        </div>
      )}
      {pileModal && (
        <PileModal
          view={view}
          player={pileModal.player}
          pile={pileModal.pile}
          revealAll={revealAll}
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
            {online && (
              <p className="muted small">
                Online Duel (room code {online.code}). You are {view.players[me!].name}; hands and face-down cards are hidden from the other player, and "Reveal all" is not available.
              </p>
            )}
            {!isGuest && (
            <label className="setting">
              <input type="checkbox" checked={store.settings.askAtPhaseWindows} onChange={(e) => updateSettings({ askAtPhaseWindows: e.target.checked })} />
              <span>
                <b>Also pause during the Draw Phase, Standby Phase and Battle Phase steps when a response is possible.</b>
                <br />
                <small>The table always pauses for summons, attacks, card activations and the End Phase. Rules-accurate play also allows Traps and Quick-Play Spells at these quieter moments; turn this on once you are comfortable.{online ? ' (Host setting: applies to both players.)' : ''}</small>
              </span>
            </label>
            )}
            {!online && (
            <label className="setting">
              <input type="checkbox" checked={store.settings.revealAll} onChange={(e) => updateSettings({ revealAll: e.target.checked })} />
              <span>
                <b>Reveal all (learning mode).</b>
                <br />
                <small>Show both hands and all face-down cards. Useful when learning together.</small>
              </span>
            </label>
            )}
            <label className="setting">
              <input type="checkbox" checked={store.settings.animations} onChange={(e) => updateSettings({ animations: e.target.checked })} />
              <span>
                <b>Animations</b>
              </span>
            </label>
            <label className="setting">
              <input type="checkbox" checked={store.settings.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} />
              <span>
                <b>Sound effects</b>
                <br />
                <small>Synthesised sounds: dragon roars, tiger snarls, sword swings, chains, chimes, blasts, damage...</small>
                <br />
                <input type="range" min={0} max={2} step={0.05} value={store.settings.sfxVolume} onChange={(e) => updateSettings({ sfxVolume: Number(e.target.value) })} /> volume ({Math.round(store.settings.sfxVolume * 100)}%){' '}
                <button type="button" className="btn btn-link" onClick={(e) => { e.preventDefault(); playCreature('dragon', 'attack'); }}>
                  test (dragon roar)
                </button>
              </span>
            </label>
            <label className="setting">
              <input type="checkbox" checked={store.settings.music} onChange={(e) => updateSettings({ music: e.target.checked })} />
              <span>
                <b>Background music</b>
                <br />
                <small>A generated duel-anime style loop that intensifies during the Battle Phase.</small>
                <br />
                <input type="range" min={0} max={0.6} step={0.02} value={store.settings.musicVolume} onChange={(e) => updateSettings({ musicVolume: Number(e.target.value) })} /> volume
              </span>
            </label>
            {!online && aiSeat === null && (
            <label className="setting">
              <span>
                <b>Board perspective</b>
                <br />
                <select value={String(store.settings.perspective)} onChange={(e) => updateSettings({ perspective: e.target.value === 'auto' ? 'auto' : e.target.value === 'turn' ? 'turn' : (Number(e.target.value) as PlayerId) })}>
                  <option value="turn">Turn player at the bottom (flips when the turn changes)</option>
                  <option value="auto">Follow whoever must decide (flips for every decision)</option>
                  <option value="0">{view.players[0].name} at the bottom</option>
                  <option value="1">{view.players[1].name} at the bottom</option>
                </select>
              </span>
            </label>
            )}
            <div className="prompt-buttons">
              <button className="btn btn-warn" onClick={() => { if (confirm(online ? 'Leave this online Duel?' : 'Abandon this Duel and return to setup?')) { endDuel(); setShowSettings(false); } }}>
                {online ? 'Leave the Duel' : 'New Duel'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {online && <UndoRequestModal />}
      {online && <ConnectionOverlay onLeave={endDuel} />}
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
  const name = (uid?: string) => (uid ? defOf(view.cards[uid]).name : '');
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
