/**
 * Regression tests for the rules-engine issues found in the independent review:
 *  1. proper-Summon status survives the GY / banishment,
 *  2. Damage Step timing (Honest and other ATK/DEF modifiers stop at damage calculation),
 *  3. normal response priority (the turn player may chain to / respond to their own actions),
 *  4. "send to the GY" costs can only be paid with cards that really go to the GY.
 */
import { describe, expect, it } from 'vitest';
import { A, endTurn, makeGame, put, start, type TestGame } from './harness';
import { Game, execute, getScript, type Action, type Answer, type PlayerId, type Prompt } from '../src/engine';
import { damageStepTimingProblem } from '../src/engine/flow';
import { getCard } from '../src/cards';

const stats = (tg: TestGame, uid: string) => new Game(tg.state).stats(uid);
const nameOf = (tg: TestGame, uid: string) => getCard(tg.state.cards[uid].cardId).name;

interface Seen {
  player: PlayerId;
  context: string;
  options: string[];
}

/**
 * Run an action while recording every response window it opens (who was asked, at what moment, with which
 * options). `decide` may activate something at a given moment; everything else is declined / answered neutrally.
 */
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

// ---------------------------------------------------------------------------
// 1. Proper Summon status
// ---------------------------------------------------------------------------
describe('Proper Special Summon status is kept in the Graveyard and while banished', () => {
  function synchroAzure(tg: TestGame): string {
    put(tg, 0, 'Blue-Eyes White Dragon', 'monster');
    put(tg, 0, 'The White Stone of Legend', 'monster');
    const azure = tg.find(0, 'Azure-Eyes Silver Dragon', 'extra');
    tg.run({ type: 'SPECIAL_SUMMON', player: 0, uid: azure, procId: 'synchro' }, A.option('ATK'), A.zone(0, 'monster', 2));
    expect(tg.card(azure).properlySummoned).toBe(true);
    return azure;
  }

  it('a properly Synchro Summoned Azure-Eyes that was Tributed can be revived with Monster Reborn', () => {
    const tg = makeGame();
    start(tg);
    const azure = synchroAzure(tg);
    // Tribute Summon Kaiser Glider (Level 6) using Azure-Eyes as the Tribute.
    const glider = put(tg, 0, 'Kaiser Glider', 'hand');
    // Azure-Eyes is the only monster, so the Tribute is forced (no card prompt); only the zone is asked.
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: glider }, A.zone(0, 'monster', 0));
    expect(tg.card(azure).zone).toBe('graveyard');
    expect(tg.card(azure).properlySummoned).toBe(true);
    // Monster Reborn may target it and Special Summon it.
    const reborn = put(tg, 0, 'Monster Reborn', 'hand');
    const legal = tg.legal(0).find((a) => a.uid === reborn && a.action.type === 'ACTIVATE');
    expect(legal?.legal).toBe(true);
    tg.run({ type: 'ACTIVATE', player: 0, uid: reborn, effectId: 'activate' }, A.zone(0, 'spellTrap', 0), A.cards(azure), A.option('ATK'), A.zone(0, 'monster', 1));
    expect(tg.card(azure).zone).toBe('monster');
    expect(tg.card(azure).properlySummoned).toBe(true);
  });

  it('an Azure-Eyes that reached the Graveyard without a proper Synchro Summon cannot be revived', () => {
    const tg = makeGame();
    start(tg);
    const azure = put(tg, 0, 'Azure-Eyes Silver Dragon', 'graveyard');
    expect(tg.card(azure).properlySummoned).toBe(false);
    const reborn = put(tg, 0, 'Monster Reborn', 'hand');
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: reborn, effectId: 'activate' })).toMatch(/no monster in either Graveyard that can be Special Summoned/);
    // Call of the Haunted (Set last turn) has no valid target either.
    const coth = put(tg, 0, 'Call of the Haunted', 'spellTrap', { turnEnteredField: 0 });
    endTurn(tg);
    const seen = walk(tg, { type: 'END_TURN', player: 1 });
    expect(seen.flatMap((s) => s.options)).not.toContain(`${nameOf(tg, coth)}:activate`);
  });

  it('the status also survives banishment, and a revived monster keeps it', () => {
    const tg = makeGame();
    start(tg);
    const azure = synchroAzure(tg);
    const glider = put(tg, 0, 'Kaiser Glider', 'hand');
    // Azure-Eyes is the only monster, so the Tribute is forced (no card prompt); only the zone is asked.
    tg.run({ type: 'NORMAL_SUMMON', player: 0, uid: glider }, A.zone(0, 'monster', 0));
    // Castle of Dragon Souls banishes Azure-Eyes from the GY as a cost ...
    const castle = put(tg, 0, 'Castle of Dragon Souls', 'spellTrap', { faceUp: true, turnEnteredField: 0 });
    tg.run({ type: 'ACTIVATE', player: 0, uid: castle, effectId: 'boost' }, A.cards(azure), A.cards(glider));
    expect(tg.card(azure).zone).toBe('banished');
    expect(tg.card(azure).properlySummoned).toBe(true);
    // ... and its own effect revives it from the banished cards when Castle is sent to the GY.
    const wingbeat = put(tg, 0, 'A Wingbeat of Giant Dragon', 'hand');
    // Azure-Eyes is the only banished Dragon, so the target is forced (no card prompt).
    tg.run({ type: 'ACTIVATE', player: 0, uid: wingbeat, effectId: 'activate' }, A.zone(0, 'spellTrap', 1), A.yes(), A.option('ATK'), A.zone(0, 'monster', 1));
    expect(tg.card(azure).zone).toBe('monster');
  });

  it('Rainbow Overdragon and Rainbow Dragon Overdrive keep the status in the GY / banished (engine rule)', () => {
    const tg = makeGame({ decks: ['sdcb', 'sdcb'] });
    start(tg);
    for (const name of ['Rainbow Overdragon', 'Ultimate Crystal Rainbow Dragon Overdrive']) {
      const uid = put(tg, 0, name, 'monster');
      tg.state.cards[uid].properlySummoned = true; // the state right after a proper Special Summon
      const g = new Game(tg.state);
      g.sendToGraveyard(uid, 'destroyedEffect');
      expect(tg.card(uid).zone).toBe('graveyard');
      expect(tg.card(uid).properlySummoned).toBe(true);
      g.banish(uid);
      expect(tg.card(uid).zone).toBe('banished');
      expect(tg.card(uid).properlySummoned).toBe(true);
      // Returning to the Extra Deck resets it: it must be Special Summoned properly again.
      g.toDeck(uid, 'top');
      expect(tg.card(uid).zone).toBe('extra');
      expect(tg.card(uid).properlySummoned).toBe(false);
    }
  });

  it('a monster whose Special Summon was negated is not properly Summoned', () => {
    // Solemn-style negation is not in these decks; the engine path is exercised directly.
    const tg = makeGame();
    start(tg);
    const azure = put(tg, 0, 'Azure-Eyes Silver Dragon', 'monster');
    tg.state.cards[azure].properlySummoned = true;
    tg.state.summonAttempt = { uid: azure, player: 0, method: 'special', how: 'test', negated: true };
    const g = new Game(tg.state);
    g.sendToGraveyard(azure, 'destroyedEffect');
    // The engine's negation path clears the flag before the card leaves; sending directly does not.
    expect(tg.card(azure).properlySummoned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Damage Step timing
// ---------------------------------------------------------------------------
describe('Damage Step timing: ATK/DEF modifiers stop once damage calculation begins', () => {
  function attackSetup() {
    const tg = makeGame();
    start(tg);
    endTurn(tg); // turn 2: Player 2 (Crystal Beasts) attacks Player 1's LIGHT monster
    const angel = put(tg, 0, 'Shining Angel', 'monster');
    const honest = put(tg, 0, 'Honest', 'hand');
    const castle = put(tg, 0, 'Castle of Dragon Souls', 'spellTrap', { faceUp: true, turnEnteredField: 0 });
    put(tg, 0, 'Luster Dragon', 'graveyard'); // a Dragon to banish for Castle
    const tiger = put(tg, 1, 'Crystal Beast Topaz Tiger', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    return { tg, angel, honest, castle, tiger };
  }

  it('Honest and Castle of Dragon Souls are offered at the start of the Damage Step and before damage calculation, never during it', () => {
    const { tg, honest, castle, tiger } = attackSetup();
    const seen = walk(tg, { type: 'DECLARE_ATTACK', player: 1, uid: tiger });
    const at = (ctx: string) => seen.filter((s) => s.player === 0 && s.context === ctx).flatMap((s) => s.options);
    const honestOpt = `${nameOf(tg, honest)}:boost`;
    const castleOpt = `${nameOf(tg, castle)}:boost`;
    expect(at('start of the Damage Step')).toEqual(expect.arrayContaining([honestOpt, castleOpt]));
    expect(at('before damage calculation')).toEqual(expect.arrayContaining([honestOpt, castleOpt]));
    expect(at('during damage calculation')).not.toContain(honestOpt);
    expect(at('during damage calculation')).not.toContain(castleOpt);
    expect(at('after damage calculation')).not.toContain(honestOpt);
    // Outside the Damage Step (attack declaration) Honest is not available either.
    expect(at(`${nameOf(tg, tiger)} declared an attack`)).not.toContain(honestOpt);
  });

  it('Honest activated before damage calculation makes the LIGHT monster win the battle', () => {
    const { tg, angel, honest, tiger } = attackSetup();
    const honestOpt = { uid: honest, effectId: 'boost' };
    walk(tg, { type: 'DECLARE_ATTACK', player: 1, uid: tiger }, (p) => (p.type === 'fastEffects' && p.player === 0 && p.context === 'before damage calculation' && p.options.some((o) => o.uid === honest) ? { activation: honestOpt } : null));
    expect(tg.card(honest).zone).toBe('graveyard');
    expect(tg.card(angel).zone).toBe('monster'); // 1400 + Tiger's ATK beats the Tiger
    expect(tg.card(tiger).zone).not.toBe('monster');
  });

  it('the timing table itself: ATK/DEF modifiers stop at damage calculation, "during damage calculation" effects only then', () => {
    expect(damageStepTimingProblem('Honest', 'beforeCalc', 'start')).toBeNull();
    expect(damageStepTimingProblem('Honest', 'beforeCalc', 'beforeCalc')).toBeNull();
    expect(damageStepTimingProblem('Honest', 'beforeCalc', 'calc')).toMatch(/damage calculation has already begun/);
    expect(damageStepTimingProblem('Honest', 'beforeCalc', 'afterCalc')).toMatch(/already over/);
    expect(damageStepTimingProblem('Crystal Keeper', 'calc', 'beforeCalc')).toMatch(/only be activated during damage calculation/);
    expect(damageStepTimingProblem('Crystal Keeper', 'calc', 'calc')).toBeNull();
    expect(damageStepTimingProblem('Rainbow Ruins', 'untilCalc', 'calc')).toBeNull();
    expect(damageStepTimingProblem('Rainbow Ruins', 'untilCalc', 'afterCalc')).toMatch(/before or during damage calculation/);
    expect(damageStepTimingProblem("Champion's Vigilance", 'any', 'end')).toBeNull();
    expect(damageStepTimingProblem('Compulsory Evacuation Device', false, 'start')).toMatch(/cannot be activated during the Damage Step/);
    // Every scripted ATK/DEF-modifying Quick Effect / Trap declares a Damage Step window that excludes damage calculation.
    for (const [name, effectId] of [['Honest', 'boost'], ['Castle of Dragon Souls', 'boost'], ['Rainbow Dragon', 'boost']] as const) {
      const eff = getScript(name)!.effects.find((e) => e.id === effectId)!;
      expect(eff.damageStep).toBe('beforeCalc');
    }
    expect(getScript('Crystal Keeper')!.effects.find((e) => e.id === 'double')!.damageStep).toBe('calc');
  });

  it('Crystal Keeper ("during damage calculation") is only offered during damage calculation', () => {
    const tg = makeGame({ decks: ['sdcb', 'sdbe'] });
    start(tg);
    endTurn(tg);
    const keeper = put(tg, 0, 'Crystal Keeper', 'hand');
    put(tg, 0, 'Crystal Beast Emerald Tortoise', 'monster', { position: 'ATK' });
    const luster = put(tg, 1, 'Luster Dragon', 'monster', { turnEnteredField: 1 });
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    const seen = walk(tg, { type: 'DECLARE_ATTACK', player: 1, uid: luster });
    const keeperOpt = `${nameOf(tg, keeper)}:double`;
    const at = (ctx: string) => seen.filter((s) => s.player === 0 && s.context === ctx).flatMap((s) => s.options);
    expect(at('during damage calculation')).toContain(keeperOpt);
    expect(at('start of the Damage Step')).not.toContain(keeperOpt);
    expect(at('before damage calculation')).not.toContain(keeperOpt);
  });
});

// ---------------------------------------------------------------------------
// 3. Response priority
// ---------------------------------------------------------------------------
describe('Normal response priority: the turn player can respond to their own actions', () => {
  it('Castle of Dragon Souls targeting your own Maiden with Eyes of Blue lets you chain Maiden and Summon Blue-Eyes', () => {
    const tg = makeGame();
    start(tg);
    const castle = put(tg, 0, 'Castle of Dragon Souls', 'spellTrap', { faceUp: true, turnEnteredField: 0 });
    const maiden = put(tg, 0, 'Maiden with Eyes of Blue', 'monster');
    put(tg, 0, 'Luster Dragon', 'graveyard');
    const bewd = tg.find(0, 'Blue-Eyes White Dragon', 'deck');
    const seen = walk(tg, { type: 'ACTIVATE', player: 0, uid: castle, effectId: 'boost' }, (p) => {
      if (p.type === 'selectCards' && p.title.startsWith('Target 1 monster you control')) return { cards: [maiden] };
      if (p.type === 'fastEffects' && p.player === 0 && p.options.some((o) => o.uid === maiden)) return { activation: { uid: maiden, effectId: 'targeted' } };
      if (p.type === 'selectCards' && p.cards.includes(bewd)) return { cards: [bewd] };
      if (p.type === 'selectOption' && p.options.some((o) => o.id === 'ATK')) return { option: 'ATK' };
      return null;
    });
    // The turn player was asked whether to chain to their own Castle.
    expect(seen.some((s) => s.player === 0 && s.options.includes(`${nameOf(tg, maiden)}:targeted`))).toBe(true);
    expect(tg.card(bewd).zone).toBe('monster');
    expect(stats(tg, maiden).atk).toBe(700);
    expect(tg.log().some((l) => l.includes('Chain Link 2'))).toBe(true);
  });

  it('after a Normal Summon the turn player is offered their own fast effects first, then the opponent', () => {
    const tg = makeGame();
    start(tg);
    put(tg, 0, 'Castle of Dragon Souls', 'spellTrap', { faceUp: true, turnEnteredField: 0 });
    put(tg, 0, 'Luster Dragon', 'graveyard');
    const kaibaman = put(tg, 0, 'Kaibaman', 'hand');
    const oppTrap = put(tg, 1, 'Crystal Boon', 'spellTrap', { turnEnteredField: 0 });
    void oppTrap;
    const seen = walk(tg, { type: 'NORMAL_SUMMON', player: 0, uid: kaibaman });
    const afterSummon = seen.filter((s) => s.context.includes('was Normal Summoned'));
    expect(afterSummon[0]?.player).toBe(0);
    expect(afterSummon[0]?.options).toContain('Castle of Dragon Souls:boost');
  });
});

// ---------------------------------------------------------------------------
// 4. "Send to the GY" costs
// ---------------------------------------------------------------------------
describe('"Send to the GY" costs only accept cards that really go to the Graveyard', () => {
  function darkstormSetup() {
    const tg = makeGame();
    start(tg);
    const dark = put(tg, 0, 'Darkstorm Dragon', 'monster');
    tg.state.cards[dark].geminiEffectActive = true;
    const master = put(tg, 0, 'Crystal Master', 'spellTrap', { faceUp: true, index: 0, treatedAsSpell: 'pendulum' });
    return { tg, dark, master };
  }

  it('Darkstorm Dragon cannot pay its cost with Crystal Master in a Pendulum Zone (it would go to the Extra Deck)', () => {
    const { tg, dark, master } = darkstormSetup();
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: dark, effectId: 'destroyAll' })).toMatch(/Pendulum Monster/);
    expect(tg.card(master).zone).toBe('spellTrap');
    // Crystal Keeper in the other Pendulum Zone does not help either.
    put(tg, 0, 'Crystal Keeper', 'spellTrap', { faceUp: true, index: 4, treatedAsSpell: 'pendulum' });
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: dark, effectId: 'destroyAll' })).toMatch(/Pendulum Monster/);
  });

  it('with a real Spell available, the Pendulum card is not selectable as the cost but is destroyed by the effect', () => {
    const { tg, dark, master } = darkstormSetup();
    const swords = put(tg, 0, 'Swords of Revealing Light', 'spellTrap', { faceUp: true, index: 1 });
    const kunai = put(tg, 0, 'Kunai with Chain', 'spellTrap', { faceUp: true, index: 2 });
    const r = tg.runPartial({ type: 'ACTIVATE', player: 0, uid: dark, effectId: 'destroyAll' });
    expect(r.prompt?.type).toBe('selectCards');
    if (r.prompt?.type === 'selectCards') {
      expect(r.prompt.cards.sort()).toEqual([swords, kunai].sort());
      expect(r.prompt.cards).not.toContain(master);
    }
    tg.run({ type: 'ACTIVATE', player: 0, uid: dark, effectId: 'destroyAll' }, A.cards(swords));
    expect(tg.card(swords).zone).toBe('graveyard');
    expect(tg.card(kunai).zone).toBe('graveyard');
    expect(tg.card(master).zone).toBe('extra');
    expect(tg.card(master).faceUp).toBe(true);
  });

  it('while Dimension Shifter applies, "send to the GY" costs cannot be paid (discards still can)', () => {
    const { tg, dark } = darkstormSetup();
    put(tg, 0, 'Swords of Revealing Light', 'spellTrap', { faceUp: true, index: 1 });
    tg.state.banishInsteadUntilTurn = tg.state.turn;
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: dark, effectId: 'destroyAll' })).toMatch(/Dimension Shifter/);
    const gift = put(tg, 0, "White Elephant's Gift", 'hand');
    put(tg, 0, 'Luster Dragon', 'monster');
    expect(tg.expectIllegal({ type: 'ACTIVATE', player: 0, uid: gift, effectId: 'activate' })).toMatch(/can be sent to the Graveyard/);
    // Discarding as a cost is still fine (the card is banished instead).
    const bewd = put(tg, 0, 'Blue-Eyes White Dragon', 'hand');
    const trade = put(tg, 0, 'Trade-In', 'hand');
    tg.run({ type: 'ACTIVATE', player: 0, uid: trade, effectId: 'activate' }, A.zone(0, 'spellTrap', 2), A.cards(bewd));
    expect(tg.card(bewd).zone).toBe('banished');
  });

  it('the engine refuses a "send to the GY" cost payment with an unsendable card (safety net)', () => {
    const { tg, master } = darkstormSetup();
    const g = new Game(tg.state);
    expect(g.canBeSentToGraveyard(master)).toBe(false);
    expect(() => g.sendToGraveyard(master, 'cost')).toThrow(/Pendulum Monster/);
    // Tributing or destroying it is fine: it goes to the Extra Deck as the rules say.
    g.sendToGraveyard(master, 'destroyedEffect');
    expect(tg.card(master).zone).toBe('extra');
  });
});
