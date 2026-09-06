import { describe, it, expect } from 'vitest';
import { makeGame, start, endTurn, put, A } from './harness';
import { Game } from '../src/engine';

const stats = (tg: ReturnType<typeof makeGame>, uid: string) => new Game(tg.state).stats(uid);

describe('Synchro Summon: Azure-Eyes Silver Dragon', () => {
  it('Blue-Eyes (Level 8, Normal) + White Stone of Legend (Level 1 Tuner) Synchro Summon Azure-Eyes', () => {
    const tg = makeGame();
    start(tg);
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'monster');
    const stone = put(tg, 0, 'The White Stone of Legend', 'monster');
    const azure = tg.find(0, 'Azure-Eyes Silver Dragon', 'extra');
    const legal = tg.legal(0).find((a) => a.uid === azure && a.action.type === 'SPECIAL_SUMMON');
    expect(legal?.legal).toBe(true);
    // Move Blue-Eyes #2? Only one copy; White Stone sends BEWD from deck... none left in deck after put (the only copy is on the field)
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: azure, procId: 'synchro' }, A.option('ATK'), A.zone(0, 'monster', 2));
    expect(tg.card(azure).zone).toBe('monster');
    expect(tg.card(azure).properlySummoned).toBe(true);
    expect(tg.card(bewd).zone).toBe('graveyard');
    expect(tg.card(stone).zone).toBe('graveyard');
    expect(tg.log().some((l) => l.includes('Synchro Summons Azure-Eyes Silver Dragon'))).toBe(true);
  });

  it('cannot Synchro Summon Azure-Eyes with a non-Tuner Effect Monster or wrong Levels', () => {
    const tg = makeGame();
    start(tg);
    put(tg, 0, 'Kaiser Glider', 'monster'); // Level 6 Effect
    put(tg, 0, 'The White Stone of Legend', 'monster');
    const azure = tg.find(0, 'Azure-Eyes Silver Dragon', 'extra');
    const r = tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: azure, procId: 'synchro' });
    expect(r).toMatch(/Levels add up to exactly 9/);
    // Luster Dragon (4, Normal) + White Stone (1) = 5 -> illegal
    put(tg, 0, 'Luster Dragon', 'monster');
    tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: azure, procId: 'synchro' });
  });

  it('Azure-Eyes protects Dragons from targeting and effect destruction until the end of the next turn', () => {
    const tg = makeGame();
    start(tg);
    put(tg, 0, 'Blue-Eyes White Dragon', 'monster');
    put(tg, 0, 'The White Stone of Legend', 'monster');
    const luster = put(tg, 0, 'Luster Dragon', 'monster');
    const azure = tg.find(0, 'Azure-Eyes Silver Dragon', 'extra');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: azure, procId: 'synchro' }, A.option('ATK'), A.zone(0, 'monster', 3));
    expect(tg.log().some((l) => l.includes('cannot be targeted or destroyed by card effects'))).toBe(true);
    endTurn(tg); // opponent's turn (turn 2): still protected
    const ced = put(tg, 1, 'Cosmic Cyclone', 'hand'); // unused; just make sure P2 has cards
    void ced;
    const g = new Game(tg.state);
    expect(g.targetingProtection(tg.card(luster), 1)).toMatch(/Azure-Eyes/);
    expect(g.effectDestructionProtection(tg.card(azure))).toMatch(/Azure-Eyes/);
    endTurn(tg); // turn 3: protection ended
    const g2 = new Game(tg.state);
    expect(g2.targetingProtection(tg.card(luster), 1)).toBeNull();
  });

  it('Azure-Eyes revives a Normal Monster during its controller Standby Phase', () => {
    const tg = makeGame();
    start(tg);
    const azure = put(tg, 0, 'Azure-Eyes Silver Dragon', 'monster');
    tg.card(azure).properlySummoned = true;
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'graveyard');
    put(tg, 0, 'Kaiser Glider', 'graveyard'); // Effect monster: not a valid target
    endTurn(tg); // P2 turn: nothing (Standby of P2 does not trigger P1's Azure-Eyes)
    expect(tg.card(bewd).zone).toBe('graveyard');
    // End P2's turn -> P1's Standby Phase: optional trigger prompt
    const r = tg.runPartial({ type: 'END_TURN', player: 1 });
    expect(r.prompt?.type).toBe('selectOption');
    expect(r.prompt?.title).toMatch(/Activate Azure-Eyes Silver Dragon/);
    tg.run({ type: 'END_TURN', player: 1 }, A.yes(), A.option('DEF'), A.zone(0, 'monster', 1));
    expect(tg.card(bewd).zone).toBe('monster');
    expect(tg.card(bewd).position).toBe('DEF');
    expect(tg.state.phase).toBe('MAIN1');
  });
});

describe('Gemini: Darkstorm Dragon', () => {
  it('is a Normal Monster until Gemini Summoned, then can destroy all Spells/Traps', () => {
    const tg = makeGame();
    start(tg);
    const dark = put(tg, 0, 'Darkstorm Dragon', 'monster');
    const swords = put(tg, 0, 'Swords of Revealing Light', 'spellTrap', { faceUp: true });
    const oppSet = put(tg, 1, 'Crystal Boon', 'spellTrap');
    const g = new Game(tg.state);
    expect(g.isNormalMonster(dark)).toBe(true);
    // Effect not usable yet
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: dark, effectId: 'destroyAll' })).toMatch(/Gemini Summon/);
    tg.run({ type: 'GEMINI_SUMMON', player: 0, uid: dark });
    expect(tg.card(dark).geminiEffectActive).toBe(true);
    expect(tg.state.players[0].normalSummonsUsed).toBe(1);
    expect(new Game(tg.state).isNormalMonster(dark)).toBe(false);
    // Now use the effect: send Swords as cost, destroy all S/T
    tg.run({ type: 'ACTIVATE', player: 0, uid: dark, effectId: 'destroyAll' });
    expect(tg.card(swords).zone).toBe('graveyard');
    expect(tg.card(oppSet).zone).toBe('graveyard');
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: dark, effectId: 'destroyAll' })).toMatch(/once per turn|cost/i);
  });

  it('Gemini Summon uses the Normal Summon and cannot be done after Normal Summoning', () => {
    const tg = makeGame();
    start(tg);
    const dark = put(tg, 0, 'Darkstorm Dragon', 'monster');
    const luster = put(tg, 0, 'Luster Dragon', 'hand');
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: luster }, A.zone(0, 'monster', 1));
    expect(tg.expectIllegal({ type: 'GEMINI_SUMMON', player: 0, uid: dark })).toMatch(/already Normal Summoned/);
  });

  it('Darkstorm Dragon in the Graveyard counts as a Normal Monster (Silver\'s Cry can revive it)', () => {
    const tg = makeGame();
    start(tg);
    const dark = put(tg, 0, 'Darkstorm Dragon', 'graveyard');
    const cry = put(tg, 0, "Silver's Cry", 'hand');
    tg.run({ type: 'ACTIVATE', player: 0, uid: cry, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(dark).zone).toBe('monster');
    expect(tg.card(dark).geminiEffectActive).toBe(false);
  });
});

describe('Kaiser Glider', () => {
  it('is not destroyed by battle with a monster of the same ATK', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    const glider = put(tg, 0, 'Kaiser Glider', 'monster'); // 2400
    const rdd = put(tg, 1, 'Rainbow Dark Dragon', 'monster', { turnEnteredField: 1 }); // 4000 -> make it 2400 via mod
    tg.card(rdd).statMods.push({ atk: -1600, def: 0, until: 'permanent', source: 'test' });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: rdd });
    expect(tg.card(glider).zone).toBe('monster');
    expect(tg.card(rdd).zone).not.toBe('monster'); // destroyed (equal ATK): Rainbow Dark Dragon is destroyed
    expect(tg.log().some((l) => l.includes('Kaiser Glider cannot be destroyed by battle'))).toBe(true);
  });

  it('returns a monster to the hand when destroyed and sent to the Graveyard', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    const glider = put(tg, 0, 'Kaiser Glider', 'monster'); // 2400
    const rdd = put(tg, 1, 'Rainbow Dark Dragon', 'monster', { turnEnteredField: 1 }); // 4000
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    // Glider destroyed -> mandatory trigger: target 1 monster on the field (only RDD) -> auto
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: rdd });
    expect(tg.card(glider).zone).toBe('graveyard');
    expect(tg.card(rdd).zone).toBe('hand');
    expect(tg.state.players[0].lp).toBe(8000 - 1600);
  });
});

describe('Compulsory Evacuation Device on a face-down monster', () => {
  it('returns a face-down Defense Position monster to the hand', () => {
    const tg = makeGame();
    start(tg);
    const ced = put(tg, 0, 'Compulsory Evacuation Device', 'spellTrap', { turnEnteredField: 0 });
    endTurn(tg);
    const cat = put(tg, 1, 'Crystal Beast Amethyst Cat', 'hand');
    // P2 sets the monster; P1 responds with CED targeting the face-down monster
    tg.run({ type: 'SET_MONSTER', player: 1, uid: cat }, A.zone(1, 'monster', 0), A.activate(ced), A.cards(cat));
    expect(tg.card(cat).zone).toBe('hand');
    expect(tg.card(ced).zone).toBe('graveyard');
  });
});

describe("Champion's Vigilance", () => {
  it('negates a Normal Summon while controlling a Level 7+ Normal Monster', () => {
    const tg = makeGame();
    start(tg);
    put(tg, 0, 'Blue-Eyes White Dragon', 'monster');
    const cv = put(tg, 0, "Champion's Vigilance", 'spellTrap', { turnEnteredField: 0 });
    endTurn(tg);
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'hand');
    const r = tg.runPartial({ type: 'NORMAL_SUMMON', player: 1, uid: tiger }, A.zone(1, 'monster', 0));
    expect(r.prompt?.type).toBe('fastEffects');
    if (r.prompt?.type === 'fastEffects') {
      expect(r.prompt.windowKind).toBe('summon');
      expect(r.prompt.options.map((o) => o.uid)).toContain(cv);
    }
    tg.run({ type: 'NORMAL_SUMMON', player: 1, uid: tiger }, A.zone(1, 'monster', 0), A.activate(cv));
    expect(tg.card(tiger).zone).toBe('graveyard');
    expect(tg.card(cv).zone).toBe('graveyard');
    expect(tg.state.players[1].normalSummonsUsed).toBe(1);
    expect(tg.log().some((l) => l.includes('Summon of Crystal Beast Topaz Tiger is negated'))).toBe(true);
  });

  it('negates a Spell activation and destroys it', () => {
    const tg = makeGame({ decks: ['sdbe', 'sdbe'] });
    start(tg);
    const cv = put(tg, 0, "Champion's Vigilance", 'spellTrap', { turnEnteredField: 0 });
    endTurn(tg);
    put(tg, 0, 'Blue-Eyes White Dragon', 'monster'); // (not the turn player, but controls BEWD)
    const reborn = put(tg, 1, 'Monster Reborn', 'hand');
    const cat = put(tg, 1, 'Luster Dragon', 'graveyard');
    const r = tg.runPartial({ type: 'ACTIVATE', player: 1, uid: reborn, effectId: 'activate' }, A.zone(1, 'spellTrap', 0));
    expect(r.prompt?.type).toBe('fastEffects');
    tg.run({ type: 'ACTIVATE', player: 1, uid: reborn, effectId: 'activate' }, A.zone(1, 'spellTrap', 0), A.activate(cv));
    expect(tg.card(cat).zone).toBe('graveyard');
    expect(tg.card(reborn).zone).toBe('graveyard');
    expect(tg.card(cv).zone).toBe('graveyard');
    expect(tg.log().some((l) => l.includes('activation of Monster Reborn (Chain Link 1) is negated'))).toBe(true);
  });
});

describe('Fiendish Chain', () => {
  it('negates a monster effect and stops it attacking; monster is freed when Fiendish Chain leaves', () => {
    const tg = makeGame();
    start(tg);
    const fc = put(tg, 0, 'Fiendish Chain', 'spellTrap', { turnEnteredField: 0 });
    endTurn(tg);
    const pegasus = put(tg, 1, 'Crystal Beast Sapphire Pegasus', 'hand');
    // P2 summons Pegasus; P1 chains Fiendish Chain in the response window (Pegasus' own trigger is optional, declined)
    tg.run({ type: 'NORMAL_SUMMON', player: 1, uid: pegasus }, A.zone(1, 'monster', 0), A.activate(fc), A.cards(pegasus));
    expect(tg.card(pegasus).flags['effectsNegated']).toBe(true);
    expect(tg.card(fc).zone).toBe('spellTrap');
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    expect(tg.expectIllegal({ type: 'DECLARE_ATTACK', player: 1, uid: pegasus })).toMatch(/Fiendish Chain/);
    // Destroy Fiendish Chain -> Pegasus freed
    endTurn(tg);
    const stamping = put(tg, 0, 'Stamping Destruction', 'hand');
    put(tg, 0, 'Luster Dragon', 'monster');
    tg.run({ type: 'ACTIVATE', player: 0, uid: stamping, effectId: 'activate' }, A.zone(0, 'spellTrap', 1), A.cards(fc));
    expect(tg.card(fc).zone).toBe('graveyard');
    expect(tg.card(pegasus).flags['effectsNegated']).toBeUndefined();
    expect(tg.state.players[0].lp).toBe(8000 - 500);
  });

  it('cannot target a Gemini monster that is currently a Normal Monster', () => {
    const tg = makeGame({ decks: ['sdbe', 'sdbe'] });
    start(tg);
    put(tg, 0, 'Darkstorm Dragon', 'monster');
    const fc = put(tg, 1, 'Fiendish Chain', 'spellTrap', { turnEnteredField: 0 });
    endTurn(tg);
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 1, uid: fc, effectId: 'activate' })).toMatch(/no face-up Effect Monster/);
  });
});

describe('Call of the Haunted', () => {
  it('revives a monster and both are linked', () => {
    const tg = makeGame();
    start(tg);
    const coth = put(tg, 0, 'Call of the Haunted', 'spellTrap', { turnEnteredField: 0 });
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'graveyard');
    endTurn(tg);
    // P1 activates CotH during P2's End Phase (endPhase window)
    const r = tg.runPartial({ type: 'END_TURN', player: 1 });
    expect(r.prompt?.type).toBe('fastEffects');
    tg.run({ type: 'END_TURN', player: 1 }, A.activate(coth), A.zone(0, 'monster', 0));
    expect(tg.card(bewd).zone).toBe('monster');
    expect(tg.card(bewd).position).toBe('ATK');
    expect(tg.card(coth).faceUp).toBe(true);
    expect(tg.state.links[coth]).toBe(bewd);
    // Destroy the monster -> CotH destroyed
    const burst = put(tg, 1, 'Rainbow Refraction', 'hand');
    void burst;
    // Use Kaiser Glider style? Simplest: opponent's Stamping cannot hit monsters. Use battle: P1 turn now (turn 3). End it, P2 attacks with 4000 RDD.
    endTurn(tg);
    const rdd = put(tg, 1, 'Rainbow Dark Dragon', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: rdd });
    expect(tg.card(bewd).zone).toBe('graveyard');
    expect(tg.card(coth).zone).toBe('graveyard');
  });

  it('destroys the revived monster when Call of the Haunted leaves the field', () => {
    const tg = makeGame();
    start(tg);
    const coth = put(tg, 0, 'Call of the Haunted', 'spellTrap', { turnEnteredField: 0 });
    const luster = put(tg, 0, 'Luster Dragon', 'graveyard');
    endTurn(tg);
    tg.run({ type: 'END_TURN', player: 1 }, A.activate(coth), A.zone(0, 'monster', 0));
    expect(tg.card(luster).zone).toBe('monster');
    // P1's turn: Stamping Destruction on own CotH
    const stamping = put(tg, 0, 'Stamping Destruction', 'hand');
    tg.run({ type: 'ACTIVATE', player: 0, uid: stamping, effectId: 'activate' }, A.zone(0, 'spellTrap', 1), A.cards(coth));
    expect(tg.card(coth).zone).toBe('graveyard');
    expect(tg.card(luster).zone).toBe('graveyard');
    expect(tg.state.players[0].lp).toBe(7500);
  });
});

describe('Maiden with Eyes of Blue', () => {
  it('negates an attack, changes position and Special Summons Blue-Eyes from the Deck', () => {
    const tg = makeGame();
    start(tg);
    const maiden = put(tg, 0, 'Maiden with Eyes of Blue', 'monster');
    const bewd = tg.find(0, 'Blue-Eyes White Dragon');
    endTurn(tg);
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    const r = tg.runPartial({ type: 'DECLARE_ATTACK', player: 1, uid: tiger });
    expect(r.prompt?.type).toBe('selectOption');
    expect(r.prompt?.title).toMatch(/Maiden/);
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: tiger }, A.yes(), A.yes(), A.option('ATK'), A.zone(0, 'monster', 1));
    expect(tg.card(maiden).position).toBe('DEF');
    expect(tg.card(bewd).zone).toBe('monster');
    expect(tg.state.players[0].lp).toBe(8000);
    expect(tg.log().some((l) => l.includes('attack of Crystal Beast Topaz Tiger is negated'))).toBe(true);
  });

  it('Special Summons Blue-Eyes when targeted by a card effect (once per turn shared)', () => {
    const tg = makeGame({ decks: ['sdbe', 'sdbe'] });
    start(tg);
    endTurn(tg);
    const maiden = put(tg, 0, 'Maiden with Eyes of Blue', 'monster');
    put(tg, 0, 'Blue-Eyes White Dragon', 'hand');
    const ec = put(tg, 1, 'Enemy Controller', 'hand');
    // P2 targets Maiden with Enemy Controller; Maiden's quick effect is offered to P1 in the chain window
    const r = tg.runPartial({ type: 'ACTIVATE', player: 1, uid: ec, effectId: 'activate' }, A.zone(1, 'spellTrap', 0), A.option('position'));
    expect(r.prompt?.type).toBe('fastEffects');
    if (r.prompt?.type === 'fastEffects') expect(r.prompt.options.some((o) => o.uid === maiden && o.effectId === 'targeted')).toBe(true);
    tg.run({ type: 'ACTIVATE', player: 1, uid: ec, effectId: 'activate' }, A.zone(1, 'spellTrap', 0), A.option('position'), A.activate(maiden, 'targeted'), A.option('ATK'), A.zone(0, 'monster', 1));
    expect(tg.find(0, 'Blue-Eyes White Dragon', 'monster')).toBeTruthy();
    expect(tg.card(maiden).position).toBe('DEF'); // Enemy Controller still resolved
  });
});

describe('Other Blue-Eyes cards', () => {
  it('Kaiser Sea Horse counts as 2 Tributes for a LIGHT monster', () => {
    const tg = makeGame();
    start(tg);
    const seahorse = put(tg, 0, 'Kaiser Sea Horse', 'monster');
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'hand');
    const dark = put(tg, 0, 'Darkstorm Dragon', 'hand'); // DARK: needs 2 real tributes
    expect(tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 0, uid: dark })).toMatch(/2 Tributes/);
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: bewd }, A.zone(0, 'monster', 0));
    expect(tg.card(bewd).zone).toBe('monster');
    expect(tg.card(seahorse).zone).toBe('graveyard');
  });

  it('The White Stone of Legend adds Blue-Eyes from the Deck when sent to the GY (as a cost)', () => {
    const tg = makeGame();
    start(tg);
    const stone = put(tg, 0, 'The White Stone of Legend', 'hand');
    const coc = put(tg, 0, 'Cards of Consonance', 'hand');
    const bewd = tg.find(0, 'Blue-Eyes White Dragon', 'deck');
    tg.run({ type: 'ACTIVATE', player: 0, uid: coc, effectId: 'activate' }, A.zone(0, 'spellTrap', 0));
    expect(tg.card(stone).zone).toBe('graveyard');
    expect(tg.card(bewd).zone).toBe('hand');
    expect(tg.log().some((l) => l.includes('Blue-Eyes White Dragon is added from the Deck'))).toBe(true);
  });

  it('Shining Angel destroyed by battle Special Summons a LIGHT monster from the Deck', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    const angel = put(tg, 0, 'Shining Angel', 'monster');
    const honest = tg.find(0, 'Honest', 'deck');
    const mammoth = put(tg, 1, 'Crystal Beast Amber Mammoth', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: mammoth }, A.yes(), A.cards(honest), A.zone(0, 'monster', 0));
    expect(tg.card(angel).zone).toBe('graveyard');
    expect(tg.card(honest).zone).toBe('monster');
    expect(tg.card(honest).position).toBe('ATK');
  });

  it('Hieratic Dragon of Tefnuit: Special Summon from hand, cannot attack; when Tributed summons a Dragon Normal with 0 ATK/DEF', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster');
    endTurn(tg);
    // Turn 3: P1 (sdbe). P2 has a monster, P1 none -> Tefnuit can be Special Summoned.
    const tefnuit = put(tg, 0, 'Hieratic Dragon of Tefnuit', 'hand');
    // ensure P1 controls no monsters
    expect(tg.state.players[0].monsterZones.every((z) => z === null)).toBe(true);
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: tefnuit, procId: 'tefnuit' }, A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(tefnuit).zone).toBe('monster');
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    expect(tg.expectIllegal({ type: 'DECLARE_ATTACK', player: 0, uid: tefnuit })).toMatch(/cannot attack this turn/);
    tg.run({ type: 'TO_MAIN2', player: 0 });
    // Tribute it for Kaiser Glider -> trigger: Special Summon Blue-Eyes from Deck with 0/0
    const glider = put(tg, 0, 'Kaiser Glider', 'hand');
    const bewd = tg.find(0, 'Blue-Eyes White Dragon', 'deck');
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: glider }, A.zone(0, 'monster', 0), A.cards(bewd), A.option('ATK'), A.zone(0, 'monster', 1));
    expect(tg.card(bewd).zone).toBe('monster');
    expect(stats(tg, bewd).atk).toBe(0);
    expect(stats(tg, bewd).def).toBe(0);
  });

  it('Rider of the Storm Winds equips to a Dragon Normal Monster, grants piercing and is destroyed instead', () => {
    const tg = makeGame();
    start(tg);
    const rider = put(tg, 0, 'Rider of the Storm Winds', 'hand');
    const luster = put(tg, 0, 'Luster Dragon', 'monster');
    tg.run({ type: 'ACTIVATE', player: 0, uid: rider, effectId: 'equip' }, A.zone(0, 'spellTrap', 0));
    expect(tg.card(rider).zone).toBe('spellTrap');
    expect(tg.card(rider).treatedAsSpell).toBe('equip');
    expect(tg.card(rider).equippedTo).toBe(luster);
    endTurn(tg);
    const tortoise = put(tg, 1, 'Crystal Beast Emerald Tortoise', 'monster', { position: 'DEF' }); // DEF 2000 > 1900
    void tortoise;
    endTurn(tg);
    // Luster attacks Tortoise in DEF: 1900 < 2000 -> no piercing (attacker loses). Change: attack Amethyst Cat DEF 400
    const cat = put(tg, 1, 'Crystal Beast Amethyst Cat', 'monster', { position: 'DEF' });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    tg.run({ type: 'DECLARE_ATTACK', player: 0, uid: luster }, A.cards(cat), A.no());
    expect(tg.state.players[1].lp).toBe(8000 - (1900 - 400));
    expect(tg.log().some((l) => l.includes('piercing'))).toBe(true);
    // Now Luster would be destroyed by an effect -> Rider destroyed instead
    tg.run({ type: 'TO_MAIN2', player: 0 });
    const g = new Game(tg.state);
    void g;
    endTurn(tg);
    // P2 attacks Luster with Rainbow Dark Dragon (4000): Luster would be destroyed by battle -> Rider is destroyed instead
    const rdd = put(tg, 1, 'Rainbow Dark Dragon', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: rdd }, A.cards(luster));
    expect(tg.card(rider).zone).toBe('graveyard');
    expect(tg.card(luster).zone).toBe('monster');
  });

  it('Burst Stream of Destruction destroys all opposing monsters and stops Blue-Eyes attacking this turn', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    endTurn(tg);
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'monster', { turnEnteredField: 1 });
    const burst = put(tg, 0, 'Burst Stream of Destruction', 'hand');
    const t1 = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster');
    const t2 = put(tg, 1, 'Crystal Beast Cobalt Eagle', 'monster', { faceUp: false, position: 'DEF' });
    tg.run({ type: 'ACTIVATE', player: 0, uid: burst, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.no());
    expect(tg.card(t1).zone).not.toBe('monster');
    expect(tg.card(t2).zone).not.toBe('monster');
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    expect(tg.expectIllegal({ type: 'DECLARE_ATTACK', player: 0, uid: bewd })).toMatch(/Burst Stream/);
  });

  it('Soul Exchange forces the opponent monster to be Tributed and skips the Battle Phase', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster');
    endTurn(tg);
    const soul = put(tg, 0, 'Soul Exchange', 'hand');
    const glider = put(tg, 0, 'Kaiser Glider', 'hand');
    tg.run({ type: 'ACTIVATE', player: 0, uid: soul, effectId: 'activate' }, A.zone(0, 'spellTrap', 0));
    expect(tg.expectIllegal({ type: 'TO_BATTLE_PHASE', player: 0 })).toMatch(/Soul Exchange/);
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: glider }, A.zone(0, 'monster', 0));
    expect(tg.card(tiger).zone).not.toBe('monster');
    expect(tg.card(glider).zone).toBe('monster');
    expect(tg.log().some((l) => l.includes('Because of Soul Exchange'))).toBe(true);
  });

  it('Damage Condenser after battle damage Special Summons from the Deck', () => {
    const tg = makeGame();
    start(tg);
    const condenser = put(tg, 0, 'Damage Condenser', 'spellTrap', { turnEnteredField: 0 });
    put(tg, 0, 'Rabidragon', 'hand'); // card to discard
    endTurn(tg);
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1 }); // 1600 direct
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    // Nothing can respond at the attack declaration (Condenser needs battle damage first),
    // so the first prompt is the window right after damage calculation.
    const r2 = tg.runPartial({ type: 'DECLARE_ATTACK', player: 1, uid: tiger });
    expect(r2.prompt?.type).toBe('fastEffects');
    if (r2.prompt?.type === 'fastEffects') {
      expect(r2.prompt.options.some((o) => o.uid === condenser)).toBe(true);
      expect(r2.prompt.context).toMatch(/after damage calculation/);
    }
    const honest = tg.find(0, 'Honest', 'deck'); // 1100 ATK <= 1600
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: tiger }, A.activate(condenser), A.cards(tg.find(0, 'Rabidragon', 'hand')), A.cards(honest), A.zone(0, 'monster', 0));
    expect(tg.card(honest).zone).toBe('monster');
    expect(tg.state.players[0].lp).toBe(8000 - 1600);
  });

  it('Castle of Dragon Souls: boost and revive from banished', () => {
    const tg = makeGame();
    start(tg);
    const castle = put(tg, 0, 'Castle of Dragon Souls', 'spellTrap', { turnEnteredField: 0 });
    const luster = put(tg, 0, 'Luster Dragon', 'monster');
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'graveyard');
    endTurn(tg);
    // Activate Castle in P2's End Phase, then P1's turn: boost Luster by banishing Blue-Eyes
    tg.run({ type: 'END_TURN', player: 1 }, A.activate(castle));
    expect(tg.card(castle).faceUp).toBe(true);
    tg.run({ type: 'ACTIVATE', player: 0, uid: castle, effectId: 'boost' });
    expect(tg.card(bewd).zone).toBe('banished');
    expect(stats(tg, luster).atk).toBe(2600);
    endTurn(tg);
    expect(stats(tg, luster).atk).toBe(1900);
    // Destroy Castle (face-up) with A Wingbeat of Giant Dragon -> optional revive of banished Blue-Eyes
    endTurn(tg);
    const wingbeat = put(tg, 0, 'A Wingbeat of Giant Dragon', 'hand');
    put(tg, 0, 'Kaiser Glider', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'ACTIVATE', player: 0, uid: wingbeat, effectId: 'activate' }, A.zone(0, 'spellTrap', 1), A.yes(), A.option('ATK'), A.zone(0, 'monster', 1));
    expect(tg.card(castle).zone).toBe('graveyard');
    expect(tg.card(bewd).zone).toBe('monster');
  });

  it('One for One, Dragonic Tactics, White Elephant\'s Gift, Kaibaman, Herald of Creation', () => {
    const tg = makeGame();
    start(tg);
    // One for One: send Rabidragon from hand; summon White Stone (Level 1) from Deck
    const ofo = put(tg, 0, 'One for One', 'hand');
    const rabid = put(tg, 0, 'Rabidragon', 'hand');
    const stone = tg.find(0, 'The White Stone of Legend', 'deck');
    tg.run({ type: 'ACTIVATE', player: 0, uid: ofo, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.cards(rabid), A.cards(stone), A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(stone).zone).toBe('monster');
    // Kaibaman: tribute, summon Blue-Eyes from hand
    const kaibaman = put(tg, 0, 'Kaibaman', 'monster');
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'hand');
    tg.run({ type: 'ACTIVATE', player: 0, uid: kaibaman, effectId: 'summonBlueEyes' }, A.option('ATK'), A.zone(0, 'monster', 1));
    expect(tg.card(kaibaman).zone).toBe('graveyard');
    expect(tg.card(bewd).zone).toBe('monster');
    // White Elephant's Gift: send Blue-Eyes (Normal) to GY, draw 2
    const weg = put(tg, 0, "White Elephant's Gift", 'hand');
    const handBefore = tg.state.players[0].hand.length;
    tg.run({ type: 'ACTIVATE', player: 0, uid: weg, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.cards(bewd));
    expect(tg.card(bewd).zone).toBe('graveyard');
    expect(tg.state.players[0].hand.length).toBe(handBefore - 1 + 2);
    // Herald of Creation: discard 1, add Blue-Eyes (Level 8) from GY
    const herald = put(tg, 0, 'Herald of Creation', 'monster');
    const discard = tg.state.players[0].hand[0];
    tg.run({ type: 'ACTIVATE', player: 0, uid: herald, effectId: 'recover' }, A.cards(discard), A.cards(bewd));
    expect(tg.card(bewd).zone).toBe('hand');
    // Dragonic Tactics: tribute 2 Dragons (White Stone + Luster), summon Rabidragon? It's in GY; need Level 8 Dragon in Deck -> Darkstorm Dragon
    const luster = put(tg, 0, 'Luster Dragon', 'monster');
    const dt = put(tg, 0, 'Dragonic Tactics', 'hand');
    const dark = tg.find(0, 'Darkstorm Dragon', 'deck');
    tg.run({ type: 'ACTIVATE', player: 0, uid: dt, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(dark).zone).toBe('monster');
    expect(tg.card(luster).zone).toBe('graveyard');
  });

  it('Mirage Dragon stops the opponent activating Traps during the Battle Phase', () => {
    const tg = makeGame({ decks: ['sdbe', 'sdbe'] });
    start(tg);
    endTurn(tg);
    const ced = put(tg, 1, 'Compulsory Evacuation Device', 'spellTrap', { turnEnteredField: 1 });
    endTurn(tg);
    const mirage = put(tg, 0, 'Mirage Dragon', 'monster', { turnEnteredField: 1 });
    const luster = put(tg, 0, 'Luster Dragon', 'hand');
    // Main Phase: the opponent CAN respond to a summon with the Trap
    const r = tg.runPartial({ type: 'NORMAL_SUMMON', player: 0, uid: luster }, A.zone(0, 'monster', 1));
    expect(r.prompt?.type).toBe('fastEffects');
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: luster }, A.zone(0, 'monster', 1), A.pass());
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    // Battle Phase: the Trap is not offered
    const r2 = tg.runPartial({ type: 'DECLARE_ATTACK', player: 0, uid: mirage });
    expect(r2.done).toBe(true);
    expect(tg.card(ced).zone).toBe('spellTrap');
    expect(tg.state.players[1].lp).toBe(8000 - 1600);
  });
});
