import { describe, it, expect } from 'vitest';
import { makeGame, start, endTurn, put, A } from './harness';
import { Game } from '../src/engine';

describe('Crystal Beasts: placed in the Spell & Trap Zone instead of being destroyed', () => {
  it('a Crystal Beast destroyed by battle can become a Continuous Spell', () => {
    const tg = makeGame();
    start(tg);
    const tortoise = put(tg, 1, 'Crystal Beast Emerald Tortoise', 'monster');
    endTurn(tg);
    endTurn(tg);
    const glider = put(tg, 0, 'Kaiser Glider', 'monster', { turnEnteredField: 1 }); // 2400 > DEF 2000
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    tg.card(tortoise).position = 'DEF';
    const r = tg.runPartial({ type: 'DECLARE_ATTACK', player: 0, uid: glider });
    expect(r.prompt?.type).toBe('selectOption');
    expect(r.prompt?.player).toBe(1);
    expect(r.prompt?.title).toMatch(/Continuous Spell/);
    tg.run({ type: 'DECLARE_ATTACK', player: 0, uid: glider }, A.yes(), A.zone(1, 'spellTrap', 2));
    const c = tg.card(tortoise);
    expect(c.zone).toBe('spellTrap');
    expect(c.index).toBe(2);
    expect(c.faceUp).toBe(true);
    expect(c.treatedAsSpell).toBe('continuous');
    // It is not a monster any more: no monsters on P2's field
    expect(new Game(tg.state).fieldMonsters(1).length).toBe(0);
    expect(tg.state.players[1].lp).toBe(8000);
  });

  it('declining sends it to the Graveyard; no free Spell & Trap Zone means no choice', () => {
    const tg = makeGame();
    start(tg);
    const cat = put(tg, 1, 'Crystal Beast Amethyst Cat', 'monster');
    endTurn(tg);
    endTurn(tg);
    const glider = put(tg, 0, 'Kaiser Glider', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    tg.run({ type: 'DECLARE_ATTACK', player: 0, uid: glider }, A.no());
    expect(tg.card(cat).zone).toBe('graveyard');
  });

  it('a Crystal Beast destroyed by a card effect can also be placed; a face-down one cannot', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    endTurn(tg);
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster');
    const eagle = put(tg, 1, 'Crystal Beast Cobalt Eagle', 'monster', { faceUp: false, position: 'DEF' });
    put(tg, 0, 'Blue-Eyes White Dragon', 'monster', { turnEnteredField: 1 });
    const burst = put(tg, 0, 'Burst Stream of Destruction', 'hand');
    tg.run({ type: 'ACTIVATE', player: 0, uid: burst, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.yes(), A.zone(1, 'spellTrap', 0));
    expect(tg.card(tiger).zone).toBe('spellTrap');
    expect(tg.card(eagle).zone).toBe('graveyard');
  });

  it('Rainbow Dragon cannot be Normal Summoned or Set', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    const rd = put(tg, 1, 'Rainbow Dragon', 'hand');
    for (const m of ['Crystal Beast Topaz Tiger', 'Crystal Beast Cobalt Eagle']) put(tg, 1, m, 'monster');
    expect(tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 1, uid: rd })).toMatch(/cannot be Normal Summoned or Set/);
    expect(tg.expectIllegal({ type: 'SET_MONSTER', player: 1, uid: rd })).toMatch(/cannot be Normal Summoned or Set/);
  });
});
