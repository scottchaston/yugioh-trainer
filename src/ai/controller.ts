/**
 * Drives the computer opponent from the store: whenever it is the computer's move (its turn, or a
 * prompt addressed to it), decide after a short pause and feed the result back through the same
 * dispatch/answer functions a human's clicks use. Nothing here touches the rules.
 *
 * It is built so the computer can never sit idle: every decision is wrapped in a fallback (end the
 * turn, decline, take the first option), moves that make no progress are remembered and not
 * retried, and a watchdog re-checks every couple of seconds (timers can be paused by phones).
 */
import { committedState, getStore, localAnswer, localDispatch, localUndo, setNotice, subscribe } from '../state/store';
import { getLegalActions } from '../engine';
import type { Answer, PlayerId, Prompt } from '../engine';
import { actionSignature, aiDecide, type AiDecision, type Difficulty } from './player';

let timer: ReturnType<typeof setTimeout> | null = null;
let installed = false;
/** Pause before each move (ms); tests set it to 0. */
let pacing = { action: 900, answer: 450 };
export function setAiPacing(action: number, answer = action): void {
  pacing = { action, answer };
}
/** Actions the engine rejected for a given history length (so they are not retried forever). */
let rejected: { at: number; set: Set<string> } = { at: -1, set: new Set() };
/** Consecutive steps that made no progress. */
let failures = 0;
let stepping = false;
let thinking = false;
const thinkingListeners = new Set<(on: boolean) => void>();
/** Diagnostics for bug reports: the last few things the computer did or failed to do. */
export const aiTrace: string[] = [];
function trace(msg: string): void {
  aiTrace.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
  if (aiTrace.length > 40) aiTrace.shift();
}

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

/** The safest possible answer to a prompt (always legal unless the engine itself is confused). */
function minimalAnswer(p: Prompt): Answer {
  switch (p.type) {
    case 'fastEffects':
      return { activation: null };
    case 'selectOption':
      return { option: p.options[0]?.id ?? '' };
    case 'selectZone':
      return { zone: p.zones[0] };
    case 'selectCards':
      return { cards: p.cards.slice(0, p.min) };
  }
}

/** When the real decision failed: end the turn / decline / take the first option. */
function fallbackDecision(seat: PlayerId): AiDecision | null {
  const s = getStore();
  if (s.pending) return { kind: 'answer', answer: minimalAnswer(s.pending.prompt), label: 'fallback answer' };
  const committed = committedState(s);
  if (!committed) return null;
  const legal = getLegalActions(committed, seat).filter((a) => a.legal && !rejected.set.has(actionSignature(a.action)));
  for (const t of ['END_TURN', 'TO_MAIN2', 'TO_BATTLE_PHASE'] as const) {
    const a = legal.find((x) => x.action.type === t);
    if (a) return { kind: 'action', action: a.action, label: `fallback: ${a.label}` };
  }
  return legal[0] ? { kind: 'action', action: legal[0].action, label: `fallback: ${legal[0].label}` } : null;
}

function step(): void {
  timer = null;
  if (stepping) return;
  const c = computerSeat();
  if (!c || !computerToAct()) {
    setThinking(false);
    return;
  }
  stepping = true;
  try {
    const s = getStore();
    const committed = committedState(s)!;
    if (rejected.at !== s.history.length) rejected = { at: s.history.length, set: new Set() };
    let decision: AiDecision | null = null;
    if (failures < 3) {
      try {
        decision = aiDecide(committed, s.pending, c.seat, c.level, { exclude: rejected.set, actionsThisTurn: actionsThisTurn(c.seat) });
      } catch (e) {
        trace(`decision error: ${(e as Error)?.message ?? e}`);
        console.error('[computer] decision failed', e);
      }
    }
    if (!decision) {
      decision = fallbackDecision(c.seat);
      trace(`using fallback: ${decision?.label ?? 'none available'}`);
    }
    setThinking(false);
    if (!decision) {
      failures++;
      if (failures >= 6) {
        setNotice({ title: 'The computer is stuck', text: 'It could not find any legal move. Press Undo to take the Duel back a step, or start a new Duel.', kind: 'error' });
        failures = 0;
      }
      return;
    }
    const before = { history: s.history.length, pending: !!s.pending, answers: s.pending?.answers.length ?? -1 };
    const pendingSig = s.pending ? actionSignature(s.pending.action) : null;
    if (decision.kind === 'action') localDispatch(decision.action);
    else localAnswer(decision.answer);
    const after = getStore();
    const progressed = after.history.length !== before.history || !!after.pending !== before.pending || (after.pending?.answers.length ?? -1) !== before.answers;
    if (!progressed) {
      failures++;
      if (decision.kind === 'action') rejected.set.add(actionSignature(decision.action));
      trace(`no progress after "${decision.label}" (${after.notice?.text ?? 'no notice'})`);
    } else if (decision.kind === 'answer' && !after.pending && after.history.length === before.history && pendingSig) {
      // The answer was refused and the whole action was dropped: do not start that action again.
      rejected.set.add(pendingSig);
      failures++;
      trace(`answer "${decision.label}" refused: ${after.notice?.text ?? ''}`);
    } else {
      failures = 0;
      trace(decision.label);
    }
  } finally {
    stepping = false;
  }
}

function schedule(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!computerToAct()) {
    setThinking(false);
    failures = 0;
    return;
  }
  setThinking(true);
  const s = getStore();
  // A little pacing so the human can follow: quicker for answers inside an action.
  const delay = s.pending ? pacing.answer : pacing.action;
  timer = setTimeout(step, delay);
}

/** Start watching the store (idempotent). */
export function installComputerOpponent(): void {
  if (installed) return;
  installed = true;
  subscribe(schedule);
  schedule();
  // Watchdog: if a timer was lost (phones pause timers in the background), get going again.
  const watchdog = setInterval(() => {
    if (computerToAct() && timer === null && !stepping) schedule();
  }, 2000);
  (watchdog as unknown as { unref?: () => void }).unref?.();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedule();
    });
  }
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
