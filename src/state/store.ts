/**
 * Game store: committed history (for Undo/rewind) plus the action in progress.
 * The rules engine is only ever called through execute(); the UI never mutates state.
 */
import { useSyncExternalStore } from 'react';
import { createGame, execute, type GameConfig } from '../engine';
import type { Action, Answer, GameState, LegalActionInfo, PlayerId, Prompt } from '../engine';
import '../effects';
import { getCard } from '../cards';
import type { Suggestion } from '../strategy/suggest';

export interface Pending {
  action: Action;
  answers: Answer[];
  prompt: Prompt;
  /** Preview of the state at the moment of the question. */
  view: GameState;
}

export interface HistoryEntry {
  state: GameState;
  /** Short description of the action that produced this state. */
  label: string;
  /** The action and the answers that produced this state (replayable; absent for the initial state). */
  step?: DuelStep;
}

export interface DuelStep {
  action: Action;
  answers: Answer[];
}

/** A whole Duel as replayable data: the setup plus every action with its answers. */
export interface SavedDuel {
  config: GameConfig;
  steps: DuelStep[];
}

/** What a remote player sees: a redacted state plus only the decisions that are theirs. */
export interface PlayerView {
  view: GameState;
  /** The question for this player, or null (then `waiting` says who is deciding). */
  prompt: Prompt | null;
  /** Legal actions for this player, computed by the host from the full state. */
  legal: LegalActionInfo[];
  waiting: { player: PlayerId; text: string } | null;
  canUndo: boolean;
}

export interface OnlineState {
  role: 'host' | 'guest';
  /** The local player's seat. */
  seat: PlayerId;
  code: string;
  status: 'connecting' | 'waiting' | 'lobby' | 'playing' | 'disconnected' | 'error';
  error?: string;
  opponent: { name: string; deckId: string } | null;
  /** Guest only: the latest view received from the host. */
  remote: PlayerView | null;
  /** An undo request in flight: asked by us ('outgoing') or by the opponent ('incoming'). */
  undoRequest: 'outgoing' | 'incoming' | null;
  /** Guest only: strategy suggestions computed by the host on request. */
  suggestions: Suggestion[] | null;
}

export interface Settings {
  /** Pause for response windows at phase changes (Draw/Standby/End, start of Battle Phase ...). */
  askAtPhaseWindows: boolean;
  /** Learning mode: show both players' hands and face-down cards. */
  revealAll: boolean;
  /** Which player's side is at the bottom: a specific player, the turn player, or whoever must decide. */
  perspective: PlayerId | 'auto' | 'turn';
  animations: boolean;
  sound: boolean;
  music: boolean;
  musicVolume: number;
}

export interface StoreState {
  history: HistoryEntry[];
  pending: Pending | null;
  settings: Settings;
  /** Last illegal-move explanation to show. */
  notice: { title: string; text: string; kind: 'error' | 'info' } | null;
  config: GameConfig | null;
  /** Set while playing (or setting up) an online Duel. */
  online: OnlineState | null;
}

type Listener = () => void;

/** Online play routes player intents through the session layer instead of the local engine. */
export interface Interceptor {
  dispatch?: (a: Action) => void;
  answer?: (a: Answer) => void;
  cancelPending?: () => void;
  undo?: () => void;
}
let interceptor: Interceptor | null = null;
export function setInterceptor(i: Interceptor | null): void {
  interceptor = i;
}

const defaultSettings: Settings = { askAtPhaseWindows: false, revealAll: false, perspective: 'turn', animations: true, sound: true, music: true, musicVolume: 0.22 };

let store: StoreState = { history: [], pending: null, settings: loadSettings(), notice: null, config: null, online: null };
const listeners = new Set<Listener>();

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('ygo-trainer-settings');
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultSettings;
}

function set(partial: Partial<StoreState>): void {
  store = { ...store, ...partial };
  for (const l of listeners) l();
}

export function setOnline(online: OnlineState | null): void {
  set({ online });
}

export function updateOnline(partial: Partial<OnlineState>): void {
  if (store.online) set({ online: { ...store.online, ...partial } });
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getStore(): StoreState {
  return store;
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getStore);
}

/** The state to display: preview of the pending action, or the last committed state. */
export function currentView(s: StoreState = store): GameState | null {
  if (s.pending) return s.pending.view;
  return s.history.length ? s.history[s.history.length - 1].state : null;
}

export function committedState(s: StoreState = store): GameState | null {
  return s.history.length ? s.history[s.history.length - 1].state : null;
}

function describeAction(a: Action, state: GameState): string {
  const name = (uid: string) => {
    const c = state.cards[uid];
    return c ? getCard(c.cardId).name : '?';
  };
  const who = 'player' in a ? state.players[a.player].name : '';
  switch (a.type) {
    case 'START_GAME':
      return 'Duel start';
    case 'NORMAL_SUMMON':
      return `${who}: Normal Summon ${name(a.uid)}`;
    case 'SET_MONSTER':
      return `${who}: Set a monster`;
    case 'FLIP_SUMMON':
      return `${who}: Flip Summon ${name(a.uid)}`;
    case 'CHANGE_POSITION':
      return `${who}: change position of ${name(a.uid)}`;
    case 'SET_SPELL_TRAP':
      return `${who}: Set a Spell/Trap`;
    case 'ACTIVATE':
      return `${who}: activate ${name(a.uid)}`;
    case 'SPECIAL_SUMMON':
      return `${who}: Special Summon ${name(a.uid)}`;
    case 'GEMINI_SUMMON':
      return `${who}: Gemini Summon ${name(a.uid)}`;
    case 'PLACE_PENDULUM':
      return `${who}: place ${name(a.uid)} in a Pendulum Zone`;
    case 'PENDULUM_SUMMON':
      return `${who}: Pendulum Summon`;
    case 'DECLARE_ATTACK':
      return `${who}: ${name(a.uid)} attacks`;
    case 'TO_BATTLE_PHASE':
      return `${who}: enter Battle Phase`;
    case 'TO_MAIN2':
      return `${who}: enter Main Phase 2`;
    case 'TO_END_PHASE':
    case 'END_TURN':
      return `${who}: end turn`;
  }
}

const SETUP_LABEL = 'Setup';

/**
 * Deal the cards and start the first turn. Starting the Duel is an action like any other: the first
 * turn's phase windows may ask a player something (depending on settings), so it runs through the
 * same machinery, and the "Setup" entry is replaced by "Duel start" once it completes.
 */
export function newGame(config: GameConfig): void {
  const initial = createGame(config);
  set({ history: [{ state: initial, label: SETUP_LABEL }], pending: null, notice: null, config });
  runPending(initial, { type: 'START_GAME' }, [], 'Duel start');
}

/** The Duel so far as replayable data (the first step is the start of the Duel itself). */
export function saveDuel(s: StoreState = store): SavedDuel | null {
  if (!s.config || s.history.length === 0) return null;
  return { config: s.config, steps: s.history.map((h) => h.step!).filter(Boolean) };
}

/** Rebuild a history by replaying saved steps through the engine (deterministic). */
export function replayDuel(saved: SavedDuel): HistoryEntry[] {
  const initial = createGame(saved.config);
  const history: HistoryEntry[] = [{ state: initial, label: SETUP_LABEL }];
  const steps = saved.steps[0]?.action.type === 'START_GAME' ? saved.steps : [{ action: { type: 'START_GAME' } as Action, answers: [] }, ...saved.steps];
  for (const step of steps) {
    const base = history[history.length - 1].state;
    const r = execute(base, step.action, step.answers);
    if (!r.done) break;
    const entry = { state: r.state, label: describeAction(step.action, base), step };
    if (step.action.type === 'START_GAME') history.splice(0, history.length, entry);
    else history.push(entry);
  }
  return history;
}

export function restoreDuel(saved: SavedDuel): void {
  set({ history: replayDuel(saved), pending: null, notice: null, config: saved.config });
}

/** Should the store answer this prompt automatically (per settings)? */
function autoAnswer(prompt: Prompt): Answer | null {
  if (prompt.type === 'fastEffects' && prompt.windowKind === 'phase' && !store.settings.askAtPhaseWindows) {
    return { activation: null };
  }
  return null;
}

function runPending(base: GameState, action: Action, answers: Answer[], label: string): void {
  let all = answers.slice();
  for (let guard = 0; guard < 100; guard++) {
    const r = execute(base, action, all);
    if (r.error) {
      set({ pending: null, notice: { title: 'That move is not allowed', text: r.error, kind: 'error' } });
      return;
    }
    if (r.cancelled) {
      set({ pending: null });
      return;
    }
    if (r.done) {
      const entry: HistoryEntry = { state: r.state, label, step: { action, answers: all } };
      // Starting the Duel replaces the "Setup" entry: nothing can be undone to before the start.
      const history = action.type === 'START_GAME' ? [entry] : [...store.history, entry];
      set({ history, pending: null, notice: null });
      return;
    }
    const auto = autoAnswer(r.prompt!);
    if (auto) {
      all = [...all, auto];
      continue;
    }
    set({ pending: { action, answers: all, prompt: r.prompt!, view: r.state }, notice: null });
    return;
  }
}

export function dispatch(action: Action): void {
  if (interceptor?.dispatch) return interceptor.dispatch(action);
  localDispatch(action);
}

export function localDispatch(action: Action): void {
  const base = committedState();
  if (!base) return;
  if (store.pending) {
    set({ notice: { title: 'Finish the current decision first', text: 'A player still needs to answer the question on screen (or press Undo to back out).', kind: 'info' } });
    return;
  }
  runPending(base, action, [], describeAction(action, base));
}

export function answer(a: Answer): void {
  if (interceptor?.answer) return interceptor.answer(a);
  localAnswer(a);
}

export function localAnswer(a: Answer): void {
  const p = store.pending;
  const base = committedState();
  if (!p || !base) return;
  runPending(base, p.action, [...p.answers, a], describeAction(p.action, base));
}

export function cancelPending(): void {
  if (interceptor?.cancelPending) return interceptor.cancelPending();
  localCancelPending();
}

export function localCancelPending(): void {
  if (store.pending) set({ pending: null });
}

/** Undo one step: the last answer, the pending action, or the last committed action. */
export function undo(): void {
  if (interceptor?.undo) return interceptor.undo();
  localUndo();
}

export function localUndo(): void {
  const p = store.pending;
  if (p) {
    if (p.answers.length === 0) {
      // Nothing to undo before the Duel has started.
      if (p.action.type !== 'START_GAME') set({ pending: null, notice: null });
      return;
    }
    const base = committedState()!;
    // Remove the last *player-given* answer; automatic answers are re-derived on replay.
    const answers = p.answers.slice(0, -1);
    runPending(base, p.action, answers, describeAction(p.action, base));
    return;
  }
  if (store.history.length > 1) {
    set({ history: store.history.slice(0, -1), notice: null });
  }
}

/** Rewind to a specific point in history (index into history). */
export function rewindTo(index: number): void {
  if (index < 0 || index >= store.history.length) return;
  set({ history: store.history.slice(0, index + 1), pending: null, notice: null });
}

export function updateSettings(partial: Partial<Settings>): void {
  const settings = { ...store.settings, ...partial };
  try {
    localStorage.setItem('ygo-trainer-settings', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  set({ settings });
  // If a phase window is pending and the user just disabled asking, auto-pass it.
  const p = store.pending;
  if (p && !settings.askAtPhaseWindows && p.prompt.type === 'fastEffects' && p.prompt.windowKind === 'phase') {
    localAnswer({ activation: null });
  }
}

export function setNotice(notice: StoreState['notice']): void {
  set({ notice });
}

export function clearGame(): void {
  set({ history: [], pending: null, notice: null, config: null });
}

export { describeAction };
