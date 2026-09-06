import { describe, it, expect } from 'vitest';
import { makeGame, start, endTurn, put, A } from './harness';

describe('Normal Summon / Set', () => {
  it('Normal Summons a Level 4 monster without tribute, once per turn', () => {
    const tg = makeGame();
    start(tg);
    const luster = put(tg, 0, 'Luster Dragon', 'hand');
    const alex = put(tg, 0, 'Alexandrite Dragon', 'hand');
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: luster }, A.zone(0, 'monster', 2));
    const c = tg.card(luster);
    expect(c.zone).toBe('monster');
    expect(c.index).toBe(2);
    expect(c.faceUp).toBe(true);
    expect(c.position).toBe('ATK');
    const reason = tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 0, uid: alex });
    expect(reason).toMatch(/already Normal Summoned/i);
    // Also cannot Set after summoning
    expect(tg.expectIllegal({ type: 'SET_MONSTER', player: 0, uid: alex })).toMatch(/already Normal Summoned/i);
  });

  it('requires 1 tribute for Level 5-6 and 2 tributes for Level 7+', () => {
    const tg = makeGame();
    start(tg);
    const glider = put(tg, 0, 'Kaiser Glider', 'hand'); // Level 6
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'hand'); // Level 8
    expect(tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 0, uid: glider })).toMatch(/1 Tribute/);
    expect(tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 0, uid: bewd })).toMatch(/2 Tributes/);
    const m1 = put(tg, 0, 'Luster Dragon', 'monster');
    expect(tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 0, uid: bewd })).toMatch(/2 Tributes/);
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: glider }, A.zone(0, 'monster', 0));
    expect(tg.card(m1).zone).toBe('graveyard');
    expect(tg.card(glider).zone).toBe('monster');
    expect(tg.log().some((l) => l.includes('Tribute Summons Kaiser Glider'))).toBe(true);
  });

  it('Tribute Summons Blue-Eyes with 2 tributes', () => {
    const tg = makeGame();
    start(tg);
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'hand');
    const m1 = put(tg, 0, 'Luster Dragon', 'monster');
    const m2 = put(tg, 0, 'Alexandrite Dragon', 'monster');
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: bewd }, A.zone(0, 'monster', 0));
    expect(tg.card(bewd).zone).toBe('monster');
    expect(tg.card(m1).zone).toBe('graveyard');
    expect(tg.card(m2).zone).toBe('graveyard');
  });

  it('Sets a monster face-down and cannot Flip Summon it the same turn', () => {
    const tg = makeGame();
    start(tg);
    const luster = put(tg, 0, 'Luster Dragon', 'hand');
    tg.run({ type: 'SET_MONSTER', player: 0, uid: luster }, A.zone(0, 'monster', 0));
    const c = tg.card(luster);
    expect(c.faceUp).toBe(false);
    expect(c.position).toBe('DEF');
    expect(tg.expectIllegal({ type: 'FLIP_SUMMON', player: 0, uid: luster })).toMatch(/same turn it was Set/i);
    endTurn(tg);
    endTurn(tg);
    tg.run({ type: 'FLIP_SUMMON', player: 0, uid: luster });
    expect(tg.card(luster).faceUp).toBe(true);
    expect(tg.card(luster).position).toBe('ATK');
  });

  it('cannot Normal Summon an Extra Deck monster or a card that says it cannot be Normal Summoned', () => {
    const tg = makeGame();
    start(tg);
    const azure = tg.find(0, 'Azure-Eyes Silver Dragon');
    expect(tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 0, uid: azure })).toMatch(/not in your hand|Extra Deck/i);
  });

  it('needs a free Monster Zone', () => {
    const tg = makeGame();
    start(tg);
    for (let i = 0; i < 5; i++) put(tg, 0, ['Luster Dragon', 'Alexandrite Dragon', 'Rabidragon', 'Mirage Dragon', 'Kaibaman'][i], 'monster');
    const angel = put(tg, 0, 'Shining Angel', 'hand');
    expect(tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 0, uid: angel })).toMatch(/Monster Zones are full/i);
  });
});

describe('battle position changes', () => {
  it('cannot change position the turn a monster was summoned, once per turn afterwards', () => {
    const tg = makeGame();
    start(tg);
    const luster = put(tg, 0, 'Luster Dragon', 'hand');
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: luster }, A.zone(0, 'monster', 0));
    expect(tg.expectIllegal({ type: 'CHANGE_POSITION', player: 0, uid: luster })).toMatch(/same turn it was Summoned/i);
    endTurn(tg);
    endTurn(tg);
    tg.run({ type: 'CHANGE_POSITION', player: 0, uid: luster });
    expect(tg.card(luster).position).toBe('DEF');
    expect(tg.expectIllegal({ type: 'CHANGE_POSITION', player: 0, uid: luster })).toMatch(/already changed/i);
  });

  it('cannot change position after attacking', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    const luster = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: luster });
    tg.run({ type: 'TO_MAIN2', player: 1 });
    expect(tg.expectIllegal({ type: 'CHANGE_POSITION', player: 1, uid: luster })).toMatch(/already attacked/i);
  });
});
