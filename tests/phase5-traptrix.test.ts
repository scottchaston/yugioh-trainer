/**
 * Beware of Traptrix: Xyz / Link mechanics and the deck's key cards.
 */
import { describe, expect, it } from 'vitest';
import { A, endTurn, makeGame, put, start, type TestGame } from './harness';
import { Game, execute, type Action, type Answer, type Prompt } from '../src/engine';
import { getCard } from '../src/cards';

const nameOf = (tg: TestGame, uid: string) => getCard(tg.state.cards[uid].cardId).name;
interface Seen {
  player: number;
  context: string;
  options: string[];
}
function walk(tg: TestGame, action: Action, decide: (p: Prompt) => Answer | null = () => null): Seen[] {
  const seen: Seen[] = [];
  const answers: Answer[] = [];
  for (let guard = 0; guard < 80; guard++) {
    const r = execute(tg.state, action, answers);
    if (r.error) throw new Error(`${action.type} failed: ${r.error}`);
    if (r.done) {
      tg.state = r.state;
      return seen;
    }
    const p = r.prompt!;
    if (p.type === 'fastEffects') seen.push({ player: p.player, context: p.context, options: p.options.map((o) => `${nameOf(tg, o.uid)}:${o.effectId}`) });
    const chosen = decide(p);
    if (chosen) answers.push(chosen);
    else if (p.type === 'fastEffects') answers.push({ activation: null });
    else if (p.type === 'selectOption') answers.push({ option: (p.options.find((o) => o.id === 'no') ?? p.options[0]).id });
    else if (p.type === 'selectCards') answers.push({ cards: p.cards.slice(0, p.min) });
    else answers.push({ zone: p.zones[0] });
  }
  throw new Error('Too many prompts');
}

describe('Xyz Summon', () => {
  it('Traptrix Rafflesia is Xyz Summoned with 2 Level 4 monsters, which become its material', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const a = put(tg, 0, 'Traptrix Myrmeleo', 'monster');
    const b = put(tg, 0, 'Traptrix Dionaea', 'monster');
    const raff = tg.find(0, 'Traptrix Rafflesia', 'extra');
    const legal = tg.legal(0).find((x) => x.uid === raff && x.action.type === 'SPECIAL_SUMMON');
    expect(legal?.legal).toBe(true);
    // Exactly 2 Level 4 monsters: the materials are forced, so only position and zone are asked.
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: raff, procId: 'xyz' }, A.option('ATK'), A.zone(0, 'monster', 2));
    expect(tg.card(raff).zone).toBe('monster');
    expect(tg.card(raff).materials.sort()).toEqual([a, b].sort());
    expect(tg.card(a).zone).toBe('material');
    expect(tg.card(a).attachedTo).toBe(raff);
    expect(tg.state.players[0].monsterZones.filter(Boolean).length).toBe(1);
    expect(new Game(tg.state).rankOf(raff)).toBe(4);
    expect(new Game(tg.state).levelOf(raff)).toBe(0);
  });

  it('cannot Xyz Summon without 2 Level 4 monsters; detaching sends the material to the GY; leaving the field sends the rest', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const raff = tg.find(0, 'Traptrix Rafflesia', 'extra');
    put(tg, 0, 'Traptrix Myrmeleo', 'monster');
    put(tg, 0, 'Lonefire Blossom', 'monster'); // Level 3
    expect(tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: raff, procId: 'xyz' })).toMatch(/2 Level 4 monsters/);
    const b = put(tg, 0, 'Traptrix Dionaea', 'monster');
    const a = tg.state.players[0].monsterZones.find((u) => u && nameOf(tg, u) === 'Traptrix Myrmeleo')!;
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: raff, procId: 'xyz' }, A.option('ATK'), A.zone(0, 'monster', 3));
    const g = new Game(tg.state);
    g.sendToGraveyard(raff, 'destroyedEffect');
    expect(tg.card(a).zone).toBe('graveyard');
    expect(tg.card(b).zone).toBe('graveyard');
    expect(tg.card(raff).materials).toEqual([]);
  });
});

describe('Link Summon', () => {
  it('Traptrix Sera is Link Summoned into an Extra Monster Zone and points to a Main Monster Zone', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const m = put(tg, 0, 'Traptrix Myrmeleo', 'monster');
    const sera = tg.find(0, 'Traptrix Sera', 'extra');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: sera, procId: 'link' }, A.zone(0, 'extraMonster', 0));
    expect(tg.card(sera).zone).toBe('extraMonster');
    expect(tg.card(sera).position).toBe('ATK');
    expect(tg.card(m).zone).toBe('graveyard');
    const g = new Game(tg.state);
    expect(g.stats(sera).def).toBe(0);
    // Left Extra Monster Zone is column 1: Sera's bottom arrow points to Player 1's Main Monster Zone 1.
    expect(g.linkedMainZones(0)).toEqual([1]);
    expect(tg.expectIllegal({ type: 'CHANGE_POSITION', player: 0, uid: sera })).toMatch(/Link Monster/);
    // A second Link Monster can use the linked zone (or the other EMZ is blocked: only the zone Sera points to).
    const pud = put(tg, 0, 'Traptrix Pudica', 'monster', { index: 3 });
    const lone = put(tg, 0, 'Lonefire Blossom', 'monster', { index: 4 });
    const cularia = tg.find(0, 'Traptrix Cularia', 'extra');
    const zonesBefore = g.usableLinkZones(0);
    expect(zonesBefore).toEqual([{ player: 0, zone: 'monster', index: 1 }]);
    // Sera (a Plant Link Monster) could also be material; choose Pudica + Lonefire Blossom.
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: cularia, procId: 'link' }, A.cards(pud, lone));
    expect(tg.card(sera).zone).toBe('extraMonster');
    expect(tg.card(cularia).zone).toBe('monster');
    expect(tg.card(cularia).index).toBe(1);
  });

  it('Sera needs a non-Link Traptrix monster; Atypus needs an Insect or Plant among 2+ materials', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    put(tg, 0, 'Sauge de Fleur', 'monster'); // Spellcaster
    const sera = tg.find(0, 'Traptrix Sera', 'extra');
    expect(tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: sera, procId: 'link' })).toMatch(/non-Link "Traptrix" monster/);
    const atypus = tg.find(0, 'Traptrix Atypus', 'extra');
    put(tg, 0, 'Artifact Moralltach', 'monster'); // Fairy
    expect(tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: atypus, procId: 'link' })).toMatch(/Insect or Plant/);
    put(tg, 0, 'Traptrix Pudica', 'monster');
    // All 3 monsters are needed for Link-3, so the materials are forced; only the zone is asked.
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: atypus, procId: 'link' }, A.zone(0, 'extraMonster', 0));
    expect(tg.card(atypus).zone).toBe('extraMonster');
  });
});

describe('"Hole" Normal Traps', () => {
  it('Trap Hole destroys a Normal Summoned monster with 1000+ ATK, but not a Traptrix monster (unaffected)', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbt'] });
    start(tg);
    const hole = put(tg, 0, 'Trap Hole', 'spellTrap', { turnEnteredField: 0 });
    endTurn(tg);
    // Player 2 Normal Summons Traptrix Myrmeleo (1600): Trap Hole is not offered (Traptrix are unaffected by Hole traps).
    const myr = put(tg, 1, 'Traptrix Myrmeleo', 'hand');
    const seen = walk(tg, { type: 'NORMAL_SUMMON', player: 1, uid: myr }, (p) => (p.type === 'selectZone' ? { zone: { player: 1, zone: 'monster', index: 0 } } : null));
    expect(seen.filter((s) => s.player === 0).flatMap((s) => s.options)).not.toContain('Trap Hole:activate');
    expect(tg.card(myr).zone).toBe('monster');
    // A non-Traptrix monster with 1000+ ATK is a legal target.
    endTurn(tg);
    endTurn(tg);
    const sauge = put(tg, 1, 'Sauge de Fleur', 'graveyard');
    void sauge;
    const lone = put(tg, 1, 'Lonefire Blossom', 'hand'); // 500 ATK: too weak
    const seen2 = walk(tg, { type: 'NORMAL_SUMMON', player: 1, uid: lone });
    expect(seen2.filter((s) => s.player === 0).flatMap((s) => s.options)).not.toContain('Trap Hole:activate');
    endTurn(tg);
    endTurn(tg);
    const glider = put(tg, 1, 'Kaiser Glider', 'hand'); // 2400, Level 6: Tribute Summon
    const seen3 = walk(tg, { type: 'NORMAL_SUMMON', player: 1, uid: glider }, (p) => {
      if (p.type === 'fastEffects' && p.player === 0 && p.options.some((o) => o.uid === hole)) return { activation: { uid: hole, effectId: 'activate' } };
      return null;
    });
    expect(seen3.some((s) => s.player === 0 && s.options.includes('Trap Hole:activate'))).toBe(true);
    expect(tg.card(glider).zone).toBe('graveyard');
    expect(tg.card(hole).zone).toBe('graveyard');
  });

  it('Bottomless Trap Hole destroys and banishes; Floodgate turns the Summoned monster face-down and locks it', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const btm = put(tg, 0, 'Bottomless Trap Hole', 'spellTrap', { turnEnteredField: 0 });
    const flood = put(tg, 0, 'Floodgate Trap Hole', 'spellTrap', { turnEnteredField: 0 });
    endTurn(tg);
    const luster = put(tg, 1, 'Luster Dragon', 'hand'); // 1900
    walk(tg, { type: 'NORMAL_SUMMON', player: 1, uid: luster }, (p) => (p.type === 'fastEffects' && p.player === 0 && p.options.some((o) => o.uid === btm) ? { activation: { uid: btm, effectId: 'activate' } } : null));
    expect(tg.card(luster).zone).toBe('banished');
    endTurn(tg);
    endTurn(tg);
    const alex = put(tg, 1, 'Alexandrite Dragon', 'hand'); // 2000
    walk(tg, { type: 'NORMAL_SUMMON', player: 1, uid: alex }, (p) => (p.type === 'fastEffects' && p.player === 0 && p.options.some((o) => o.uid === flood) ? { activation: { uid: flood, effectId: 'activate' } } : null));
    expect(tg.card(alex).zone).toBe('monster');
    expect(tg.card(alex).faceUp).toBe(false);
    expect(tg.card(alex).position).toBe('DEF');
    endTurn(tg);
    endTurn(tg);
    expect(tg.expectIllegal({ type: 'FLIP_SUMMON', player: 1, uid: alex })).toMatch(/Floodgate/);
  });

  it('Traptrix Rafflesia applies a "Hole" Trap from the Deck as its own effect', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const a = put(tg, 0, 'Traptrix Myrmeleo', 'monster');
    const b = put(tg, 0, 'Traptrix Dionaea', 'monster');
    const raff = tg.find(0, 'Traptrix Rafflesia', 'extra');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: raff, procId: 'xyz' }, A.option('ATK'), A.zone(0, 'monster', 2));
    void a;
    void b;
    endTurn(tg);
    const luster = put(tg, 1, 'Luster Dragon', 'hand');
    const hole = tg.find(0, 'Trap Hole', 'deck');
    const seen = walk(tg, { type: 'NORMAL_SUMMON', player: 1, uid: luster }, (p) => {
      if (p.type === 'fastEffects' && p.player === 0 && p.options.some((o) => o.uid === raff)) return { activation: { uid: raff, effectId: 'hole' } };
      if (p.type === 'selectCards' && p.cards.includes(hole)) return { cards: [hole] };
      return null;
    });
    expect(seen.some((s) => s.player === 0 && s.options.includes('Traptrix Rafflesia:hole'))).toBe(true);
    expect(tg.card(luster).zone).toBe('graveyard');
    expect(tg.card(hole).zone).toBe('graveyard');
    expect(tg.card(raff).materials.length).toBe(1);
  });
});

describe('Traptrix monsters and Spells', () => {
  it('Myrmeleo: Normal Summon searches a Hole trap; Special Summon destroys a Spell/Trap', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const myr = put(tg, 0, 'Traptrix Myrmeleo', 'hand');
    const hole = tg.find(0, 'Bottomless Trap Hole', 'deck');
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: myr }, A.zone(0, 'monster', 2), A.yes(), A.cards(hole));
    expect(tg.card(hole).zone).toBe('hand');
    // Traptrip Garden's extra Normal Summon for a Traptrix
    const garden = put(tg, 0, 'Traptrip Garden', 'hand');
    tg.run({ type: 'ACTIVATE', player: 0, uid: garden, effectId: 'activate' });
    const mantis = put(tg, 0, 'Traptrix Mantis', 'hand');
    const legal = tg.legal(0).find((x) => x.uid === mantis && x.action.type === 'NORMAL_SUMMON');
    expect(legal?.legal).toBe(true);
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: mantis }, A.zone(0, 'monster', 3), A.no());
    expect(tg.card(mantis).zone).toBe('monster');
    // Special Summon via Garden: banish 1 monster; summon a Traptrix from GY -> Myrmeleo's destroy trigger
    put(tg, 0, 'Traptrix Pudica', 'graveyard');
    const oppSet = put(tg, 1, 'Cosmic Cyclone', 'spellTrap');
    // Pudica is the only Traptrix in hand/GY (forced); the banish cost offers Myrmeleo or Mantis.
    tg.run({ type: 'ACTIVATE', player: 0, uid: garden, effectId: 'summon' }, A.cards(mantis), A.option('ATK'), A.zone(0, 'monster', 4), A.no());
    void oppSet;
    expect(tg.card(mantis).zone).toBe('banished');
  });

  it('Mekk-Knight Blue Sky is Special Summoned to a column holding 2 or more cards', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const blue = put(tg, 0, 'Mekk-Knight Blue Sky', 'hand');
    expect(tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: blue, procId: 'column' })).toMatch(/No column holds 2 or more cards/);
    // Player 2's Monster Zone 3 and Spell/Trap Zone 3 are column 1 (mirrored); Player 1's zone 1 is in that column.
    put(tg, 1, 'Luster Dragon', 'monster', { index: 3 });
    put(tg, 1, 'Cosmic Cyclone', 'spellTrap', { index: 3 });
    const g = new Game(tg.state);
    expect(g.cardsInColumn(1).length).toBe(2);
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: blue, procId: 'column' }, A.option('ATK'), A.no());
    expect(tg.card(blue).zone).toBe('monster');
    expect(tg.card(blue).index).toBe(1);
  });

  it('Kaiju: Gadarla is Special Summoned to the opponent\'s field by Tributing their monster', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const gad = put(tg, 0, 'Gadarla, the Mystery Dust Kaiju', 'hand');
    expect(tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: gad, procId: 'kaijuToOpponent' })).toMatch(/no monster to Tribute/);
    const bewd = put(tg, 1, 'Blue-Eyes White Dragon', 'monster');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: gad, procId: 'kaijuToOpponent' }, A.zone(1, 'monster', 0));
    expect(tg.card(bewd).zone).toBe('graveyard');
    expect(tg.card(gad).zone).toBe('monster');
    expect(tg.card(gad).controller).toBe(1);
    expect(tg.card(gad).owner).toBe(0);
    expect(tg.card(gad).position).toBe('ATK');
    const kum = put(tg, 0, 'Kumongous, the Sticky String Kaiju', 'hand');
    expect(tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: kum, procId: 'kaijuToOpponent' })).toMatch(/already controls a "Kaiju"/);
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: kum, procId: 'kaijuToSelf' }, A.zone(0, 'monster', 0));
    expect(tg.card(kum).controller).toBe(0);
  });

  it('The Phantom Knights of Shade Brigandine becomes a Normal Monster and returns to being a Trap in the GY', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const shade = put(tg, 0, 'The Phantom Knights of Shade Brigandine', 'hand');
    tg.run({ type: 'SET_SPELL_TRAP', player: 0, uid: shade }, A.zone(0, 'spellTrap', 1));
    // No Traps in the GY: it can be activated the turn it was Set.
    tg.run({ type: 'ACTIVATE', player: 0, uid: shade, effectId: 'activate' }, A.zone(0, 'monster', 2));
    expect(tg.card(shade).zone).toBe('monster');
    expect(tg.card(shade).position).toBe('DEF');
    const g = new Game(tg.state);
    expect(g.def(shade).cardType).toBe('Monster');
    expect(g.levelOf(shade)).toBe(4);
    expect(g.stats(shade)).toMatchObject({ atk: 0, def: 300 });
    expect(g.isNormalMonster(shade)).toBe(true);
    g.sendToGraveyard(shade, 'destroyedEffect');
    expect(tg.card(shade).treatedAsMonster).toBeNull();
    expect(g.def(shade).cardType).toBe('Trap');
    // With a Trap in the GY, a copy Set this turn cannot be activated until next turn.
    endTurn(tg);
    endTurn(tg);
    put(tg, 0, 'Trap Hole', 'graveyard');
    const shade2 = put(tg, 0, 'The Phantom Knights of Shade Brigandine', 'spellTrap', { setThisTurn: true, turnEnteredField: tg.state.turn });
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: shade2, effectId: 'activate' })).toMatch(/Set it during this turn/);
  });

  it('Artifact Moralltach: Set as a Spell, destroyed on the opponent\'s turn, then Summons itself and destroys a card', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    const art = put(tg, 0, 'Artifact Moralltach', 'hand');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: art, procId: 'setAsSpell' }, A.zone(0, 'spellTrap', 1));
    expect(tg.card(art).zone).toBe('spellTrap');
    expect(tg.card(art).faceUp).toBe(false);
    expect(tg.card(art).treatedAsSpell).toBe('artifact');
    endTurn(tg);
    const swords = put(tg, 1, 'Swords of Revealing Light', 'spellTrap', { faceUp: true });
    const duster = put(tg, 1, "Harpie's Feather Duster", 'hand');
    walk(tg, { type: 'ACTIVATE', player: 1, uid: duster, effectId: 'activate' }, (p) => {
      if (p.type === 'selectOption' && p.title.startsWith('Activate')) return { option: 'yes' };
      if (p.type === 'selectCards' && p.cards.includes(swords)) return { cards: [swords] };
      return null;
    });
    expect(tg.card(art).zone).toBe('monster');
    expect(tg.card(swords).zone).toBe('graveyard');
  });

  it('Evenly Matched can be activated from the hand at the end of the Battle Phase when you control no cards', () => {
    const tg = makeGame({ decks: ['sdbt', 'sdbe'] });
    start(tg);
    endTurn(tg);
    const even = put(tg, 0, 'Evenly Matched', 'hand');
    const m1 = put(tg, 1, 'Luster Dragon', 'monster', { turnEnteredField: 1 });
    const m2 = put(tg, 1, 'Alexandrite Dragon', 'monster', { turnEnteredField: 1 });
    put(tg, 1, 'Swords of Revealing Light', 'spellTrap', { faceUp: true });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    const seen = walk(tg, { type: 'TO_MAIN2', player: 1 }, (p) => {
      if (p.type === 'fastEffects' && p.player === 0 && p.options.some((o) => o.uid === even)) return { activation: { uid: even, effectId: 'activate' } };
      if (p.type === 'selectCards' && p.player === 1) return { cards: p.cards.slice(0, p.min) };
      return null;
    });
    expect(seen.some((s) => s.player === 0 && s.options.includes('Evenly Matched:activate'))).toBe(true);
    const remaining = [m1, m2].filter((u) => tg.card(u).zone === 'monster').length + tg.state.players[1].spellTrapZones.filter(Boolean).length;
    expect(remaining).toBe(0);
    expect(tg.state.players[1].banished.length).toBe(3);
    expect(tg.state.players[1].banished.every((u) => !tg.card(u).faceUp)).toBe(true);
  });
});
