import { describe, it, expect } from 'vitest';
import { makeGame, start, put } from './harness';

describe('legal action listing (What can I do?)', () => {
  it('lists Normal Summon as legal and explains illegal actions', () => {
    const tg = makeGame();
    start(tg);
    const luster = put(tg, 0, 'Luster Dragon', 'hand');
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'hand');
    const actions = tg.legal(0);
    const ns = actions.find((a) => a.uid === luster && a.action.type === 'NORMAL_SUMMON');
    expect(ns?.legal).toBe(true);
    expect(ns?.rule).toMatch(/Level 4 or lower/);
    const ts = actions.find((a) => a.uid === bewd && a.action.type === 'NORMAL_SUMMON');
    expect(ts?.legal).toBe(false);
    expect(ts?.reason).toMatch(/2 Tributes/);
    const bp = actions.find((a) => a.action.type === 'TO_BATTLE_PHASE');
    expect(bp?.legal).toBe(false);
    expect(bp?.reason).toMatch(/first turn/i);
  });

  it('shows no actions for the non-turn player', () => {
    const tg = makeGame();
    start(tg);
    const actions = tg.legal(1).filter((a) => a.legal);
    expect(actions.length).toBe(0);
  });
});
