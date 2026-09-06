import { describe, it, expect } from 'vitest';
import { makeGame, start, endTurn, put, A } from './harness';

/** Set up: P1 goes first, ends turn; P2 (turn 2) can battle. */
function battleReady() {
  const tg = makeGame();
  start(tg);
  endTurn(tg);
  return tg;
}

describe('battle', () => {
  it('direct attack inflicts full ATK damage', () => {
    const tg = battleReady();
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1 }); // 1600
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: tiger });
    expect(tg.state.players[0].lp).toBe(8000 - 1600);
    expect(tg.card(tiger).attacksDeclaredThisTurn).toBe(1);
    expect(tg.expectIllegal({ type: 'DECLARE_ATTACK', player: 1, uid: tiger })).toMatch(/already attacked/i);
  });

  it('attack vs Attack Position: lower ATK destroyed, difference as damage', () => {
    const tg = battleReady();
    const luster = put(tg, 0, 'Luster Dragon', 'monster'); // 1900
    const pegasus = put(tg, 1, 'Crystal Beast Sapphire Pegasus', 'monster', { turnEnteredField: 1 }); // 1800
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    // Only one target -> auto-selected. Pegasus is a Crystal Beast: decline placing it in the S/T Zone.
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: pegasus }, A.no());
    expect(tg.card(pegasus).zone).toBe('graveyard');
    expect(tg.card(luster).zone).toBe('monster');
    expect(tg.state.players[1].lp).toBe(8000 - 100);
    expect(tg.state.players[0].lp).toBe(8000);
  });

  it('attacker wins: target destroyed and controller takes difference', () => {
    const tg = battleReady();
    const angel = put(tg, 0, 'Shining Angel', 'monster'); // 1400 ATK
    put(tg, 0, 'Kaibaman', 'monster');
    const mammoth = put(tg, 1, 'Crystal Beast Amber Mammoth', 'monster', { turnEnteredField: 1 }); // 1700
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    // Two targets: must choose. Shining Angel's optional effect will prompt (decline).
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: mammoth }, A.cards(angel), A.no());
    expect(tg.card(angel).zone).toBe('graveyard');
    expect(tg.state.players[0].lp).toBe(8000 - 300);
  });

  it('equal ATK: both destroyed, no damage', () => {
    const tg = battleReady();
    const a = put(tg, 0, 'Kaiser Sea Horse', 'monster'); // 1700
    const b = put(tg, 1, 'Crystal Beast Amber Mammoth', 'monster', { turnEnteredField: 1 }); // 1700
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: b }, A.no());
    expect(tg.card(a).zone).toBe('graveyard');
    expect(tg.card(b).zone).toBe('graveyard');
    expect(tg.state.players[0].lp).toBe(8000);
    expect(tg.state.players[1].lp).toBe(8000);
  });

  it('DEF battles', () => {
    const tg = makeGame({ decks: ['sdcb', 'sdbe'] });
    start(tg);
    endTurn(tg);
    // P1 (sdcb) has Emerald Tortoise DEF 2000; P2 (sdbe) attacks with Luster Dragon 1900 and Kaiser Glider 2400
    const tortoise = put(tg, 0, 'Crystal Beast Emerald Tortoise', 'monster', { position: 'DEF' });
    const luster = put(tg, 1, 'Luster Dragon', 'monster', { turnEnteredField: 1 });
    const glider = put(tg, 1, 'Kaiser Glider', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: luster });
    expect(tg.card(tortoise).zone).toBe('monster');
    expect(tg.card(luster).zone).toBe('monster');
    expect(tg.state.players[1].lp).toBe(8000 - 100);
    expect(tg.state.players[0].lp).toBe(8000);
    // Emerald Tortoise is a Crystal Beast: its controller chooses to place it in the S/T Zone instead of the GY.
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: glider }, A.yes(), A.zone(0, 'spellTrap', 0));
    expect(tg.card(tortoise).zone).toBe('spellTrap');
    expect(tg.state.players[0].lp).toBe(8000);
  });

  it('a face-down monster is flipped before damage calculation and stays in Defense', () => {
    const tg = battleReady();
    const rabid = put(tg, 0, 'Rabidragon', 'monster', { position: 'DEF', faceUp: false }); // DEF 2900
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1 }); // 1600
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: tiger });
    expect(tg.card(rabid).faceUp).toBe(true);
    expect(tg.card(rabid).position).toBe('DEF');
    // Topaz Tiger gains 400 ATK during the Damage Step when attacking a monster: 2000 vs DEF 2900
    expect(tg.state.players[1].lp).toBe(8000 - 900);
  });

  it('Defense Position monsters cannot attack; must attack a monster if opponent has one', () => {
    const tg = battleReady();
    put(tg, 0, 'Luster Dragon', 'monster');
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1, position: 'DEF' });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    expect(tg.expectIllegal({ type: 'DECLARE_ATTACK', player: 1, uid: tiger })).toMatch(/Defense Position cannot attack/i);
  });

  it('cannot attack outside the Battle Phase', () => {
    const tg = battleReady();
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1 });
    expect(tg.expectIllegal({ type: 'DECLARE_ATTACK', player: 1, uid: tiger })).toMatch(/Battle Phase/);
  });

  it('LP reaching 0 ends the duel', () => {
    const tg = battleReady();
    tg.state.players[0].lp = 1000;
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: tiger });
    expect(tg.state.winner).toBe(1);
    expect(tg.state.players[0].lp).toBe(0);
  });
});
