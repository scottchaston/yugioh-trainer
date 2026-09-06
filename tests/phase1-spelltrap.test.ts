import { describe, it, expect } from 'vitest';
import { makeGame, start, endTurn, put, A } from './harness';
import { Game } from '../src/engine';

describe('Spell/Trap setting and timing', () => {
  it('Sets a Trap and cannot activate it the same turn; can activate on the next turn', () => {
    const tg = makeGame();
    start(tg);
    const ced = put(tg, 0, 'Compulsory Evacuation Device', 'hand');
    tg.run({ type: 'SET_SPELL_TRAP', player: 0, uid: ced }, A.zone(0, 'spellTrap', 1));
    expect(tg.card(ced).zone).toBe('spellTrap');
    expect(tg.card(ced).faceUp).toBe(false);
    put(tg, 0, 'Luster Dragon', 'monster');
    const reason = tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: ced, effectId: 'activate' });
    expect(reason).toMatch(/Set it during this turn/i);
    // Trap in hand cannot be activated
    const ced2 = put(tg, 0, 'Kunai with Chain', 'hand');
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: ced2, effectId: 'activate' })).toMatch(/must be Set/i);
    // Opponent's turn: when P2 summons, P1 gets a response window and can activate CED.
    endTurn(tg);
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'hand');
    const r = tg.runPartial({ type: 'NORMAL_SUMMON', player: 1, uid: tiger }, A.zone(1, 'monster', 0));
    expect(r.done).toBe(false);
    expect(r.prompt?.type).toBe('fastEffects');
    if (r.prompt?.type === 'fastEffects') {
      expect(r.prompt.player).toBe(0);
      expect(r.prompt.options.map((o) => o.uid)).toContain(ced);
    }
    tg.run({ type: 'NORMAL_SUMMON', player: 1, uid: tiger }, A.zone(1, 'monster', 0), A.activate(ced), A.cards(tiger));
    expect(tg.card(tiger).zone).toBe('hand');
    expect(tg.card(ced).zone).toBe('graveyard');
  });

  it('Normal Spell activates from hand during own Main Phase and goes to the Graveyard after resolving', () => {
    const tg = makeGame();
    start(tg);
    const shrine = put(tg, 0, 'Dragon Shrine', 'hand');
    // choose Blue-Eyes (Normal) then a second Dragon
    const bewd = tg.find(0, 'Blue-Eyes White Dragon', 'deck');
    const rabid = tg.find(0, 'Rabidragon', 'deck');
    tg.run({ type: 'ACTIVATE', player: 0, uid: shrine, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.cards(bewd), A.yes(), A.cards(rabid));
    expect(tg.card(bewd).zone).toBe('graveyard');
    expect(tg.card(rabid).zone).toBe('graveyard');
    expect(tg.card(shrine).zone).toBe('graveyard');
    const log = tg.log();
    expect(log.some((l) => l.includes('Dragon Shrine permits'))).toBe(true);
    expect(log.some((l) => l.includes('finishes resolving'))).toBe(true);
    // Only one Dragon Shrine per turn
    const shrine2 = put(tg, 0, 'Dragon Shrine', 'hand'); // (moves the same card back to hand)
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: shrine2, effectId: 'activate' })).toMatch(/only activate 1/i);
  });

  it('Normal Spell cannot be activated during the Battle Phase or on the opponent turn', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    const reborn = put(tg, 0, 'Monster Reborn', 'hand');
    put(tg, 0, 'Luster Dragon', 'graveyard');
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: reborn, effectId: 'activate' })).toMatch(/own turn/i);
    endTurn(tg);
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: reborn, effectId: 'activate' })).toMatch(/Main Phase/i);
  });

  it("Quick-Play Spell (Silver's Cry): from hand on own turn, not from hand on opponent's turn, not the turn it was Set, usable from Set next turn", () => {
    const tg = makeGame();
    start(tg);
    const cry = put(tg, 0, "Silver's Cry", 'hand');
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'graveyard');
    // From hand on own turn: legal
    const legal = tg.legal(0).find((a) => a.uid === cry && a.action.type === 'ACTIVATE');
    expect(legal?.legal).toBe(true);
    // Set it
    tg.run({ type: 'SET_SPELL_TRAP', player: 0, uid: cry }, A.zone(0, 'spellTrap', 0));
    const reason = tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: cry, effectId: 'activate' });
    expect(reason).toMatch(/Set this turn/i);
    // Opponent's turn: P2 summons → P1 may respond with the Set Silver's Cry
    endTurn(tg);
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'hand');
    const r = tg.runPartial({ type: 'NORMAL_SUMMON', player: 1, uid: tiger }, A.zone(1, 'monster', 0));
    expect(r.prompt?.type).toBe('fastEffects');
    if (r.prompt?.type === 'fastEffects') expect(r.prompt.options.map((o) => o.uid)).toContain(cry);
    tg.run({ type: 'NORMAL_SUMMON', player: 1, uid: tiger }, A.zone(1, 'monster', 0), A.activate(cry), A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(bewd).zone).toBe('monster');
    expect(tg.card(bewd).controller).toBe(0);
    expect(tg.card(cry).zone).toBe('graveyard');
  });

  it("Quick-Play Spell in hand cannot be activated on the opponent's turn", () => {
    const tg = makeGame();
    start(tg);
    const cry = put(tg, 0, "Silver's Cry", 'hand');
    put(tg, 0, 'Blue-Eyes White Dragon', 'graveyard');
    endTurn(tg);
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'hand');
    const r = tg.runPartial({ type: 'NORMAL_SUMMON', player: 1, uid: tiger }, A.zone(1, 'monster', 0));
    // No response window should include the hand quick-play; the summon should complete
    expect(r.done).toBe(true);
    expect(tg.card(cry).zone).toBe('hand');
  });

  it('Kunai with Chain changes an attacking monster to Defense Position, cancelling the attack', () => {
    const tg = makeGame();
    start(tg);
    const kunai = put(tg, 0, 'Kunai with Chain', 'spellTrap', { faceUp: false, turnEnteredField: 0 });
    const luster = put(tg, 0, 'Luster Dragon', 'monster');
    endTurn(tg);
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    const r = tg.runPartial({ type: 'DECLARE_ATTACK', player: 1, uid: tiger });
    expect(r.prompt?.type).toBe('fastEffects');
    if (r.prompt?.type === 'fastEffects') {
      expect(r.prompt.player).toBe(0);
      expect(r.prompt.options.map((o) => o.uid)).toContain(kunai);
    }
    // Choose both effects: defense + equip Luster Dragon
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: tiger }, A.activate(kunai), A.option('both'), A.cards(luster));
    expect(tg.card(tiger).position).toBe('DEF');
    expect(tg.card(kunai).zone).toBe('spellTrap');
    expect(tg.card(kunai).faceUp).toBe(true);
    expect(tg.card(kunai).equippedTo).toBe(luster);
    expect(tg.state.players[0].lp).toBe(8000);
    expect(tg.state.players[1].lp).toBe(8000);
    expect(tg.log().some((l) => l.includes('attack is cancelled'))).toBe(true);
    // Luster Dragon has 1900 + 500
    expect(new Game(tg.state).stats(luster).atk).toBe(2400);
  });

  it('Honest boosts a LIGHT monster during damage calculation', () => {
    const tg = makeGame();
    start(tg);
    const honest = put(tg, 0, 'Honest', 'hand');
    const angel = put(tg, 0, 'Shining Angel', 'monster'); // 1400 LIGHT
    endTurn(tg);
    const mammoth = put(tg, 1, 'Crystal Beast Amber Mammoth', 'monster', { turnEnteredField: 1 }); // 1700
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    const r = tg.runPartial({ type: 'DECLARE_ATTACK', player: 1, uid: mammoth });
    expect(r.prompt?.type).toBe('fastEffects');
    if (r.prompt?.type === 'fastEffects') {
      expect(r.prompt.player).toBe(0);
      expect(r.prompt.options.map((o) => o.uid)).toContain(honest);
      expect(r.prompt.context).toMatch(/Damage Step/);
    }
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: mammoth }, A.activate(honest, 'boost'), A.no());
    // Shining Angel: 1400 + 1700 = 3100 vs 1700 -> Mammoth destroyed (or placed as Crystal Beast), P2 takes 1400
    expect(tg.card(honest).zone).toBe('graveyard');
    expect(tg.card(angel).zone).toBe('monster');
    expect(tg.state.players[1].lp).toBe(8000 - 1400);
    expect(tg.card(mammoth).zone).not.toBe('monster');
  });

  it('Honest cannot be activated outside the Damage Step', () => {
    const tg = makeGame();
    start(tg);
    const honest = put(tg, 0, 'Honest', 'hand');
    put(tg, 0, 'Shining Angel', 'monster');
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: honest, effectId: 'boost' })).toMatch(/Damage Step/);
  });

  it('Enemy Controller from hand on own turn changes an opponent monster to Defense', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1 });
    endTurn(tg);
    const ec = put(tg, 0, 'Enemy Controller', 'hand');
    tg.run({ type: 'ACTIVATE', player: 0, uid: ec, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.option('position'), A.cards(tiger));
    expect(tg.card(tiger).position).toBe('DEF');
    expect(tg.card(ec).zone).toBe('graveyard');
  });

  it('Swords of Revealing Light stops opponent attacks and is destroyed at the End Phase of their 3rd turn', () => {
    const tg = makeGame();
    start(tg);
    const swords = put(tg, 0, 'Swords of Revealing Light', 'hand');
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster');
    const cat = put(tg, 1, 'Crystal Beast Amethyst Cat', 'monster', { faceUp: false, position: 'DEF' });
    tg.run({ type: 'ACTIVATE', player: 0, uid: swords, effectId: 'activate' }, A.zone(0, 'spellTrap', 0));
    expect(tg.card(swords).zone).toBe('spellTrap');
    expect(tg.card(swords).faceUp).toBe(true);
    expect(tg.card(cat).faceUp).toBe(true);
    expect(tg.card(cat).position).toBe('DEF');
    endTurn(tg); // turn 2 (P2's 1st)
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    expect(tg.expectIllegal({ type: 'DECLARE_ATTACK', player: 1, uid: tiger })).toMatch(/Swords of Revealing Light/);
    endTurn(tg); // turn 3 P1
    endTurn(tg); // turn 4 P2's 2nd
    expect(tg.card(swords).zone).toBe('spellTrap');
    endTurn(tg); // turn 5 P1
    endTurn(tg); // now turn 6 (P2's 3rd turn) begins
    expect(tg.card(swords).zone).toBe('spellTrap');
    endTurn(tg); // End Phase of turn 6: Swords is destroyed
    expect(tg.card(swords).zone).toBe('graveyard');
    expect(tg.log().some((l) => l.includes("End Phase of the opponent's 3rd turn"))).toBe(true);
  });
});
