/**
 * Player actions: summons, sets, position changes, attacks, phase changes.
 * Each action has a `check*` function (used for legality + explanations) and a
 * generator that performs it.
 */
import { isExtraDeckMonster } from '../cards';
import { Game, ActionCancelled } from './game';
import { getScript, type Process } from './scripts';
import { activateFromOpenState, afterAction, fastEffectWindow, processTriggers, runScheduled, summonWindow } from './flow';
import { attackRestriction, damageStep, extraAttacksFor, tributesRequired } from './battle';
import type { Action, PlayerId } from './types';
import { PHASE_LABEL } from './types';

const MAX_HAND = 6;

// ---------------------------------------------------------------------------
// Generic checks
// ---------------------------------------------------------------------------

function checkOpenMainPhase(g: Game, player: PlayerId): string | null {
  if (g.state.winner !== null) return 'The Duel is over.';
  if (!g.state.started) return 'The Duel has not started yet.';
  if (g.state.turnPlayer !== player) return `It is ${g.playerName(g.state.turnPlayer)}'s turn. You can only do this during your own turn.`;
  if (g.state.phase !== 'MAIN1' && g.state.phase !== 'MAIN2') {
    return `You can only do this during your Main Phase 1 or Main Phase 2. It is currently the ${PHASE_LABEL[g.state.phase]}.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Normal Summon / Set
// ---------------------------------------------------------------------------

export function checkNormalSummon(g: Game, player: PlayerId, uid: string, asSet: boolean): string | null {
  const base = checkOpenMainPhase(g, player);
  if (base) return base;
  const c = g.card(uid);
  const d = g.def(uid);
  const verb = asSet ? 'Set' : 'Normal Summon';
  if (c.zone !== 'hand' || c.owner !== player) return `${d.name} is not in your hand.`;
  if (d.cardType !== 'Monster') return `${d.name} is not a monster, so it cannot be ${asSet ? 'Set as a monster' : 'Normal Summoned'}.`;
  if (isExtraDeckMonster(d)) return `${d.name} is an Extra Deck monster and cannot be Normal Summoned.`;
  const script = getScript(d.name);
  if (script?.cannotNormalSummon) return `${d.name} cannot be Normal Summoned or Set. ${script.cannotNormalSummon}`;
  const pl = g.player(player);
  if (pl.normalSummonsUsed >= pl.normalSummonsAllowed) {
    const extra = extraNormalSummonSource(g, player, uid);
    if (!extra || asSet) return `You have already Normal Summoned or Set a monster this turn. You can only Normal Summon or Set once per turn.`;
  }
  const level = d.level ?? 0;
  const tributes = tributesRequired(level);
  const forced = forcedTribute(g, player);
  const monsters = [...g.fieldMonsters(player), ...(forced ? [g.card(forced)] : [])];
  if (tributes > 0) {
    const available = monsters.reduce((n, m) => n + tributeValue(g, m.uid, uid), 0);
    if (available < tributes) {
      return `${d.name} is Level ${level}, so it needs ${tributes} Tribute${tributes > 1 ? 's' : ''} to be ${verb}ed (Level 5-6 monsters need 1 Tribute, Level 7 or higher need 2). You only control ${monsters.length} monster${monsters.length === 1 ? '' : 's'} to Tribute.`;
    }
    if (g.fieldMonsters(player).length === 5 && !forced && tributes === 0) return 'All five of your Main Monster Zones are full.';
  } else if (g.freeMonsterZones(player).length === 0) {
    return 'All five of your Main Monster Zones are full. You need an empty Monster Zone.';
  }
  return null;
}

/** A face-up card granting an additional Normal Summon of `uid` this turn (e.g. Rainbow Bridge of the Heart). */
export function extraNormalSummonSource(g: Game, player: PlayerId, uid: string): string | null {
  const pl = g.player(player);
  if (pl.turnFlags['extraNormalSummonUsed']) return null;
  for (const src of g.activeFieldCards()) {
    if (src.controller !== player) continue;
    const sc = getScript(g.name(src.uid));
    if (sc?.extraNormalSummon && sc.extraNormalSummon(g, src, g.card(uid)) === null) return src.uid;
  }
  return null;
}

/** How many Tributes a monster counts as when Tributing for `forUid` (Kaiser Sea Horse style effects). */
export function tributeValue(g: Game, monsterUid: string, forUid: string): number {
  const s = getScript(g.name(monsterUid));
  const m = g.card(monsterUid);
  if (s?.tributeValue && !m.flags['effectsNegated']) return Math.max(1, s.tributeValue(g, m, forUid));
  return 1;
}

/** Monster the player is forced to Tribute this turn (Soul Exchange), if it is still on the field. */
export function forcedTribute(g: Game, player: PlayerId): string | null {
  const uid = g.player(player).turnFlags['mustTribute'] as string | undefined;
  if (!uid) return null;
  const c = g.state.cards[uid];
  return c && g.isMonsterOnField(c) ? uid : null;
}

export function* normalSummonOrSet(g: Game, player: PlayerId, uid: string, asSet: boolean): Process<void> {
  const reason = checkNormalSummon(g, player, uid, asSet);
  if (reason) throw new Error(reason);
  const d = g.def(uid);
  const level = d.level ?? 0;
  const tributes = tributesRequired(level);

  if (tributes > 0) {
    const forced = forcedTribute(g, player);
    const monsters = [...g.fieldMonsters(player).map((m) => m.uid), ...(forced ? [forced] : [])];
    let chosen: string[] = [];
    if (forced) {
      g.log(`Because of Soul Exchange, ${g.name(forced)} must be used as a Tribute.`, 'rule');
      chosen.push(forced);
    }
    const remaining = tributes - chosen.reduce((n, m) => n + tributeValue(g, m, uid), 0);
    if (remaining > 0) {
      const pool = monsters.filter((m) => !chosen.includes(m));
      // A monster may count as 2 Tributes (Kaiser Sea Horse), so fewer cards may be enough.
      const anyDouble = pool.some((m) => tributeValue(g, m, uid) >= 2);
      const picked = yield* g.selectCards(
        player,
        `Choose ${remaining} monster${remaining > 1 ? 's' : ''} to Tribute for ${d.name}`,
        pool,
        anyDouble ? 1 : remaining,
        remaining,
        `${d.name} is Level ${level}. Tribute Summoning a Level ${level >= 7 ? '7 or higher' : '5 or 6'} monster requires ${tributes} Tribute${tributes > 1 ? 's' : ''}.`,
        true,
      );
      const value = picked.reduce((n, m) => n + tributeValue(g, m, uid), 0);
      if (value < remaining) throw new Error(`You must Tribute monsters worth ${remaining} more Tribute${remaining > 1 ? 's' : ''}.`);
      chosen = chosen.concat(picked);
    }
    for (const t of chosen) {
      const v = tributeValue(g, t, uid);
      g.log(`${g.name(t)} is Tributed${v > 1 && chosen.length < tributes ? ` (it counts as ${v} Tributes)` : ''}.`, 'action');
      g.sendToGraveyard(t, 'tribute');
    }
  }

  const zone = yield* g.chooseMonsterZone(player, `Choose a Monster Zone for ${d.name}`);
  g.placeMonster(uid, player, zone, asSet ? 'DEF' : 'ATK', !asSet);
  const c = g.card(uid);
  const pl0 = g.player(player);
  if (pl0.normalSummonsUsed >= pl0.normalSummonsAllowed) {
    const src = extraNormalSummonSource(g, player, uid)!;
    pl0.turnFlags['extraNormalSummonUsed'] = true;
    g.log(`${g.name(src)} allows this additional Normal Summon.`, 'rule');
  } else {
    pl0.normalSummonsUsed++;
  }
  if (asSet) {
    c.setThisTurn = true;
    g.log(`${g.playerName(player)} Sets a monster${tributes > 0 ? ` (Tribute Set)` : ''} in face-down Defense Position.`, 'action');
    g.emit({ type: 'set', uid, player });
    yield* afterAction(g, `${g.playerName(player)} Set a monster`);
  } else {
    c.summonedThisTurn = true;
    const st = g.stats(uid);
    g.log(`${g.playerName(player)} ${tributes > 0 ? 'Tribute Summons' : 'Normal Summons'} ${d.name} (ATK ${st.atk} / DEF ${st.def}) in Attack Position.`, 'action');
    g.fx({ type: 'summon', uid, method: 'normal' });
    const ok = yield* summonWindow(g, uid, player, 'normal', tributes > 0 ? 'tribute' : 'normal');
    if (!ok) {
      yield* afterAction(g, `The Summon of ${d.name} was negated`);
      return;
    }
    g.emit({ type: 'summon', uid, player, method: 'normal', how: tributes > 0 ? 'tribute' : 'normal' });
    yield* afterAction(g, `${d.name} was Normal Summoned`);
  }
}

// ---------------------------------------------------------------------------
// Gemini Summon (Normal Summoning a face-up Gemini monster again to give it its effect)
// ---------------------------------------------------------------------------

export function checkGeminiSummon(g: Game, player: PlayerId, uid: string): string | null {
  const base = checkOpenMainPhase(g, player);
  if (base) return base;
  const c = g.card(uid);
  const d = g.def(uid);
  if (!d.monsterTypes?.includes('Gemini')) return `${d.name} is not a Gemini monster.`;
  if (!g.isMonsterOnField(c) || c.controller !== player) return `${d.name} is not a monster you control on the field.`;
  if (!c.faceUp) return `${d.name} must be face-up to be Gemini Summoned.`;
  if (c.geminiEffectActive) return `${d.name} already has its effect (it was Gemini Summoned).`;
  const pl = g.player(player);
  if (pl.normalSummonsUsed >= pl.normalSummonsAllowed) {
    return `Gemini Summoning uses your Normal Summon for the turn, and you have already Normal Summoned or Set this turn.`;
  }
  return null;
}

export function* geminiSummon(g: Game, player: PlayerId, uid: string): Process<void> {
  const reason = checkGeminiSummon(g, player, uid);
  if (reason) throw new Error(reason);
  const c = g.card(uid);
  g.player(player).normalSummonsUsed++;
  c.geminiEffectActive = true;
  c.summonedThisTurn = true;
  g.log(`${g.playerName(player)} Normal Summons the face-up ${g.name(uid)} again (Gemini Summon). It is now an Effect Monster with its effect.`, 'action');
  g.fx({ type: 'summon', uid, method: 'normal' });
  const ok = yield* summonWindow(g, uid, player, 'normal', 'gemini');
  if (!ok) {
    yield* afterAction(g, `The Gemini Summon of ${g.name(uid)} was negated`);
    return;
  }
  g.emit({ type: 'summon', uid, player, method: 'normal', how: 'gemini' });
  yield* afterAction(g, `${g.name(uid)} was Gemini Summoned`);
}

// ---------------------------------------------------------------------------
// Pendulum Zones and Pendulum Summon
// ---------------------------------------------------------------------------

export function checkPlacePendulum(g: Game, player: PlayerId, uid: string): string | null {
  const base = checkOpenMainPhase(g, player);
  if (base) return base;
  const c = g.card(uid);
  const d = g.def(uid);
  if (!d.monsterTypes?.includes('Pendulum')) return `${d.name} is not a Pendulum Monster.`;
  if (c.zone !== 'hand' || c.owner !== player) return `${d.name} must be in your hand to be placed in a Pendulum Zone.`;
  const pl = g.player(player);
  const free = [0, 4].filter((i) => !pl.spellTrapZones[i]);
  if (free.length === 0) return 'Both of your Pendulum Zones (the leftmost and rightmost Spell & Trap Zones) are occupied.';
  return null;
}

export function* placePendulum(g: Game, player: PlayerId, uid: string): Process<void> {
  const reason = checkPlacePendulum(g, player, uid);
  if (reason) throw new Error(reason);
  const pl = g.player(player);
  const free = [0, 4].filter((i) => !pl.spellTrapZones[i]);
  let index = free[0];
  if (free.length > 1) {
    const z = yield* g.selectZone(
      player,
      `Choose a Pendulum Zone for ${g.name(uid)}`,
      free.map((i) => ({ player, zone: 'spellTrap' as const, index: i })),
      'The leftmost and rightmost Spell & Trap Zones are your Pendulum Zones.',
      true,
    );
    index = z.index;
  }
  g.placeSpellTrap(uid, player, index, true);
  const c = g.card(uid);
  c.treatedAsSpell = 'pendulum';
  g.log(`${g.playerName(player)} places ${g.name(uid)} (Scale ${g.def(uid).pendulumScale}) in a Pendulum Zone. It is treated as a Spell Card there.`, 'action');
  g.fx({ type: 'activate', uid, player, what: 'spell' });
  g.emit({ type: 'pendulumPlaced', uid, player });
  g.emit({ type: 'activated', uid, effectId: 'pendulum', player });
  yield* afterAction(g, `${g.name(uid)} was placed in a Pendulum Zone`);
}

export function pendulumScales(g: Game, player: PlayerId): { low: number; high: number } | null {
  const pend = g.pendulumCards(player);
  if (pend.length < 2) return null;
  const scales = pend.map((c) => g.def(c.uid).pendulumScale ?? 0);
  return { low: Math.min(...scales), high: Math.max(...scales) };
}

export function pendulumSummonCandidates(g: Game, player: PlayerId): string[] {
  const sc = pendulumScales(g, player);
  if (!sc) return [];
  const pl = g.player(player);
  const ok = (uid: string) => {
    const d = g.def(uid);
    if (d.cardType !== 'Monster') return false;
    const lvl = d.level ?? 0;
    if (!(lvl > sc.low && lvl < sc.high)) return false;
    if (getScript(d.name)?.cannotNormalSummon && d.text.includes('Must be Special Summoned')) return false;
    return true;
  };
  const fromHand = pl.hand.filter(ok);
  const fromExtra = g.usableExtraMonsterZones(player).length > 0 ? pl.extra.filter((u) => g.card(u).faceUp && ok(u)) : [];
  return [...fromHand, ...fromExtra];
}

export function checkPendulumSummon(g: Game, player: PlayerId): string | null {
  const base = checkOpenMainPhase(g, player);
  if (base) return base;
  const sc = pendulumScales(g, player);
  if (!sc) return 'You need Pendulum Monsters in both of your Pendulum Zones to Pendulum Summon.';
  if (sc.low === sc.high) return `Both of your Pendulum Scales are ${sc.low}; you can only Pendulum Summon monsters with Levels strictly between the two Scales.`;
  if (g.player(player).pendulumSummonUsed) return 'You can only Pendulum Summon once per turn.';
  const cands = pendulumSummonCandidates(g, player);
  if (cands.length === 0) return `You have no monster in your hand (or face-up in your Extra Deck) with a Level between ${sc.low} and ${sc.high} (exclusive).`;
  if (g.freeMonsterZones(player).length === 0 && g.usableExtraMonsterZones(player).length === 0) return 'You have no free Monster Zone.';
  return null;
}

export function* pendulumSummon(g: Game, player: PlayerId): Process<void> {
  const reason = checkPendulumSummon(g, player);
  if (reason) throw new Error(reason);
  const sc = pendulumScales(g, player)!;
  const cands = pendulumSummonCandidates(g, player);
  const maxN = g.freeMonsterZones(player).length + (g.usableExtraMonsterZones(player).length > 0 ? 1 : 0);
  const chosen = yield* g.selectCards(
    player,
    `Pendulum Summon: choose monsters with Levels between ${sc.low} and ${sc.high}`,
    cands,
    1,
    Math.min(maxN, cands.length),
    'Monsters from your hand go to your Main Monster Zones; face-up Pendulum Monsters from the Extra Deck must go to an Extra Monster Zone.',
    true,
  );
  const fromExtra = chosen.filter((u) => g.card(u).zone === 'extra');
  if (fromExtra.length > 1) throw new Error('Only one monster can be Pendulum Summoned from the Extra Deck (it needs the Extra Monster Zone).');
  if (chosen.length - fromExtra.length > g.freeMonsterZones(player).length) throw new Error('Not enough free Main Monster Zones.');
  g.player(player).pendulumSummonUsed = true;
  g.log(`${g.playerName(player)} Pendulum Summons ${chosen.map((u) => g.name(u)).join(', ')} (Scales ${sc.low} and ${sc.high}).`, 'action');
  const summoned: string[] = [];
  for (const uid of chosen) {
    const pos = yield* g.selectOption(player, `${g.name(uid)}: which position?`, [
      { id: 'ATK', label: 'Attack Position' },
      { id: 'DEF', label: 'Defense Position' },
    ]);
    if (g.card(uid).zone === 'extra') {
      const zones = g.usableExtraMonsterZones(player);
      let idx = zones[0];
      if (zones.length > 1) {
        const z = yield* g.selectZone(player, `Choose an Extra Monster Zone for ${g.name(uid)}`, zones.map((i) => ({ player, zone: 'extraMonster' as const, index: i })));
        idx = z.index;
      }
      g.placeInExtraMonsterZone(uid, player, idx, pos as 'ATK' | 'DEF');
      g.card(uid).properlySummoned = true;
    } else {
      const zone = yield* g.chooseMonsterZone(player, `Choose a Monster Zone for ${g.name(uid)}`);
      g.placeMonster(uid, player, zone, pos as 'ATK' | 'DEF', true);
      g.card(uid).summonedThisTurn = true;
      g.card(uid).properlySummoned = true;
    }
    g.fx({ type: 'summon', uid, method: 'special' });
    summoned.push(uid);
  }
  // A Pendulum Summon of several monsters is one Summon; the negation window covers all of them.
  const ok = yield* summonWindow(g, summoned[0], player, 'special', 'pendulum');
  if (!ok) {
    for (const uid of summoned.slice(1)) {
      const c = g.state.cards[uid];
      if (c && g.isMonsterOnField(c)) {
        g.emit({ type: 'destroyed', uid, reason: 'effect' });
        g.sendToGraveyard(uid, 'destroyedEffect');
      }
    }
    yield* afterAction(g, 'The Pendulum Summon was negated');
    return;
  }
  for (const uid of summoned) g.emit({ type: 'summon', uid, player, method: 'special', how: 'pendulum' });
  yield* afterAction(g, 'Pendulum Summon');
}

// ---------------------------------------------------------------------------
// Flip Summon / battle position
// ---------------------------------------------------------------------------

export function checkFlipSummon(g: Game, player: PlayerId, uid: string): string | null {
  const base = checkOpenMainPhase(g, player);
  if (base) return base;
  const c = g.card(uid);
  const d = g.def(uid);
  if (!g.isMonsterOnField(c) || c.controller !== player) return `${d.name} is not a monster you control on the field.`;
  if (c.faceUp) return `${d.name} is already face-up. Flip Summoning is for face-down monsters.`;
  if (c.turnEnteredField === g.state.turn) return `You cannot Flip Summon a monster during the same turn it was Set. Wait until your next turn.`;
  if (c.positionChangedThisTurn) return `${d.name} already changed its battle position this turn.`;
  return null;
}

export function* flipSummon(g: Game, player: PlayerId, uid: string): Process<void> {
  const reason = checkFlipSummon(g, player, uid);
  if (reason) throw new Error(reason);
  const c = g.card(uid);
  c.faceUp = true;
  c.position = 'ATK';
  c.summonedThisTurn = true;
  c.positionChangedThisTurn = true;
  const st = g.stats(uid);
  g.log(`${g.playerName(player)} Flip Summons ${g.name(uid)} (ATK ${st.atk} / DEF ${st.def}) into Attack Position.`, 'action');
  g.fx({ type: 'flip', uid });
  const ok = yield* summonWindow(g, uid, player, 'flip', 'flipSummon');
  if (!ok) {
    yield* afterAction(g, `The Flip Summon of ${g.name(uid)} was negated`);
    return;
  }
  g.emit({ type: 'flipped', uid, how: 'effect' });
  g.emit({ type: 'summon', uid, player, method: 'flip', how: 'flipSummon' });
  yield* afterAction(g, `${g.name(uid)} was Flip Summoned`);
}

export function checkChangePosition(g: Game, player: PlayerId, uid: string): string | null {
  const base = checkOpenMainPhase(g, player);
  if (base) return base;
  const c = g.card(uid);
  const d = g.def(uid);
  if (!g.isMonsterOnField(c) || c.controller !== player) return `${d.name} is not a monster you control on the field.`;
  if (!c.faceUp) return `${d.name} is face-down. To turn it face-up, Flip Summon it instead.`;
  if (c.turnEnteredField === g.state.turn) {
    return `You cannot change the battle position of a monster during the same turn it was Summoned or Set. ${d.name} arrived this turn.`;
  }
  if (c.positionChangedThisTurn) return `${d.name} already changed its battle position this turn. A monster can only change position once per turn.`;
  if (c.attacksDeclaredThisTurn > 0) return `${d.name} already attacked this turn, so it cannot change its battle position.`;
  return null;
}

export function* changePosition(g: Game, player: PlayerId, uid: string): Process<void> {
  const reason = checkChangePosition(g, player, uid);
  if (reason) throw new Error(reason);
  const c = g.card(uid);
  c.position = c.position === 'ATK' ? 'DEF' : 'ATK';
  c.positionChangedThisTurn = true;
  g.log(`${g.name(uid)} is changed to ${c.position === 'ATK' ? 'Attack' : 'Defense'} Position.`, 'action');
  g.emit({ type: 'positionChanged', uid });
  yield* afterAction(g, `${g.name(uid)} changed battle position`);
}

// ---------------------------------------------------------------------------
// Set Spell / Trap
// ---------------------------------------------------------------------------

export function checkSetSpellTrap(g: Game, player: PlayerId, uid: string): string | null {
  const base = checkOpenMainPhase(g, player);
  if (base) return base;
  const c = g.card(uid);
  const d = g.def(uid);
  if (c.zone !== 'hand' || c.owner !== player) return `${d.name} is not in your hand.`;
  if (d.cardType === 'Monster') return `${d.name} is a monster. Monsters are Set in the Monster Zone, not the Spell & Trap Zone.`;
  if (d.property === 'Field') return null;
  if (g.freeSpellTrapZones(player).length === 0) return 'All five of your Spell & Trap Zones are full.';
  return null;
}

export function* setSpellTrap(g: Game, player: PlayerId, uid: string): Process<void> {
  const reason = checkSetSpellTrap(g, player, uid);
  if (reason) throw new Error(reason);
  const d = g.def(uid);
  if (d.property === 'Field') {
    const old = g.fieldSpell(player);
    if (old) {
      g.log(`${g.name(old.uid)} is sent to the Graveyard to make room for the new Field Spell.`, 'rule');
      g.sendToGraveyard(old.uid, 'rule');
    }
    g.placeFieldSpell(uid, player, false);
  } else {
    const zone = yield* g.chooseSpellTrapZone(player, `Choose a Spell & Trap Zone to Set ${d.name}`);
    g.placeSpellTrap(uid, player, zone, false);
  }
  const c = g.card(uid);
  c.setThisTurn = true;
  g.log(`${g.playerName(player)} Sets a ${d.cardType} Card${d.property === 'Field' ? ' in the Field Zone' : ''}.`, 'action');
  g.emit({ type: 'set', uid, player });
}

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

export function checkDeclareAttack(g: Game, player: PlayerId, uid: string): string | null {
  if (g.state.winner !== null) return 'The Duel is over.';
  if (g.state.turnPlayer !== player) return `It is not your turn.`;
  if (g.state.phase !== 'BATTLE') return `Attacks can only be declared during the Battle Phase. It is currently the ${PHASE_LABEL[g.state.phase]}.`;
  const b = g.state.battle;
  if (!b || (b.step !== 'BATTLE' && b.step !== 'START')) return 'You cannot declare an attack right now.';
  if (b.attacker) return 'A battle is already in progress.';
  const c = g.card(uid);
  const d = g.def(uid);
  if (!g.isMonsterOnField(c) || c.controller !== player) return `${d.name} is not a monster you control.`;
  if (!c.faceUp || c.position !== 'ATK') return `${d.name} must be in face-up Attack Position to attack. Monsters in Defense Position cannot attack.`;
  const allowed = 1 + extraAttacksFor(g, uid);
  if (c.attacksDeclaredThisTurn >= allowed) return `${d.name} has already attacked this turn. Each monster can normally attack only once per turn.`;
  const r = attackRestriction(g, uid, null);
  if (r) {
    // A restriction on direct attacks only is fine if there are targets; check general restriction
    const opp = g.fieldMonsters(g.opponent(player));
    if (opp.length === 0) return r;
    const anyTarget = opp.some((t) => !attackRestriction(g, uid, t.uid));
    if (!anyTarget) return r;
  }
  return null;
}

export function* declareAttack(g: Game, player: PlayerId, uid: string): Process<void> {
  const reason = checkDeclareAttack(g, player, uid);
  if (reason) throw new Error(reason);
  const opponent = g.opponent(player);
  const oppMonsters = g.fieldMonsters(opponent).filter((t) => !attackRestriction(g, uid, t.uid));
  let target: string | null = null;
  let directByEffect = false;
  const directAllowed = !!getScript(g.name(uid))?.canAttackDirectly?.(g, g.card(uid)) && !g.card(uid).flags['effectsNegated'];
  if (g.fieldMonsters(opponent).length > 0) {
    if (oppMonsters.length === 0 && !directAllowed) throw new Error('No legal attack target.');
    if (directAllowed) {
      const choice = yield* g.selectOption(
        player,
        `${g.name(uid)}: attack a monster, or attack directly?`,
        [
          ...oppMonsters.map((m) => ({ id: m.uid, label: `Attack ${m.faceUp ? g.name(m.uid) : 'the face-down monster'}` })),
          { id: 'direct', label: 'Attack directly (card effect; battle damage is halved)' },
        ],
        `${g.name(uid)}'s effect lets it attack directly even though your opponent controls monsters.`,
        true,
      );
      if (choice === 'direct') directByEffect = true;
      else target = choice;
    } else {
      const chosen = yield* g.selectCards(
        player,
        `Choose the monster ${g.name(uid)} attacks`,
        oppMonsters.map((m) => m.uid),
        1,
        1,
        'Your opponent controls monsters, so you must attack one of them (you cannot attack directly).',
        true,
      );
      target = chosen[0];
    }
  } else if (attackRestriction(g, uid, null)) {
    throw new Error(attackRestriction(g, uid, null)!);
  }

  const b = g.state.battle!;
  b.step = 'BATTLE';
  b.attacker = uid;
  b.target = target;
  b.targetCountAtDeclaration = g.fieldMonsters(opponent).length;
  b.damageStepStage = null;
  b.attackNegated = false;
  b.directAttackByEffect = directByEffect;
  b.damageModifier = {};
  const c = g.card(uid);
  c.attacksDeclaredThisTurn++;
  if (target) {
    const t = g.card(target);
    g.log(`${g.name(uid)} declares an attack on ${t.faceUp ? g.name(target) : 'a face-down monster'}.`, 'battle');
  } else {
    g.log(`${g.name(uid)} declares a direct attack!`, 'battle');
  }
  g.fx({ type: 'attack', attacker: uid, target, defender: opponent });
  g.emit({ type: 'attackDeclared', attacker: uid, target });

  // Response window for the attack declaration (turn player has priority, then the opponent).
  yield* fastEffectWindow(g, { description: `${g.name(uid)} declared an attack`, kind: 'attack' }, [player, opponent]);

  const bb = g.state.battle;
  if (!bb || !bb.attacker) {
    g.log('The attacking monster left the field, so the attack ends.', 'rule');
    endBattle(g);
    return;
  }
  const att = g.card(bb.attacker);
  if (att.position !== 'ATK' || !att.faceUp) {
    g.log(`${g.name(att.uid)} is no longer in Attack Position, so its attack is cancelled.`, 'rule');
    endBattle(g);
    return;
  }
  if (bb.attackNegated) {
    g.log('The attack was negated.', 'rule');
    endBattle(g);
    return;
  }

  // Replay: if the number of monsters the opponent controls changed, the attacker may choose again.
  const nowCount = g.fieldMonsters(opponent).length;
  if (nowCount !== bb.targetCountAtDeclaration || (bb.target === null && nowCount > 0 && !bb.directAttackByEffect) || (bb.target !== null && !g.isMonsterOnField(g.card(bb.target)))) {
    g.log('A replay occurs: the number of monsters on the opposing field changed before the Damage Step. The attacker chooses again.', 'rule');
    const targets = g.fieldMonsters(opponent).filter((t) => !attackRestriction(g, att.uid, t.uid));
    const options = [
      ...targets.map((t) => ({ id: t.uid, label: `Attack ${t.faceUp ? g.name(t.uid) : 'the face-down monster'}` })),
      ...(nowCount === 0 ? [{ id: 'direct', label: 'Attack directly' }] : []),
      { id: 'cancel', label: 'Stop attacking (the attack still counts as used)' },
    ];
    const choice = yield* g.selectOption(player, 'Replay: choose a new target', options, 'When a replay occurs you may attack a different monster, or choose not to attack. Either way the monster cannot attack again this turn.');
    if (choice === 'cancel') {
      g.log(`${g.name(att.uid)} does not continue its attack.`, 'battle');
      endBattle(g);
      return;
    }
    bb.target = choice === 'direct' ? null : choice;
    bb.targetCountAtDeclaration = nowCount;
    g.log(bb.target ? `${g.name(att.uid)} now attacks ${g.card(bb.target).faceUp ? g.name(bb.target) : 'the face-down monster'}.` : `${g.name(att.uid)} now attacks directly.`, 'battle');
    g.emit({ type: 'attackDeclared', attacker: att.uid, target: bb.target });
    yield* fastEffectWindow(g, { description: `${g.name(att.uid)} re-declared an attack`, kind: 'attack' }, [player, opponent]);
    if (!g.state.battle?.attacker || g.card(att.uid).position !== 'ATK' || g.state.battle.attackNegated) {
      g.log('The attack does not proceed.', 'rule');
      endBattle(g);
      return;
    }
  }

  yield* damageStep(g);
  endBattle(g);
}

function endBattle(g: Game): void {
  const b = g.state.battle;
  if (!b) return;
  b.step = 'BATTLE';
  b.attacker = null;
  b.target = null;
  b.damageStepStage = null;
  b.attackNegated = false;
  b.directAttackByEffect = false;
  b.damageModifier = {};
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export function checkToBattlePhase(g: Game, player: PlayerId): string | null {
  if (g.state.winner !== null) return 'The Duel is over.';
  if (g.state.turnPlayer !== player) return 'It is not your turn.';
  if (g.state.phase !== 'MAIN1') return `You can only enter the Battle Phase from Main Phase 1 (it is currently the ${PHASE_LABEL[g.state.phase]}). After the Battle Phase comes Main Phase 2, then the End Phase.`;
  if (g.state.turn === 1) return 'The player who goes first cannot conduct a Battle Phase during the first turn of the Duel.';
  if (g.player(player).turnFlags['skipBattlePhase']) return `You cannot conduct your Battle Phase this turn (${g.player(player).turnFlags['skipBattlePhase']}).`;
  return null;
}

export function* toBattlePhase(g: Game, player: PlayerId): Process<void> {
  const reason = checkToBattlePhase(g, player);
  if (reason) throw new Error(reason);
  yield* fastEffectWindow(g, { description: 'end of Main Phase 1', kind: 'phase' }, [g.opponent(player)]);
  g.state.phase = 'BATTLE';
  g.state.battle = { step: 'START', attacker: null, target: null, targetCountAtDeclaration: 0, damageStepStage: null, attackNegated: false, directAttackByEffect: false, damageModifier: {} };
  g.log(`${g.playerName(player)} enters the Battle Phase.`, 'phase');
  g.emit({ type: 'phaseStart', phase: 'BATTLE', player });
  yield* fastEffectWindow(g, { description: 'Start Step of the Battle Phase', kind: 'phase' });
  if (g.state.battle) g.state.battle.step = 'BATTLE';
}

export function checkToMain2(g: Game, player: PlayerId): string | null {
  if (g.state.winner !== null) return 'The Duel is over.';
  if (g.state.turnPlayer !== player) return 'It is not your turn.';
  if (g.state.phase !== 'BATTLE') return 'Main Phase 2 comes after the Battle Phase.';
  if (g.state.battle?.attacker) return 'A battle is in progress.';
  return null;
}

export function* toMain2(g: Game, player: PlayerId): Process<void> {
  const reason = checkToMain2(g, player);
  if (reason) throw new Error(reason);
  if (g.state.battle) g.state.battle.step = 'END';
  yield* fastEffectWindow(g, { description: 'End Step of the Battle Phase', kind: 'phase' });
  g.state.battle = null;
  clearBattlePhaseFlags(g);
  g.state.phase = 'MAIN2';
  g.log(`${g.playerName(player)} enters Main Phase 2.`, 'phase');
  g.emit({ type: 'phaseStart', phase: 'MAIN2', player });
  yield* fastEffectWindow(g, { description: 'start of Main Phase 2', kind: 'phase' }, [g.opponent(player)]);
}

export function checkEndTurn(g: Game, player: PlayerId): string | null {
  if (g.state.winner !== null) return 'The Duel is over.';
  if (!g.state.started) return 'The Duel has not started yet.';
  if (g.state.turnPlayer !== player) return 'It is not your turn.';
  if (g.state.battle?.attacker) return 'A battle is in progress.';
  if (g.state.phase === 'DRAW' || g.state.phase === 'STANDBY') return 'The turn cannot end before Main Phase 1.';
  return null;
}

export function* endTurn(g: Game, player: PlayerId): Process<void> {
  const reason = checkEndTurn(g, player);
  if (reason) throw new Error(reason);
  if (g.state.phase === 'BATTLE') {
    if (g.state.battle) g.state.battle.step = 'END';
    yield* fastEffectWindow(g, { description: 'End Step of the Battle Phase', kind: 'phase' });
    g.state.battle = null;
    clearBattlePhaseFlags(g);
  } else {
    yield* fastEffectWindow(g, { description: `end of ${PHASE_LABEL[g.state.phase]}`, kind: 'phase' }, [g.opponent(player)]);
  }
  g.state.phase = 'END';
  g.log(`${g.playerName(player)} enters the End Phase.`, 'phase');
  g.emit({ type: 'phaseStart', phase: 'END', player });
  yield* fastEffectWindow(g, { description: 'End Phase', kind: 'endPhase' });
  yield* runScheduled(g, 'END');
  yield* fastEffectWindow(g, { description: 'End Phase (after End Phase effects)', kind: 'endPhase' });

  // Hand size limit.
  const hand = g.player(player).hand;
  if (hand.length > MAX_HAND) {
    const n = hand.length - MAX_HAND;
    g.log(`${g.playerName(player)} has ${hand.length} cards in hand. The hand size limit is ${MAX_HAND}, so ${n} card${n > 1 ? 's' : ''} must be discarded.`, 'rule');
    const chosen = yield* g.selectCards(player, `Discard ${n} card${n > 1 ? 's' : ''} (hand size limit is ${MAX_HAND})`, hand.slice(), n, n, 'During the End Phase, if you have more than 6 cards in your hand, you must discard down to 6.');
    for (const u of chosen) {
      g.log(`${g.playerName(player)} discards ${g.name(u)}.`, 'action');
      g.sendToGraveyard(u, 'discard');
    }
    yield* processTriggers(g);
  }
  g.expireStatMods('endOfTurn');
  yield* endOfTurnCleanup(g);
  yield* startTurn(g, g.opponent(player));
}

/** Effects that last "during that Battle Phase" (e.g. Advanced Dark's negation). */
function clearBattlePhaseFlags(g: Game): void {
  for (const c of Object.values(g.state.cards)) {
    if (c.flags['effectsNegatedBattlePhase']) {
      delete c.flags['effectsNegatedBattlePhase'];
      delete c.flags['effectsNegated'];
      delete c.flags['negatedBy'];
    }
  }
}

function* endOfTurnCleanup(g: Game): Process<void> {
  for (const c of Object.values(g.state.cards)) {
    // Effects that last "until the end of this turn"
    for (const key of Object.keys(c.flags)) {
      if (key.endsWith('ThisTurn')) delete c.flags[key];
      if (key === 'cannotAttackReason') delete c.flags[key];
    }
  }
  g.log(`Turn ${g.state.turn} ends.`, 'phase');
}

export function* startTurn(g: Game, player: PlayerId): Process<void> {
  g.state.turn++;
  g.state.turnPlayer = player;
  g.state.battle = null;
  const pl = g.player(player);
  pl.normalSummonsUsed = 0;
  pl.normalSummonsAllowed = 1;
  for (const p of [0, 1] as PlayerId[]) {
    g.player(p).effectUses = {};
    g.player(p).turnFlags = {};
    g.player(p).pendulumSummonUsed = false;
  }
  if (g.state.banishInsteadUntilTurn !== null && g.state.turn > g.state.banishInsteadUntilTurn) g.state.banishInsteadUntilTurn = null;
  for (const c of Object.values(g.state.cards)) {
    c.summonedThisTurn = false;
    c.setThisTurn = false;
    c.positionChangedThisTurn = false;
    c.attacksDeclaredThisTurn = 0;
  }
  g.log(`── Turn ${g.state.turn}: ${g.playerName(player)} ──`, 'phase');

  g.state.phase = 'DRAW';
  g.emit({ type: 'phaseStart', phase: 'DRAW', player });
  if (g.state.turn === 1) {
    g.log(`Draw Phase: the player who goes first does not draw a card on their first turn.`, 'rule');
  } else {
    g.draw(player, 1, 'draws');
  }
  yield* fastEffectWindow(g, { description: 'Draw Phase', kind: 'phase' });

  g.state.phase = 'STANDBY';
  g.log('Standby Phase.', 'phase');
  g.emit({ type: 'phaseStart', phase: 'STANDBY', player });
  yield* runScheduled(g, 'STANDBY');
  yield* fastEffectWindow(g, { description: 'Standby Phase', kind: 'phase' });

  g.state.phase = 'MAIN1';
  g.log('Main Phase 1.', 'phase');
  g.emit({ type: 'phaseStart', phase: 'MAIN1', player });
  yield* processTriggers(g);
}

// ---------------------------------------------------------------------------
// Special Summon procedures offered by card scripts (Synchro, Fusion, conditions)
// ---------------------------------------------------------------------------

export function checkSpecialSummonProcedure(g: Game, player: PlayerId, uid: string, procId: string): string | null {
  const base = checkOpenMainPhase(g, player);
  if (base) return base;
  const c = g.card(uid);
  const d = g.def(uid);
  const script = getScript(d.name);
  const proc = script?.specialSummon?.find((p) => p.id === procId);
  if (!proc) return `${d.name} has no such Special Summon procedure.`;
  if (!proc.from.includes(c.zone)) return `${d.name} cannot be Special Summoned from there.`;
  if ((c.zone === 'hand' || c.zone === 'extra' || c.zone === 'graveyard') && c.owner !== player) return `${d.name} is not yours.`;
  if (g.freeMonsterZones(player).length === 0) return 'All five of your Main Monster Zones are full.';
  return proc.condition(g, c, player);
}

export function* specialSummonProcedure(g: Game, player: PlayerId, uid: string, procId: string): Process<void> {
  const reason = checkSpecialSummonProcedure(g, player, uid, procId);
  if (reason) throw new Error(reason);
  const script = getScript(g.name(uid))!;
  const proc = script.specialSummon!.find((p) => p.id === procId)!;
  const ok = yield* proc.perform(g, g.card(uid), player);
  if (ok) yield* afterAction(g, `${g.name(uid)} was Special Summoned`);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function* runAction(g: Game, action: Action): Process<void> {
  switch (action.type) {
    case 'START_GAME':
      if (g.state.started) throw new Error('Game already started');
      g.state.started = true;
      g.log(`The Duel begins! Each player starts with ${g.player(0).lp} Life Points and 5 cards in hand.`, 'system');
      yield* startTurn(g, g.state.turnPlayer);
      return;
    case 'NORMAL_SUMMON':
      yield* normalSummonOrSet(g, action.player, action.uid, false);
      return;
    case 'SET_MONSTER':
      yield* normalSummonOrSet(g, action.player, action.uid, true);
      return;
    case 'FLIP_SUMMON':
      yield* flipSummon(g, action.player, action.uid);
      return;
    case 'CHANGE_POSITION':
      yield* changePosition(g, action.player, action.uid);
      return;
    case 'SET_SPELL_TRAP':
      yield* setSpellTrap(g, action.player, action.uid);
      return;
    case 'ACTIVATE':
      yield* activateFromOpenState(g, action.player, action.uid, action.effectId);
      return;
    case 'SPECIAL_SUMMON':
      yield* specialSummonProcedure(g, action.player, action.uid, action.procId);
      return;
    case 'GEMINI_SUMMON':
      yield* geminiSummon(g, action.player, action.uid);
      return;
    case 'PLACE_PENDULUM':
      yield* placePendulum(g, action.player, action.uid);
      return;
    case 'PENDULUM_SUMMON':
      yield* pendulumSummon(g, action.player);
      return;
    case 'DECLARE_ATTACK':
      yield* declareAttack(g, action.player, action.uid);
      return;
    case 'TO_BATTLE_PHASE':
      yield* toBattlePhase(g, action.player);
      return;
    case 'TO_MAIN2':
      yield* toMain2(g, action.player);
      return;
    case 'TO_END_PHASE':
    case 'END_TURN':
      yield* endTurn(g, action.player);
      return;
  }
}

export { ActionCancelled };
