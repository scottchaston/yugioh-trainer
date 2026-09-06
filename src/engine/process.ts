/**
 * Runs an action as a resumable process. The action is re-executed from the
 * base state each time a new answer is supplied, which keeps everything
 * deterministic and makes fine-grained Undo trivial.
 */
import { Game, GameOver, ActionCancelled } from './game';
import { runAction } from './actions';
import type { Action, Answer, GameState, Prompt } from './types';

export interface ExecutionResult {
  /** True when the action finished (no more questions). */
  done: boolean;
  /** Final state when done; otherwise a preview of the state at the moment of the question. */
  state: GameState;
  /** Question for a player (when not done). */
  prompt?: Prompt;
  /** The action was cancelled by the player (nothing happened). */
  cancelled?: boolean;
  /** The action was illegal. */
  error?: string;
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

export function execute(base: GameState, action: Action, answers: Answer[]): ExecutionResult {
  const state = cloneState(base);
  const g = new Game(state);
  const proc = runAction(g, action);
  let i = 0;
  try {
    let next = proc.next();
    while (!next.done) {
      const prompt = next.value;
      if (i < answers.length) {
        next = proc.next(answers[i++]);
      } else {
        return { done: false, state, prompt };
      }
    }
    // Any events left unprocessed are dropped at the end of an action.
    state.pendingEvents = [];
    return { done: true, state };
  } catch (e) {
    if (e instanceof GameOver) {
      state.winner = e.winner;
      state.winReason = e.reason;
      state.pendingEvents = [];
      state.chain = [];
      state.windowOpen = false;
      state.resolvingChain = false;
      return { done: true, state };
    }
    if (e instanceof ActionCancelled) {
      return { done: false, state: base, cancelled: true };
    }
    return { done: false, state: base, error: e instanceof Error ? e.message : String(e) };
  }
}
