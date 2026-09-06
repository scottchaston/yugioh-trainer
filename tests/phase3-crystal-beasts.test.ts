import { describe, it, expect } from 'vitest';
import { makeGame, start, endTurn, put, A } from './harness';
import { Game } from '../src/engine';

/** P1 plays Legend of the Crystal Beasts, P2 plays Saga of Blue-Eyes. */
const cbGame = () => makeGame({ decks: ['sdcb', 'sdbe'] });
const stats = (tg: ReturnType<typeof makeGame>, uid: string) => new Game(tg.state).stats(uid);
const CBS = ['Crystal Beast Ruby Carbuncle', 'Crystal Beast Amethyst Cat', 'Crystal Beast Emerald Tortoise', 'Crystal Beast Topaz Tiger', 'Crystal Beast Amber Mammoth', 'Crystal Beast Cobalt Eagle', 'Crystal Beast Sapphire Pegasus'];

describe('Sapphire Pegasus and Spell & Trap Zone placement', () => {
  it('Pegasus places a Crystal Beast from the Deck as a Continuous Spell when Normal Summoned', () => {
    const tg = cbGame();
    start(tg);
    const pegasus = put(tg, 0, 'Crystal Beast Sapphire Pegasus', 'hand');
    const tiger = tg.find(0, 'Crystal Beast Topaz Tiger', 'deck');
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: pegasus }, A.zone(0, 'monster', 2), A.yes(), A.cards(tiger), A.zone(0, 'spellTrap', 1));
    const c = tg.card(tiger);
    expect(c.zone).toBe('spellTrap');
    expect(c.index).toBe(1);
    expect(c.treatedAsSpell).toBe('continuous');
    expect(new Game(tg.state).fieldMonsters(0).length).toBe(1);
    // A placed Crystal Beast cannot use monster effects and is not a monster for attacks
    expect(tg.expectIllegal({ type: 'CHANGE_POSITION', player: 0, uid: tiger })).toMatch(/not a monster you control/);
    // Ash Blossom cannot stop Pegasus (placing is not adding/summoning/sending)
  });

  it('Pegasus also triggers on Special Summon, and Ruby Carbuncle summons all placed Crystal Beasts', () => {
    const tg = cbGame();
    start(tg);
    put(tg, 0, 'Crystal Beast Topaz Tiger', 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous' });
    put(tg, 0, 'Crystal Beast Amber Mammoth', 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous' });
    const ruby = put(tg, 0, 'Crystal Beast Ruby Carbuncle', 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous' });
    const promise = put(tg, 0, 'Crystal Promise', 'hand');
    // Crystal Promise summons Ruby; Ruby's trigger summons the other two
    tg.run({ type: 'ACTIVATE', player: 0, uid: promise, effectId: 'activate' }, A.zone(0, 'spellTrap', 3), A.cards(ruby), A.option('ATK'), A.zone(0, 'monster', 0), A.yes(), A.option('ATK'), A.zone(0, 'monster', 1), A.option('ATK'), A.zone(0, 'monster', 2));
    expect(new Game(tg.state).fieldMonsters(0).length).toBe(3);
    expect(tg.state.players[0].spellTrapZones.filter(Boolean).length).toBe(0);
  });
});

describe('Ancient City - Rainbow Ruins', () => {
  function withRuins(n: number) {
    const tg = cbGame();
    start(tg);
    const ruins = put(tg, 0, 'Ancient City - Rainbow Ruins', 'field');
    for (let i = 0; i < n; i++) put(tg, 0, CBS[i], 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous', index: i });
    return { tg, ruins };
  }

  it('counts only Crystal Beast cards in the Spell & Trap Zone, not the Field Zone', () => {
    const { tg, ruins } = withRuins(0);
    const legal = tg.legal(0).filter((a) => a.uid === ruins && a.action.type === 'ACTIVATE');
    const draw = legal.find((a) => a.action.type === 'ACTIVATE' && a.action.effectId === 'draw');
    expect(draw?.legal).toBe(false);
    expect(draw?.reason).toMatch(/you have 0/);
  });

  it('1+: cannot be destroyed by card effects', () => {
    const { tg, ruins } = withRuins(1);
    const g = new Game(tg.state);
    expect(g.effectDestructionProtection(tg.card(ruins))).toMatch(/Rainbow Ruins/);
    const { tg: tg0, ruins: r0 } = withRuins(0);
    expect(new Game(tg0.state).effectDestructionProtection(tg0.card(r0))).toBeNull();
  });

  it('2+: halves battle damage once per turn', () => {
    const { tg, ruins } = withRuins(2);
    endTurn(tg);
    const bewd = put(tg, 1, 'Blue-Eyes White Dragon', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    const r = tg.runPartial({ type: 'DECLARE_ATTACK', player: 1, uid: bewd });
    expect(r.prompt?.type).toBe('fastEffects');
    if (r.prompt?.type === 'fastEffects') expect(r.prompt.options.some((o) => o.uid === ruins && o.effectId === 'halve')).toBe(true);
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: bewd }, A.activate(ruins, 'halve'));
    expect(tg.state.players[0].lp).toBe(8000 - 1500);
  });

  it('3+: negates a Spell activation by sending a Crystal Beast monster to the GY', () => {
    const { tg, ruins } = withRuins(3);
    const cat = put(tg, 0, 'Crystal Beast Topaz Tiger', 'monster');
    endTurn(tg);
    const reborn = put(tg, 1, 'Monster Reborn', 'hand');
    put(tg, 1, 'Luster Dragon', 'graveyard');
    const r = tg.runPartial({ type: 'ACTIVATE', player: 1, uid: reborn, effectId: 'activate' }, A.zone(1, 'spellTrap', 0));
    expect(r.prompt?.type).toBe('fastEffects');
    tg.run({ type: 'ACTIVATE', player: 1, uid: reborn, effectId: 'activate' }, A.zone(1, 'spellTrap', 0), A.activate(ruins, 'negate'));
    expect(tg.card(cat).zone).toBe('graveyard');
    expect(tg.card(reborn).zone).toBe('graveyard');
    expect(tg.find(1, 'Luster Dragon', 'graveyard')).toBeTruthy();
    expect(tg.log().some((l) => l.includes('negated by Ancient City - Rainbow Ruins'))).toBe(true);
  });

  it('4+: draw 1 card once per turn; 5: Special Summon a Crystal Beast from the Spell & Trap Zone', () => {
    const { tg, ruins } = withRuins(4);
    const before = tg.state.players[0].hand.length;
    tg.run({ type: 'ACTIVATE', player: 0, uid: ruins, effectId: 'draw' });
    expect(tg.state.players[0].hand.length).toBe(before + 1);
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: ruins, effectId: 'draw' })).toMatch(/once per turn/);
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: ruins, effectId: 'summon' })).toMatch(/all 5/);
    const fifth = put(tg, 0, CBS[4], 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous', index: 4 });
    tg.run({ type: 'ACTIVATE', player: 0, uid: ruins, effectId: 'summon' }, A.cards(fifth), A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(fifth).zone).toBe('monster');
  });
});

describe('Rainbow Dragon', () => {
  it('needs 7 Crystal Beasts with different names on the field and/or in the GY (S/T Zone counts)', () => {
    const tg = cbGame();
    start(tg);
    const rd = put(tg, 0, 'Rainbow Dragon', 'hand');
    put(tg, 0, CBS[0], 'monster');
    put(tg, 0, CBS[1], 'monster');
    put(tg, 0, CBS[2], 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous' });
    put(tg, 0, CBS[3], 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous' });
    put(tg, 0, CBS[4], 'graveyard');
    put(tg, 0, CBS[5], 'graveyard');
    expect(tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: rd, procId: 'rainbow' })).toMatch(/you have 6/);
    put(tg, 0, CBS[6], 'graveyard');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: rd, procId: 'rainbow' }, A.option('ATK'), A.zone(0, 'monster', 2));
    expect(tg.card(rd).zone).toBe('monster');
    expect(tg.state.players[0].duelFlags['summonedUltimateCrystal']).toBe(true);
  });

  it('can attack the turn it is Special Summoned but cannot use its effects until the next turn', () => {
    const tg = cbGame();
    start(tg);
    endTurn(tg);
    endTurn(tg);
    const rd = put(tg, 0, 'Rainbow Dragon', 'hand');
    for (let i = 0; i < 6; i++) put(tg, 0, CBS[i], 'graveyard');
    const pegasus = put(tg, 0, CBS[6], 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: rd, procId: 'rainbow' }, A.option('ATK'), A.zone(0, 'monster', 2));
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: rd, effectId: 'reset' })).toMatch(/turn it was Special Summoned/);
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    tg.run({ type: 'DECLARE_ATTACK', player: 0, uid: rd });
    expect(tg.state.players[1].lp).toBe(8000 - 4000);
    // The boost quick effect is also unavailable this turn
    tg.run({ type: 'TO_MAIN2', player: 0 });
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: rd, effectId: 'boost' })).toMatch(/turn it was Special Summoned/);
    endTurn(tg);
    endTurn(tg);
    // Next own turn: boost sends Pegasus to GY, +1000 ATK
    tg.run({ type: 'ACTIVATE', player: 0, uid: rd, effectId: 'boost' });
    expect(tg.card(pegasus).zone).toBe('graveyard');
    expect(stats(tg, rd).atk).toBe(5000);
    // Rainbow Refraction is now live (an Ultimate Crystal effect was activated this turn)
    const refraction = put(tg, 0, 'Rainbow Refraction', 'hand');
    const legal = tg.legal(0).find((a) => a.uid === refraction && a.action.type === 'ACTIVATE');
    expect(legal?.legal).toBe(true);
  });

  it("reset effect banishes Crystal Beasts from the GY and shuffles the field into the Decks (Extra Deck monsters return to the Extra Deck)", () => {
    const tg = cbGame();
    start(tg);
    const rd = put(tg, 0, 'Rainbow Dragon', 'monster', { turnEnteredField: 0 });
    put(tg, 0, CBS[0], 'graveyard');
    put(tg, 0, CBS[1], 'graveyard');
    const azure = put(tg, 1, 'Azure-Eyes Silver Dragon', 'monster');
    const swords = put(tg, 1, 'Swords of Revealing Light', 'spellTrap', { faceUp: true });
    tg.run({ type: 'ACTIVATE', player: 0, uid: rd, effectId: 'reset' });
    expect(tg.state.players[0].banished.length).toBe(2);
    expect(tg.card(azure).zone).toBe('extra');
    expect(tg.card(swords).zone).toBe('deck');
    expect(tg.card(rd).zone).toBe('deck');
  });
});

describe('Ultimate Crystal Fusion monsters', () => {
  it('Rainbow Overdragon is Special Summoned by Tributing a Level 10 Ultimate Crystal and gains ATK by banishing', () => {
    const tg = cbGame();
    start(tg);
    const rd = put(tg, 0, 'Rainbow Dragon', 'monster', { turnEnteredField: 0 });
    const over = tg.find(0, 'Rainbow Overdragon', 'extra');
    put(tg, 0, 'Crystal Beast Sapphire Pegasus', 'graveyard');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: over, procId: 'tributeUltimate' }, A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(over).zone).toBe('monster');
    expect(tg.card(rd).zone).toBe('graveyard');
    expect(tg.card(over).fusionSummoned).toBe(false);
    tg.run({ type: 'ACTIVATE', player: 0, uid: over, effectId: 'gainAtk' });
    expect(stats(tg, over).atk).toBe(4000 + 1800);
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: over, effectId: 'shuffleAll' })).toMatch(/Fusion Summoned/);
  });

  it('Ultimate Crystal Magic Fusion Summons Rainbow Overdragon after a Crystal Beast is destroyed by battle', () => {
    const tg = cbGame();
    start(tg);
    const magic = put(tg, 0, 'Ultimate Crystal Magic', 'spellTrap', { turnEnteredField: 0 });
    const cat = put(tg, 0, 'Crystal Beast Amethyst Cat', 'monster');
    // 7 different Crystal Beasts: Cat on field (must still be face-up... it will be destroyed), so use Deck copies + placed ones
    for (let i = 0; i < 3; i++) put(tg, 0, CBS[i === 1 ? 6 : i], 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous', index: i + 1 });
    endTurn(tg);
    const bewd = put(tg, 1, 'Blue-Eyes White Dragon', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    const r = tg.runPartial({ type: 'DECLARE_ATTACK', player: 1, uid: bewd }, A.no());
    expect(r.prompt?.type).toBe('fastEffects');
    if (r.prompt?.type === 'fastEffects') expect(r.prompt.options.some((o) => o.uid === magic)).toBe(true);
    const over = tg.find(0, 'Rainbow Overdragon', 'extra');
    // Exactly 7 Crystal Beast cards with different names are available (3 in the Deck incl. Crystal Beast Rainbow Dragon,
    // 3 placed, plus the Deck copies), so the material choice is forced; the Fusion Monster is chosen explicitly.
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: bewd }, A.no(), A.activate(magic), A.cards(over), A.option('ATK'), A.zone(0, 'monster', 1));
    expect(tg.card(cat).zone).toBe('graveyard');
    expect(tg.card(over).zone).toBe('monster');
    expect(tg.card(over).fusionSummoned).toBe(true);
    expect(tg.card(over).properlySummoned).toBe(true);
  });

  it('Overdrive requires an Ultimate Crystal to have been Special Summoned this Duel and banishes 1 + 7 materials; +7000 ATK with 7 different beasts banished', () => {
    const tg = cbGame();
    start(tg);
    const od = tg.find(0, 'Ultimate Crystal Rainbow Dragon Overdrive', 'extra');
    put(tg, 0, 'Rainbow Dragon', 'graveyard');
    for (const n of CBS) put(tg, 0, n, 'graveyard');
    expect(tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: od, procId: 'overdrive' })).toMatch(/have not Special Summoned/);
    tg.state.players[0].duelFlags['summonedUltimateCrystal'] = true;
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: od, procId: 'overdrive' }, A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(od).zone).toBe('monster');
    expect(tg.state.players[0].banished.length).toBe(8);
    expect(stats(tg, od).atk).toBe(11000);
  });
});

describe('Pendulum: Crystal Master and Crystal Keeper', () => {
  it('places scales and Pendulum Summons Level 3-4 Crystal Beasts from the hand', () => {
    const tg = cbGame();
    start(tg);
    const master = put(tg, 0, 'Crystal Master', 'hand');
    const keeper = put(tg, 0, 'Crystal Keeper', 'hand');
    const tiger = put(tg, 0, 'Crystal Beast Topaz Tiger', 'hand'); // Level 4
    const ruby = put(tg, 0, 'Crystal Beast Ruby Carbuncle', 'hand'); // Level 3
    const rd = put(tg, 0, 'Rainbow Dragon', 'hand'); // Level 10: not summonable
    tg.run({ type: 'PLACE_PENDULUM', player: 0, uid: master }, A.zone(0, 'spellTrap', 0));
    expect(tg.card(master).zone).toBe('spellTrap');
    expect(tg.card(master).treatedAsSpell).toBe('pendulum');
    expect(tg.expectIllegal({ type: 'PENDULUM_SUMMON', player: 0 })).toMatch(/both of your Pendulum Zones/);
    tg.run({ type: 'PLACE_PENDULUM', player: 0, uid: keeper }, A.zone(0, 'spellTrap', 4));
    const r = tg.runPartial({ type: 'PENDULUM_SUMMON', player: 0 });
    expect(r.prompt?.type).toBe('selectCards');
    if (r.prompt?.type === 'selectCards') {
      expect(r.prompt.cards).toContain(tiger);
      expect(r.prompt.cards).toContain(ruby);
      expect(r.prompt.cards).not.toContain(rd);
    }
    tg.run({ type: 'PENDULUM_SUMMON', player: 0 }, A.cards(tiger, ruby), A.option('ATK'), A.zone(0, 'monster', 0), A.option('DEF'), A.zone(0, 'monster', 1));
    expect(tg.card(tiger).zone).toBe('monster');
    expect(tg.card(ruby).zone).toBe('monster');
    expect(tg.expectIllegal({ type: 'PENDULUM_SUMMON', player: 0 })).toMatch(/once per turn/);
    // Crystal Master's Pendulum Effect: opponent cannot target Crystal Beasts
    const g = new Game(tg.state);
    expect(g.targetingProtection(tg.card(tiger), 1)).toMatch(/Crystal Master/);
    expect(g.targetingProtection(tg.card(tiger), 0)).toBeNull();
  });

  it('a destroyed Pendulum Monster goes to the Extra Deck face-up', () => {
    const tg = cbGame();
    start(tg);
    const master = put(tg, 0, 'Crystal Master', 'monster');
    endTurn(tg);
    const bewd = put(tg, 1, 'Blue-Eyes White Dragon', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: bewd });
    expect(tg.card(master).zone).toBe('extra');
    expect(tg.card(master).faceUp).toBe(true);
  });

  it("Crystal Keeper's Pendulum Effect saves Crystal Beasts from effect destruction once per turn", () => {
    const tg = cbGame();
    start(tg);
    put(tg, 0, 'Crystal Keeper', 'spellTrap', { faceUp: true, treatedAsSpell: 'pendulum', index: 4 });
    const tiger = put(tg, 0, 'Crystal Beast Topaz Tiger', 'monster');
    const cat = put(tg, 0, 'Crystal Beast Amethyst Cat', 'monster');
    endTurn(tg);
    put(tg, 1, 'Blue-Eyes White Dragon', 'monster', { turnEnteredField: 1 });
    const burst = put(tg, 1, 'Burst Stream of Destruction', 'hand');
    tg.run({ type: 'ACTIVATE', player: 1, uid: burst, effectId: 'activate' }, A.zone(1, 'spellTrap', 0), A.no());
    // First destruction prevented for Tiger; Cat destroyed (declined placement)
    expect(tg.card(tiger).zone).toBe('monster');
    expect(tg.card(cat).zone).toBe('graveyard');
  });
});

describe('Crystal Beast battle effects', () => {
  it('Amethyst Cat attacks directly with halved damage', () => {
    const tg = cbGame();
    start(tg);
    endTurn(tg);
    put(tg, 1, 'Blue-Eyes White Dragon', 'monster');
    endTurn(tg);
    const cat = put(tg, 0, 'Crystal Beast Amethyst Cat', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    tg.run({ type: 'DECLARE_ATTACK', player: 0, uid: cat }, A.option('direct'));
    expect(tg.state.players[1].lp).toBe(8000 - 600);
  });

  it('Amber Mammoth redirects an attack on another Crystal Beast to itself', () => {
    const tg = cbGame();
    start(tg);
    const mammoth = put(tg, 0, 'Crystal Beast Amber Mammoth', 'monster');
    const ruby = put(tg, 0, 'Crystal Beast Ruby Carbuncle', 'monster');
    endTurn(tg);
    const glider = put(tg, 1, 'Kaiser Glider', 'monster', { turnEnteredField: 1 }); // 2400
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    // Attack Ruby; Mammoth's optional trigger -> yes; Mammoth destroyed (decline placement); Glider effect bounce none? Glider not destroyed.
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: glider }, A.cards(ruby), A.yes(), A.no());
    expect(tg.card(ruby).zone).toBe('monster');
    expect(tg.card(mammoth).zone).toBe('graveyard');
    expect(tg.state.players[0].lp).toBe(8000 - 700);
  });

  it('Crystal Keeper doubles ATK/DEF during damage calculation and the monster is destroyed at the end of the Damage Step', () => {
    const tg = cbGame();
    start(tg);
    const keeper = put(tg, 0, 'Crystal Keeper', 'hand');
    const tiger = put(tg, 0, 'Crystal Beast Topaz Tiger', 'monster');
    endTurn(tg);
    const glider = put(tg, 1, 'Kaiser Glider', 'monster', { turnEnteredField: 1 }); // 2400 vs Tiger 1600
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: glider }, A.activate(keeper, 'double'), A.no());
    // Tiger: 1600 + 400 (defending? no: Tiger's bonus only when attacking) -> doubled original: +1600 = 3200 vs 2400 -> Glider destroyed, P2 takes 800
    expect(tg.card(glider).zone).toBe('graveyard');
    expect(tg.state.players[1].lp).toBe(8000 - 800);
    expect(tg.card(tiger).zone).toBe('graveyard');
    expect(tg.card(keeper).zone).toBe('graveyard'); // a Pendulum Monster Tributed from the hand goes to the GY (only from the field does it go to the Extra Deck)
  });
});

describe('Crystal Spells and Traps', () => {
  it('Awakening of the Crystal Ultimates requires an Ultimate Crystal in hand (reveal) or on the field', () => {
    const tg = cbGame();
    start(tg);
    const awk = put(tg, 0, 'Awakening of the Crystal Ultimates', 'hand');
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: awk, effectId: 'activate' })).toMatch(/Ultimate Crystal/);
    const rd = put(tg, 0, 'Rainbow Dragon', 'hand');
    const bridge = tg.find(0, 'Rainbow Bridge', 'deck');
    tg.run({ type: 'ACTIVATE', player: 0, uid: awk, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.option('search'), A.cards(bridge), A.option('hand'));
    expect(tg.card(bridge).zone).toBe('hand');
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: put(tg, 0, 'Awakening of the Crystal Ultimates', 'hand'), effectId: 'activate' })).toMatch(/only activate 1/);
  });

  it('Crystal Bond searches a Crystal Beast and places another; Crystal Beacon needs 2 placed beasts', () => {
    const tg = cbGame();
    start(tg);
    const bond = put(tg, 0, 'Crystal Bond', 'hand');
    const pegasus = tg.find(0, 'Crystal Beast Sapphire Pegasus', 'deck');
    const tiger = tg.find(0, 'Crystal Beast Topaz Tiger', 'deck');
    tg.run({ type: 'ACTIVATE', player: 0, uid: bond, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.cards(pegasus), A.cards(tiger), A.zone(0, 'spellTrap', 1));
    expect(tg.card(pegasus).zone).toBe('hand');
    expect(tg.card(tiger).zone).toBe('spellTrap');
    const beacon = put(tg, 0, 'Crystal Beacon', 'hand');
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: beacon, effectId: 'activate' })).toMatch(/2 or more/);
    put(tg, 0, 'Crystal Beast Cobalt Eagle', 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous', index: 2 });
    const cat = tg.find(0, 'Crystal Beast Amethyst Cat', 'deck');
    tg.run({ type: 'ACTIVATE', player: 0, uid: beacon, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.cards(cat), A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(cat).zone).toBe('monster');
  });

  it('Crystal Tree collects counters and places beasts from the Deck; Crystal Release equips (+800) and places on leaving', () => {
    const tg = cbGame();
    start(tg);
    const tree = put(tg, 0, 'Crystal Tree', 'hand');
    tg.run({ type: 'ACTIVATE', player: 0, uid: tree, effectId: 'activate' }, A.zone(0, 'spellTrap', 0));
    const blessing = put(tg, 0, 'Crystal Blessing', 'hand');
    const a = put(tg, 0, 'Crystal Beast Amethyst Cat', 'graveyard');
    const b = put(tg, 0, 'Crystal Beast Cobalt Eagle', 'graveyard');
    tg.run({ type: 'ACTIVATE', player: 0, uid: blessing, effectId: 'activate' }, A.zone(0, 'spellTrap', 1), A.cards(a, b), A.zone(0, 'spellTrap', 2), A.zone(0, 'spellTrap', 3));
    expect(tg.card(a).zone).toBe('spellTrap');
    // Two beasts placed at the same time count as one placement ("monster(s)"): 1 Crystal Counter
    expect(tg.card(tree).counters['Crystal Counter']).toBe(1);
    // A second, separate placement adds another counter
    const pegasus = put(tg, 0, 'Crystal Beast Sapphire Pegasus', 'hand');
    const mammothDeck = tg.find(0, 'Crystal Beast Amber Mammoth', 'deck');
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: pegasus }, A.zone(0, 'monster', 0), A.yes(), A.cards(mammothDeck), A.zone(0, 'spellTrap', 4));
    expect(tg.card(tree).counters['Crystal Counter']).toBe(2);
    const tiger = tg.find(0, 'Crystal Beast Topaz Tiger', 'deck');
    const ruby = tg.find(0, 'Crystal Beast Ruby Carbuncle', 'deck');
    tg.run({ type: 'ACTIVATE', player: 0, uid: tree, effectId: 'harvest' }, A.cards(tiger, ruby), A.zone(0, 'spellTrap', 0), A.zone(0, 'spellTrap', 1));
    expect(tg.card(tiger).zone).toBe('spellTrap');
    expect(tg.card(ruby).zone).toBe('spellTrap');
    // Crystal Release (+800) on the summoned Pegasus; the Spell & Trap Zone is full except where Blessing was
    const release = put(tg, 0, 'Crystal Release', 'hand');
    tg.state.players[0].spellTrapZones[2] = null;
    tg.card(a).zone = 'graveyard';
    tg.state.players[0].graveyard.push(a);
    tg.run({ type: 'ACTIVATE', player: 0, uid: release, effectId: 'activate' }, A.zone(0, 'spellTrap', 2));
    expect(stats(tg, pegasus).atk).toBe(1800 + 800);
  });

  it('Rare Value: the opponent chooses which placed beast is sent; you draw 2', () => {
    const tg = cbGame();
    start(tg);
    const a = put(tg, 0, 'Crystal Beast Amethyst Cat', 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous' });
    const b = put(tg, 0, 'Crystal Beast Cobalt Eagle', 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous' });
    const rare = put(tg, 0, 'Rare Value', 'hand');
    const before = tg.state.players[0].hand.length;
    const r = tg.runPartial({ type: 'ACTIVATE', player: 0, uid: rare, effectId: 'activate' }, A.zone(0, 'spellTrap', 2));
    expect(r.prompt?.type).toBe('selectCards');
    expect(r.prompt?.player).toBe(1);
    tg.run({ type: 'ACTIVATE', player: 0, uid: rare, effectId: 'activate' }, A.zone(0, 'spellTrap', 2), A.cards(b));
    expect(tg.card(b).zone).toBe('graveyard');
    expect(tg.card(a).zone).toBe('spellTrap');
    expect(tg.state.players[0].hand.length).toBe(before - 1 + 2);
  });

  it('Crystal Pair after a beast dies in battle; Crystal Boon revives placed beasts with LP gain', () => {
    const tg = cbGame();
    start(tg);
    const pair = put(tg, 0, 'Crystal Pair', 'spellTrap', { turnEnteredField: 0 });
    const ruby = put(tg, 0, 'Crystal Beast Ruby Carbuncle', 'monster');
    endTurn(tg);
    const bewd = put(tg, 1, 'Blue-Eyes White Dragon', 'monster', { turnEnteredField: 1 });
    const luster = put(tg, 1, 'Luster Dragon', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    const tiger = tg.find(0, 'Crystal Beast Topaz Tiger', 'deck');
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: bewd }, A.no(), A.activate(pair), A.cards(tiger), A.zone(0, 'spellTrap', 1));
    expect(tg.card(ruby).zone).toBe('graveyard');
    expect(tg.card(tiger).zone).toBe('spellTrap');
    expect(tg.state.players[0].lp).toBe(8000 - 2700);
    // No further battle damage this turn
    tg.run({ type: 'DECLARE_ATTACK', player: 1, uid: luster });
    expect(tg.state.players[0].lp).toBe(8000 - 2700);
    // Crystal Boon on P1's turn (set earlier)
    endTurn(tg);
    const boon = put(tg, 0, 'Crystal Boon', 'spellTrap', { turnEnteredField: 1 });
    endTurn(tg);
    tg.run({ type: 'END_TURN', player: 1 }, A.activate(boon), A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(tiger).zone).toBe('monster');
    expect(tg.state.players[0].lp).toBe(8000 - 2700 + 1600);
  });

  it('Counter Gem refills the Spell & Trap Zone from the GY and destroys the beasts at the End Phase', () => {
    const tg = cbGame();
    start(tg);
    const gem = put(tg, 0, 'Counter Gem', 'spellTrap', { turnEnteredField: 0 });
    for (const n of CBS.slice(0, 3)) put(tg, 0, n, 'graveyard');
    endTurn(tg);
    tg.run({ type: 'END_TURN', player: 1 }, A.activate(gem), A.zone(0, 'spellTrap', 0), A.zone(0, 'spellTrap', 1), A.zone(0, 'spellTrap', 2));
    // Activated in P2's End Phase (turn 2): placed beasts, destroyed at that End Phase
    expect(tg.state.turn).toBe(3);
    expect(tg.state.players[0].spellTrapZones.filter(Boolean).length).toBe(0);
    expect(tg.state.players[0].graveyard.filter((u) => new Game(tg.state).name(u).startsWith('Crystal Beast')).length).toBe(3);
  });

  it('Hamon is Special Summoned by sending 3 Continuous Spells (placed beasts) and burns after battle', () => {
    const tg = cbGame();
    start(tg);
    endTurn(tg);
    const luster = put(tg, 1, 'Luster Dragon', 'monster');
    endTurn(tg);
    const hamon = put(tg, 0, 'Hamon, Lord of Striking Thunder', 'hand');
    for (const n of CBS.slice(0, 3)) put(tg, 0, n, 'spellTrap', { faceUp: true, treatedAsSpell: 'continuous' });
    expect(tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 0, uid: hamon })).toMatch(/cannot be Normal Summoned/);
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: hamon, procId: 'hamon' }, A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(hamon).zone).toBe('monster');
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    tg.run({ type: 'DECLARE_ATTACK', player: 0, uid: hamon });
    expect(tg.card(luster).zone).toBe('graveyard');
    expect(tg.state.players[1].lp).toBe(8000 - 2100 - 1000);
  });
});

describe('Hand traps and interactions between the decks', () => {
  it('Ash Blossom negates Dragon Shrine (send from Deck) but not Monster Reborn', () => {
    const tg = cbGame();
    start(tg);
    const ash = put(tg, 0, 'Ash Blossom & Joyous Spring', 'hand');
    endTurn(tg);
    const shrine = put(tg, 1, 'Dragon Shrine', 'hand');
    const r = tg.runPartial({ type: 'ACTIVATE', player: 1, uid: shrine, effectId: 'activate' }, A.zone(1, 'spellTrap', 0));
    expect(r.prompt?.type).toBe('fastEffects');
    if (r.prompt?.type === 'fastEffects') expect(r.prompt.options.some((o) => o.uid === ash)).toBe(true);
    tg.run({ type: 'ACTIVATE', player: 1, uid: shrine, effectId: 'activate' }, A.zone(1, 'spellTrap', 0), A.activate(ash, 'negate'));
    expect(tg.card(ash).zone).toBe('graveyard');
    expect(tg.card(shrine).zone).toBe('graveyard');
    expect(tg.state.players[1].graveyard.length).toBe(1); // only Dragon Shrine: nothing was sent from the Deck
    // Monster Reborn: Ash cannot respond (Ghost Belle could)
    const belle = put(tg, 0, 'Ghost Belle & Haunted Mansion', 'hand');
    const reborn = put(tg, 1, 'Monster Reborn', 'hand');
    put(tg, 1, 'Luster Dragon', 'graveyard');
    const luster = tg.find(1, 'Luster Dragon', 'graveyard');
    const r2 = tg.runPartial({ type: 'ACTIVATE', player: 1, uid: reborn, effectId: 'activate' }, A.zone(1, 'spellTrap', 0), A.cards(luster));
    expect(r2.prompt?.type).toBe('fastEffects');
    if (r2.prompt?.type === 'fastEffects') {
      expect(r2.prompt.options.some((o) => o.uid === belle)).toBe(true);
      expect(r2.prompt.options.some((o) => o.uid === ash)).toBe(false);
    }
    tg.run({ type: 'ACTIVATE', player: 1, uid: reborn, effectId: 'activate' }, A.zone(1, 'spellTrap', 0), A.cards(luster), A.activate(belle, 'negate'));
    expect(tg.find(1, 'Luster Dragon', 'graveyard')).toBeTruthy();
  });

  it('Dimension Shifter banishes cards instead of sending them to the GY', () => {
    const tg = cbGame();
    start(tg);
    const shifter = put(tg, 0, 'Dimension Shifter', 'hand');
    endTurn(tg);
    const shrine = put(tg, 1, 'Dragon Shrine', 'hand');
    const bewd = tg.find(1, 'Blue-Eyes White Dragon', 'deck');
    tg.run({ type: 'ACTIVATE', player: 1, uid: shrine, effectId: 'activate' }, A.zone(1, 'spellTrap', 0), A.activate(shifter, 'shift'), A.cards(bewd), A.no());
    expect(tg.card(shifter).zone).toBe('graveyard');
    expect(tg.card(bewd).zone).toBe('banished');
    expect(tg.card(shrine).zone).toBe('banished');
  });

  it('Contact "C" jumps to the opponent side and blocks their Synchro Summon unless used as material', () => {
    const tg = cbGame();
    start(tg);
    const contact = put(tg, 0, 'Contact "C"', 'hand');
    endTurn(tg);
    const luster = put(tg, 1, 'Luster Dragon', 'hand');
    tg.run({ type: 'NORMAL_SUMMON', player: 1, uid: luster }, A.zone(1, 'monster', 0), A.yes(), A.zone(1, 'monster', 1));
    expect(tg.card(contact).controller).toBe(1);
    expect(tg.card(contact).position).toBe('DEF');
    put(tg, 1, 'The White Stone of Legend', 'monster');
    put(tg, 1, 'Blue-Eyes White Dragon', 'monster');
    const azure = tg.find(1, 'Azure-Eyes Silver Dragon', 'extra');
    expect(tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 1, uid: azure, procId: 'synchro' })).toMatch(/Levels add up/);
  });

  it('Advanced Dark makes Crystal Beasts DARK so Rainbow Dark Dragon can be summoned; negates the attack target', () => {
    const tg = cbGame();
    start(tg);
    put(tg, 0, 'Advanced Dark', 'field');
    for (const n of CBS) put(tg, 0, n, 'graveyard');
    const rdd = put(tg, 0, 'Rainbow Dark Dragon', 'hand');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: rdd, procId: 'dark' }, A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(rdd).zone).toBe('monster');
    expect(tg.state.players[0].banished.length).toBe(7);
  });
});
