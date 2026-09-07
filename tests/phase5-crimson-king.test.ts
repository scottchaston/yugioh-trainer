/**
 * The Crimson King: multi-Tuner Synchro Summons, Red Dragon Archfiend and its support.
 */
import { describe, expect, it } from 'vitest';
import { A, endTurn, makeGame, put, start, type TestGame } from './harness';
import { Game, execute, type Action, type Answer, type Prompt } from '../src/engine';
import { getCard } from '../src/cards';

const nameOf = (tg: TestGame, uid: string) => getCard(tg.state.cards[uid].cardId).name;
const stats = (tg: TestGame, uid: string) => new Game(tg.state).stats(uid);
function walk(tg: TestGame, action: Action, decide: (p: Prompt) => Answer | null = () => null): { player: number; context: string; options: string[] }[] {
  const seen: { player: number; context: string; options: string[] }[] = [];
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

describe('Red Dragon Archfiend Synchro Summons', () => {
  it('Red Dragon Archfiend (Level 8): Dark Resonator (3) + Vice Dragon (5); Red Nova needs 2 Tuners + Red Dragon Archfiend', () => {
    const tg = makeGame({ decks: ['sdck', 'sdbe'] });
    start(tg);
    put(tg, 0, 'Dark Resonator', 'monster');
    put(tg, 0, 'Vice Dragon', 'monster');
    const rda = tg.find(0, 'Red Dragon Archfiend', 'extra');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: rda, procId: 'synchro' }, A.option('ATK'), A.zone(0, 'monster', 2));
    expect(tg.card(rda).zone).toBe('monster');
    expect(tg.card(rda).properlySummoned).toBe(true);
    // Red Nova Dragon: 2 Tuners + "Red Dragon Archfiend" = Level 12 (2 + 2 + 8)
    const nova = tg.find(0, 'Red Nova Dragon', 'extra');
    expect(tg.expectIllegal({ type: 'SPECIAL_SUMMON', player: 0, uid: nova, procId: 'synchro' })).toMatch(/2 Tuners/);
    put(tg, 0, 'Red Resonator', 'monster'); // Level 2
    put(tg, 0, 'Crimson Resonator', 'monster'); // Level 2
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: nova, procId: 'synchro' }, A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(nova).zone).toBe('monster');
    expect(tg.card(rda).zone).toBe('graveyard');
    // 500 ATK per Tuner in the GY: Dark, Red, Crimson Resonator = 3 Tuners
    expect(stats(tg, nova).atk).toBe(3500 + 1500);
  });

  it('Scarlight is treated as "Red Dragon Archfiend" on the field and in the GY; Bane needs a DARK Dragon Synchro as material', () => {
    const tg = makeGame({ decks: ['sdck', 'sdbe'] });
    start(tg);
    put(tg, 0, 'Dark Resonator', 'monster');
    put(tg, 0, 'Vice Dragon', 'monster');
    const scar = tg.find(0, 'Scarlight Red Dragon Archfiend', 'extra');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: scar, procId: 'synchro' }, A.option('ATK'), A.zone(0, 'monster', 2));
    const g = new Game(tg.state);
    expect(g.isNamed(scar, 'Red Dragon Archfiend')).toBe(true);
    // Absolute Powerforce targets "Red Dragon Archfiend": Scarlight qualifies.
    const apf = put(tg, 0, 'Absolute Powerforce', 'hand');
    tg.run({ type: 'ACTIVATE', player: 0, uid: apf, effectId: 'activate' }, A.zone(0, 'spellTrap', 0));
    expect(tg.card(scar).flags['piercingThisTurn']).toBe(true);
    // Bane: 1 Tuner + 1 non-Tuner DARK Dragon Synchro (Scarlight, Level 8) + Level 2 Tuner = 10
    put(tg, 0, 'Red Resonator', 'monster');
    const bane = tg.find(0, 'Hot Red Dragon Archfiend Bane', 'extra');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: bane, procId: 'synchro' }, A.option('ATK'), A.zone(0, 'monster', 0));
    expect(tg.card(bane).zone).toBe('monster');
    expect(tg.card(scar).zone).toBe('graveyard');
    // Bane can Tribute a monster to revive a "Red Dragon Archfiend" monster: Scarlight in the GY still counts.
    put(tg, 0, 'Synkron Resonator', 'monster');
    tg.run({ type: 'ACTIVATE', player: 0, uid: bane, effectId: 'revive' }, A.cards(tg.state.players[0].monsterZones.find((u) => u && nameOf(tg, u) === 'Synkron Resonator')!), A.option('ATK'), A.zone(0, 'monster', 1), A.no());
    expect(tg.card(scar).zone).toBe('monster');
  });

  it('Red Dragon Archfiend destroys your other non-attacking monsters in the End Phase and the opponent\'s Defense monsters when it attacks one', () => {
    const tg = makeGame({ decks: ['sdck', 'sdbe'] });
    start(tg);
    endTurn(tg);
    endTurn(tg);
    const rda = put(tg, 0, 'Red Dragon Archfiend', 'monster', { turnEnteredField: 1 });
    tg.state.cards[rda].properlySummoned = true;
    const idle = put(tg, 0, 'Dark Resonator', 'monster', { turnEnteredField: 1 });
    const d1 = put(tg, 1, 'Luster Dragon', 'monster', { position: 'DEF' });
    const d2 = put(tg, 1, 'Alexandrite Dragon', 'monster', { position: 'DEF' });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 0 });
    walk(tg, { type: 'DECLARE_ATTACK', player: 0, uid: rda }, (p) => (p.type === 'selectCards' && p.cards.includes(d1) ? { cards: [d1] } : null));
    expect(tg.card(d1).zone).toBe('graveyard');
    expect(tg.card(d2).zone).toBe('graveyard'); // destroyed by the effect after damage calculation
    tg.run({ type: 'TO_MAIN2', player: 0 });
    walk(tg, { type: 'END_TURN', player: 0 });
    expect(tg.card(idle).zone).toBe('graveyard');
    expect(tg.card(rda).zone).toBe('monster');
  });
});

describe('Resonators and support', () => {
  it('Red Resonator Normal Summon lets you Special Summon a Level 4 or lower monster from the hand; Red Warg follows a Resonator Normal Summon', () => {
    const tg = makeGame({ decks: ['sdck', 'sdbe'] });
    start(tg);
    const red = put(tg, 0, 'Red Resonator', 'hand');
    const bone = put(tg, 0, 'Bone Archfiend', 'hand');
    const warg = put(tg, 0, 'Red Warg', 'hand');
    walk(tg, { type: 'NORMAL_SUMMON', player: 0, uid: red }, (p) => {
      if (p.type === 'selectOption' && p.title.startsWith('Activate')) return { option: 'yes' };
      if (p.type === 'selectCards' && p.cards.includes(bone)) return { cards: [bone] };
      if (p.type === 'selectOption' && p.options.some((o) => o.id === 'ATK')) return { option: 'ATK' };
      return null;
    });
    expect(tg.card(bone).zone).toBe('monster');
    expect(tg.card(warg).zone).toBe('monster');
    expect(stats(tg, warg).atk).toBe(700);
  });

  it('Crimson Resonator Special Summons itself with an empty field and later calls 2 Resonators beside a DARK Dragon Synchro', () => {
    const tg = makeGame({ decks: ['sdck', 'sdbe'] });
    start(tg);
    const crimson = put(tg, 0, 'Crimson Resonator', 'hand');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: crimson, procId: 'crimson' }, A.option('ATK'), A.zone(0, 'monster', 2));
    expect(tg.card(crimson).zone).toBe('monster');
    expect(tg.state.players[0].turnFlags['extraDeckOnly']).toEqual(['darkDragonSynchro']);
    // Only a DARK Dragon Synchro beside it: call 2 Resonators from the Deck.
    const rda = put(tg, 0, 'Red Dragon Archfiend', 'monster', { index: 3 });
    const r1 = tg.find(0, 'Dark Resonator', 'deck');
    const r2 = tg.find(0, 'Synkron Resonator', 'deck');
    tg.run({ type: 'ACTIVATE', player: 0, uid: crimson, effectId: 'call' }, A.cards(r1, r2), A.option('ATK'), A.zone(0, 'monster', 0), A.option('ATK'), A.zone(0, 'monster', 1));
    expect(tg.card(r1).zone).toBe('monster');
    expect(tg.card(r2).zone).toBe('monster');
    void rda;
  });

  it('Battle Fader stops a direct attack and ends the Battle Phase', () => {
    const tg = makeGame({ decks: ['sdck', 'sdbe'] });
    start(tg);
    endTurn(tg);
    const fader = put(tg, 0, 'Battle Fader', 'hand');
    const luster = put(tg, 1, 'Luster Dragon', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    walk(tg, { type: 'DECLARE_ATTACK', player: 1, uid: luster }, (p) => (p.type === 'fastEffects' && p.player === 0 && p.options.some((o) => o.uid === fader) ? { activation: { uid: fader, effectId: 'fade' } } : null));
    expect(tg.card(fader).zone).toBe('monster');
    expect(tg.state.players[0].lp).toBe(8000);
    expect(tg.state.phase).toBe('MAIN2');
    const g = new Game(tg.state);
    g.sendToGraveyard(fader, 'destroyedEffect');
    expect(tg.card(fader).zone).toBe('banished');
  });

  it('Assault Mode Activate Tributes Red Dragon Archfiend for Red Dragon Archfiend/Assault Mode from the Deck', () => {
    const tg = makeGame({ decks: ['sdck', 'sdbe'] });
    start(tg);
    const ama = put(tg, 0, 'Assault Mode Activate', 'spellTrap', { turnEnteredField: 0 });
    const rda = put(tg, 0, 'Red Dragon Archfiend', 'monster');
    tg.state.cards[rda].properlySummoned = true;
    const assault = tg.find(0, 'Red Dragon Archfiend/Assault Mode', 'deck');
    expect(tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 0, uid: put(tg, 0, 'Red Dragon Archfiend/Assault Mode', 'hand') })).toMatch(/cannot be Normal Summoned/);
    put(tg, 0, 'Red Dragon Archfiend/Assault Mode', 'deckTop');
    tg.run({ type: 'ACTIVATE', player: 0, uid: ama, effectId: 'activate' }, A.zone(0, 'monster', 0));
    expect(tg.card(assault).zone).toBe('monster');
    expect(tg.card(assault).position).toBe('ATK');
    expect(tg.card(rda).zone).toBe('graveyard');
  });

  it('Pot of Extravagance only at the start of Main Phase 1; it banishes random Extra Deck cards face-down and draws', () => {
    const tg = makeGame({ decks: ['sdck', 'sdbe'], seed: 5 });
    start(tg);
    const pot = put(tg, 0, 'Pot of Extravagance', 'hand');
    const before = tg.state.players[0].hand.length;
    tg.run({ type: 'ACTIVATE', player: 0, uid: pot, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.option('6'));
    expect(tg.state.players[0].banished.length).toBe(6);
    expect(tg.state.players[0].banished.every((u) => !tg.card(u).faceUp)).toBe(true);
    expect(tg.state.players[0].extra.length).toBe(3);
    expect(tg.state.players[0].hand.length).toBe(before - 1 + 2);
    // After acting, it is no longer "the start of Main Phase 1".
    const pot2 = put(tg, 0, 'Pot of Extravagance', 'hand');
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: pot2, effectId: 'activate' })).toMatch(/first thing/);
  });

  it('Danger! Nessie!: the opponent discards a random card; if it was not Nessie, Nessie is Summoned and a card drawn', () => {
    const tg = makeGame({ decks: ['sdck', 'sdbe'], seed: 9 });
    start(tg);
    const nessie = put(tg, 0, 'Danger! Nessie!', 'hand');
    // Make the hand deterministic: Nessie + 1 other card.
    tg.state.players[0].hand = tg.state.players[0].hand.filter((u) => u === nessie);
    const other = put(tg, 0, 'Vice Dragon', 'hand');
    const deckBefore = tg.state.players[0].deck.length;
    tg.run({ type: 'ACTIVATE', player: 0, uid: nessie, effectId: 'reveal' }, A.option('ATK'), A.zone(0, 'monster', 0));
    const discardedNessie = tg.card(nessie).zone === 'graveyard';
    if (discardedNessie) {
      expect(tg.card(other).zone).toBe('hand');
      expect(tg.state.players[0].deck.length).toBe(deckBefore);
    } else {
      expect(tg.card(other).zone).toBe('graveyard');
      expect(tg.card(nessie).zone).toBe('monster');
      expect(tg.state.players[0].deck.length).toBe(deckBefore - 1);
    }
  });
});
