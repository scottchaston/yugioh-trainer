/**
 * Drives the computer opponent from the store: whenever it is the computer's move (its turn, or a
 * prompt addressed to it), decide after a short pause and feed the result back through the same
 * dispatch/answer functions a human's clicks use. Nothing here touches the rules.
 */
import { committedState, getStore, localAnswer, localDispatch, localUndo, subscribe } from '../state/store';
import type { PlayerId } from '../engine';
import { actionSignature, aiDecide, type Difficulty } from './player';

let timer: number | null = null;
let installed = false;
/** Actions the engine rejected for a given history length (so they are not retried forever). */
let rejected: { at: number; set: Set<string> } = { at: -1, set: new Set() };
let thinking = false;
const thinkingListeners = new Set<(on: boolean) => void>();

export function onAiThinking(l: (on: boolean) => void): () => void {
  thinkingListeners.add(l);
  return () => thinkingListeners.delete(l);
}
function setThinking(on: boolean): void {
  if (thinking === on) return;
  thinking = on;
  for (const l of thinkingListeners) l(on);
}

/** The computer's seat and level in the current Duel, if any. */
export function computerSeat(): { seat: PlayerId; level: Difficulty } | null {
  const cfg = getStore().config;
  if (!cfg || getStore().online) return null;
  const idx = cfg.players.findIndex((p) => p.ai);
  if (idx < 0) return null;
  return { seat: idx as PlayerId, level: cfg.players[idx].ai! };
}

/** True while the computer must act (its turn, or a question addressed to it). */
export function computerToAct(): boolean {
  const c = computerSeat();
  if (!c) return false;
  const s = getStore();
  const committed = committedState(s);
  if (!committed || committed.winner !== null) return false;
  if (s.pending) return s.pending.prompt.player === c.seat;
  return committed.started && committed.turnPlayer === c.seat;
}

function actionsThisTurn(seat: PlayerId): number {
  const h = getStore().history;
  let n = 0;
  for (let i = h.length - 1; i > 0; i--) {
    const st = h[i].state;
    if (st.turnPlayer !== seat) break;
    if (h[i].step?.action && 'player' in h[i].step!.action && (h[i].step!.action as { player?: PlayerId }).player === seat) n++;
    if (h[i - 1].state.turn !== st.turn) break;
  }
  return n;
}

function step(): void {
  timer = null;
  const c = computerSeat();
  if (!c || !computerToAct()) {
    setThinking(false);
    return;
  }
  const s = getStore();
  const committed = committedState(s)!;
  if (rejected.at !== s.history.length) rejected = { at: s.history.length, set: new Set() };
  const decision = aiDecide(committed, s.pending, c.seat, c.level, { exclude: rejected.set, actionsThisTurn: actionsThisTurn(c.seat) });
  setThinking(false);
  if (!decision) return;
  if (decision.kind === 'action') {
    const before = getStore().history.length;
    localDispatch(decision.action);
    const after = getStore();
    // Rejected by the engine (the notice says why): remember and try something else.
    if (after.history.length === before && !after.pending && after.notice?.kind === 'error') rejected.set.add(actionSignature(decision.action));
  } else {
    localAnswer(decision.answer);
  }
}

function schedule(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!computerToAct()) {
    setThinking(false);
    return;
  }
  setThinking(true);
  const s = getStore();
  // A little pacing so the human can follow: quicker for answers inside an action.
  const delay = s.pending ? 450 : 900;
  timer = window.setTimeout(step, delay);
}

/** Start watching the store (idempotent). */
export function installComputerOpponent(): void {
  if (installed) return;
  installed = true;
  subscribe(schedule);
  schedule();
}

/**
 * Undo for a Duel against the computer: step back until it is the human's decision again, so one press
 * takes back the human's last move even when the computer has played since.
 */
export function undoAgainstComputer(): void {
  const c = computerSeat();
  if (!c) return localUndo();
  const human: PlayerId = c.seat === 0 ? 1 : 0;
  for (let i = 0; i < 400; i++) {
    const s = getStore();
    const committed = committedState(s);
    if (!committed) return;
    const humanToAct = s.pending ? s.pending.prompt.player === human : committed.turnPlayer === human;
    // The first press must always undo something; afterwards stop as soon as the human is to act.
    if (i > 0 && humanToAct) return;
    if (s.history.length <= 1 && !s.pending) return;
    localUndo();
  }
}
