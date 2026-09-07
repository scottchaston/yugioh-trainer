import { describe, expect, it } from 'vitest';
import { createGame, execute } from '../src/engine';
import type { Action, Answer, GameState, PlayerId, Prompt } from '../src/engine';
import '../src/effects';
import { aiDecide, evaluate, type Difficulty } from '../src/ai';
import { nextRandom } from '../src/engine/rng';
import { makeGame, put, start, endTurn } from './harness';

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
}

/** Minimal store: runs actions to completion, letting the computer answer prompts addressed to it. */
function driver(levels: [Difficulty, Difficulty], seed: number, decks: [string, string], maxSteps = 700) {
  let state = createGame({ players: [{ name: 'A', deckId: decks[0] }, { name: 'B', deckId: decks[1] }], firstPlayer: 0, seed });
  const rng = seededRng(seed);
  const log: string[] = [];
  type Pending = { action: Action; answers: Answer[]; prompt: Prompt };
  const box: { pending: Pending | null } = { pending: null };
  const run = (action: Action, answers: Answer[]): void => {
    const r = execute(state, action, answers);
    if (r.error) throw new Error(`${action.type} rejected: ${r.error}\n${log.slice(-8).join('\n')}`);
    if (r.cancelled) {
      box.pending = null;
      return;
    }
    if (r.done) {
      state = r.state;
      box.pending = null;
      return;
    }
    const p = r.prompt!;
    // Phase windows are auto-declined, as the store does by default.
    if (p.type === 'fastEffects' && p.windowKind === 'phase') return run(action, [...answers, { activation: null }]);
    box.pending = { action, answers, prompt: p };
  };
  run({ type: 'START_GAME' }, []);
  let steps = 0;
  const actionsThisTurn = [0, 0];
  let lastTurn = state.turn;
  while (state.winner === null && steps < maxSteps) {
    steps++;
    if (state.turn !== lastTurn) {
      lastTurn = state.turn;
      actionsThisTurn[0] = actionsThisTurn[1] = 0;
    }
    const pending = box.pending;
    const seat: PlayerId = pending ? pending.prompt.player : state.turnPlayer;
    const d = aiDecide(state, pending, seat, levels[seat], { rng, actionsThisTurn: actionsThisTurn[seat] });
    if (!d) throw new Error(`no decision for player ${seat} (${pending ? pending.prompt.type : state.phase})`);
    log.push(`T${state.turn} ${seat}: ${d.label}`);
    if (d.kind === 'action') {
      actionsThisTurn[seat]++;
      run(d.action, []);
    } else {
      run(pending!.action, [...pending!.answers, d.answer]);
    }
  }
  return { state, steps, log };
}

describe('computer opponent', () => {
  it('plays whole Duels against itself without illegal moves (all decks, all levels)', () => {
    const combos: [[Difficulty, Difficulty], [string, string], number][] = [
      [['easy', 'hard'], ['sdbe', 'sdcb'], 11],
      [['medium', 'medium'], ['sdbt', 'sdck'], 12],
      [['hard', 'easy'], ['sdck', 'sdbe'], 13],
      [['hard', 'hard'], ['sdcb', 'sdbt'], 14],
    ];
    for (const [levels, decks, seed] of combos) {
      const r = driver(levels, seed, decks);
      expect(r.state.turn).toBeGreaterThan(3);
    }
  }, 180_000);

  it('hard beats easy most of the time', () => {
    let hardWins = 0;
    let duels = 0;
    for (let seed = 20; seed < 25; seed++) {
      const r = driver(['hard', 'easy'], seed, ['sdbe', 'sdbe']);
      if (r.state.winner !== null) {
        duels++;
        if (r.state.winner === 0) hardWins++;
      }
    }
    expect(duels).toBeGreaterThan(0);
    expect(hardWins).toBeGreaterThanOrEqual(Math.ceil(duels * 0.6));
  }, 180_000);

  it('medium Summons its strongest monster on an empty board; hard Sets when outclassed', () => {
    const tg = makeGame({ decks: ['sdbe', 'sdbe'], seed: 5 });
    start(tg);
    const luster = put(tg, 0, 'Luster Dragon', 'hand');
    put(tg, 0, 'The White Stone of Legend', 'hand');
    const d = aiDecide(tg.state, null, 0, 'medium', { rng: () => 0.5 });
    expect(d && d.kind === 'action' ? d.action : null).toMatchObject({ type: 'NORMAL_SUMMON', uid: luster });

    const th = makeGame({ decks: ['sdbe', 'sdbe'], seed: 6 });
    start(th);
    put(th, 1, 'Blue-Eyes White Dragon', 'monster', { faceUp: true, position: 'ATK' });
    put(th, 0, 'Luster Dragon', 'hand');
    const dh = aiDecide(th.state, null, 0, 'hard', { rng: () => 0.5 });
    expect(dh && dh.kind === 'action' ? dh.action.type : '').toBe('SET_MONSTER');
  });

  it('hard responds with Trap Hole to a Summon it can punish', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const hole = put(tg, 0, 'Trap Hole', 'spellTrap', { turnEnteredField: 0 });
    endTurn(tg);
    const luster = put(tg, 1, 'Luster Dragon', 'hand');
    const action: Action = { type: 'NORMAL_SUMMON', player: 1, uid: luster };
    const answers: Answer[] = [];
    let r = execute(tg.state, action, answers);
    for (let i = 0; i < 10 && !r.done; i++) {
      const p = r.prompt!;
      if (p.type === 'fastEffects' && p.player === 0 && p.options.some((o) => o.uid === hole)) break;
      answers.push(p.type === 'selectZone' ? { zone: p.zones[0] } : p.type === 'fastEffects' ? { activation: null } : p.type === 'selectOption' ? { option: p.options[0].id } : { cards: p.cards.slice(0, p.min) });
      r = execute(tg.state, action, answers);
    }
    expect(r.done).toBe(false);
    const prompt = r.prompt!;
    expect(prompt.type).toBe('fastEffects');
    const d = aiDecide(tg.state, { action, answers, prompt }, 0, 'hard');
    expect(d && d.kind === 'answer' ? d.answer.activation?.uid : null).toBe(hole);
    // Easy with a low random roll leaves it alone.
    const e = aiDecide(tg.state, { action, answers, prompt }, 0, 'easy', { rng: () => 0.9 });
    expect(e && e.kind === 'answer' ? e.answer.activation : undefined).toBeNull();
  });

  it('evaluation prefers more Life Points and a stronger board', () => {
    const tg = makeGame({ decks: ['sdbe', 'sdbe'], seed: 8 });
    start(tg);
    const base = evaluate(tg.state, 0, 'hard');
    const s2: GameState = structuredClone(tg.state);
    s2.players[1].lp = 4000;
    expect(evaluate(s2, 0, 'hard')).toBeGreaterThan(base);
    put(tg, 0, 'Blue-Eyes White Dragon', 'monster', { faceUp: true, position: 'ATK' });
    expect(evaluate(tg.state, 0, 'hard')).toBeGreaterThan(base);
  });
});
