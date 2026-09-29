/**
 * The computer opponent driven exactly as in the browser: through the store and the controller,
 * against a "human" who also plays through the store. Whenever it is the computer's move the
 * controller must make progress; a Duel must never get stuck.
 */
import { describe, expect, it } from 'vitest';
import '../src/effects';
import { aiDecide, type Difficulty } from '../src/ai';
import { computerToAct, installComputerOpponent, setAiPacing } from '../src/ai/controller';
import { clearGame, committedState, getStore, localAnswer, localDispatch, newGame, updateSettings } from '../src/state/store';
import { nextRandom } from '../src/engine/rng';
import type { PlayerId } from '../src/engine';

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function playThroughStore(level: Difficulty, humanLevel: Difficulty, seed: number, decks: [string, string], computerSeat: PlayerId, maxHumanMoves = 400) {
  clearGame();
  setAiPacing(0);
  installComputerOpponent();
  const human: PlayerId = computerSeat === 0 ? 1 : 0;
  const players = [
    { name: 'Human', deckId: decks[0] },
    { name: 'Computer', deckId: decks[1] },
  ] as [{ name: string; deckId: string; ai?: Difficulty }, { name: string; deckId: string; ai?: Difficulty }];
  players[computerSeat].ai = level;
  newGame({ players, firstPlayer: 0, seed });
  const rng = seededRng(seed);
  let humanMoves = 0;
  const humanActions = [0, 0];
  let lastTurn = -1;
  for (let guard = 0; guard < 5000; guard++) {
    // Let the controller's timers run (pacing 0 → next macrotask).
    let waited = 0;
    while (computerToAct() && waited < 200) {
      await tick();
      waited++;
    }
    const s = getStore();
    const committed = committedState(s)!;
    if (committed.winner !== null) return { winner: committed.winner, turn: committed.turn, humanMoves, stuck: false };
    if (computerToAct()) {
      return { winner: null, turn: committed.turn, humanMoves, stuck: true, detail: `${s.pending ? `prompt ${s.pending.prompt.type} "${s.pending.prompt.title}"` : `phase ${committed.phase}`} notice=${s.notice?.text ?? ''}` };
    }
    if (committed.turn !== lastTurn) {
      lastTurn = committed.turn;
      humanActions[0] = humanActions[1] = 0;
    }
    // The human's move (played by the easy/medium computer through the same store functions).
    const d = aiDecide(committed, s.pending, human, humanLevel, { rng, actionsThisTurn: humanActions[human] });
    if (!d) throw new Error(`human has no move: ${s.pending ? s.pending.prompt.type : committed.phase}`);
    humanMoves++;
    if (humanMoves > maxHumanMoves) return { winner: null, turn: committed.turn, humanMoves, stuck: false };
    if (d.kind === 'action') {
      humanActions[human]++;
      localDispatch(d.action);
    } else localAnswer(d.answer);
  }
  return { winner: null, turn: -1, humanMoves, stuck: true, detail: 'guard' };
}

describe('computer opponent through the store', () => {
  it('never gets stuck: many Duels, every level, both seats, all decks', async () => {
    const decks = ['sdbe', 'sdcb', 'sdbt', 'sdck'];
    const levels: Difficulty[] = ['easy', 'medium', 'hard'];
    const problems: string[] = [];
    let n = 0;
    const count = Number(process.env.AI_FUZZ ?? 16);
    for (let seed = 100; seed < 100 + count; seed++) {
      const level = levels[seed % 3];
      const d: [string, string] = [decks[seed % 4], decks[(seed * 7 + 1) % 4]];
      const seat = (seed % 2) as PlayerId;
      // Half the Duels also pause at the quieter phase windows (the human's setting applies to both seats).
      updateSettings({ askAtPhaseWindows: seed % 4 >= 2 });
      // The "human" is the medium computer: it Sets Traps and responds, which is where windows pile up.
      const r = await playThroughStore(level, seed % 5 === 0 ? 'hard' : 'medium', seed, d, seat);
      n++;
      if (r.stuck) problems.push(`seed ${seed} ${level} seat ${seat} ${d.join('/')} turn ${r.turn}: ${r.detail}`);
    }
    updateSettings({ askAtPhaseWindows: false });
    expect(n).toBe(count);
    expect(problems).toEqual([]);
  }, 1_800_000);
});
