/**
 * Player actions: summons, sets, position changes, attacks, phase changes.
 * Each action has a `check*` function (used for legality + explanations) and a
 * generator that performs it.
 */
import { isExtraDeckMonster } from '../cards';
import { Game, ActionCancelled } from './game';
import { getScript, type Process } from './scripts';
import { activateFromOpenState, afterAction, fastEffectWindow, processTriggers, runScheduled } from './flow';
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
    return `You have already Normal Summoned or Set a monster this turn. You can only Normal Summon or Set once per turn.`;
  }
  const level = d.level ?? 0;
  const tributes = tributesRequired(level);
  const monsters = g.fieldMonsters(player);
  if (tributes > 0) {
    const available = monsters.reduce((n, m) => n + tributeValue(g, m.uid, uid), 0);
    if (available < tributes) {
      return `${d.name} is Level ${level}, so it needs ${tributes} Tribute${tributes > 1 ? 's' : ''} to be ${verb}ed (Level 5-6 monsters need 1 Tribute, Level 7 or higher need 2). You only control ${monsters.length} monster${monsters.length === 1 ? '' : 's'} to Tribute.`;
    }
  } else if (g.freeMonsterZones(player).length === 0) {
    return 'All five of your Main Monster Zones are full. You need an empty Monster Zone.';
  }
  return null;
}

/** How many Tributes a monster counts as when Tributing for `forUid` (Kaiser Sea Horse style effects). */
export function tributeValue(g: Game, monsterUid: string, forUid: string): number {
  const s = getScript(g.name(monsterUid));
  const extra = (s as { tributeValue?: (g: Game, self: unknown, forUid: string) => number } | undefined)?.tributeValue;
  if (extra) return Math.max(1, extra(g, g.card(monsterUid), forUid));
  return 1;
}

export function* normalSummonOrSet(g: Game, player: PlayerId, uid: string, asSet: boolean): Process<void> {
  const reason = checkNormalSummon(g, player, uid, asSet);
  if (reason) throw new Error(reason);
  const d = g.def(uid);
  const level = d.level ?? 0;
  const tributes = tributesRequired(level);

  if (tributes > 0) {
    const monsters = g.fieldMonsters(player).map((m) => m.uid);
    let chosen: string[] = [];
    // Allow fewer selected monsters when one counts as 2 Tributes.
    const anyDouble = monsters.some((m) => tributeValue(g, m, uid) >= 2);
    chosen = yield* g.selectCards(
      player,
      `Choose ${tributes} monster${tributes > 1 ? 's' : ''} to Tribute for ${d.name}`,
      monsters,
      anyDouble ? 1 : tributes,
      tributes,
      `${d.name} is Level ${level}. Tribute Summoning a Level ${level >= 7 ? '7 or higher' : '5 or 6'} monster requires ${tributes} Tribute${tributes > 1 ? 's' : ''}.`,
      true,
    );
    const value = chosen.reduce((n, m) => n + tributeValue(g, m, uid), 0);
    if (value < tributes) throw new Error(`You must Tribute monsters worth ${tributes} Tributes.`);
    for (const t of chosen) {
      g.log(`${g.name(t)} is Tributed.`, 'action');
      g.sendToGraveyard(t, 'tribute');
    }
  }

  const zone = yield* g.chooseMonsterZone(player, `Choose a Monster Zone for ${d.name}`);
  g.placeMonster(uid, player, zone, asSet ? 'DEF' : 'ATK', !asSet);
  const c = g.card(uid);
  g.player(player).normalSummonsUsed++;
  if (asSet) {
    c.setThisTurn = true;
    g.log(`${g.playerName(player)} Sets a monster${tributes > 0 ? ` (Tribute Set)` : ''} in face-down Defense Position.`, 'action');
    g.emit({ type: 'set', uid, player });
    yield* afterAction(g, `${g.playerName(player)} Set a monster`);
  } else {
    c.summonedThisTurn = true;
    const st = g.stats(uid);
    g.log(`${g.playerName(player)} ${tributes > 0 ? 'Tribute Summons' : 'Normal Summons'} ${d.name} (ATK ${st.atk} / DEF ${st.def}) in Attack Position.`, 'action');
    g.emit({ type: 'summon', uid, player, method: 'normal', how: tributes > 0 ? 'tribute' : 'normal' });
    yield* afterAction(g, `${d.name} was Normal Summoned`);
  }
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
  if (g.fieldMonsters(opponent).length > 0) {
    if (oppMonsters.length === 0) throw new Error('No legal attack target.');
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
  const c = g.card(uid);
  c.attacksDeclaredThisTurn++;
  if (target) {
    const t = g.card(target);
    g.log(`${g.name(uid)} declares an attack on ${t.faceUp ? g.name(target) : 'a face-down monster'}.`, 'battle');
  } else {
    g.log(`${g.name(uid)} declares a direct attack!`, 'battle');
  }
  g.emit({ type: 'attackDeclared', attacker: uid, target });

  // Response window for the attack declaration (turn player has priority, then the opponent).
  yield* fastEffectWindow(g, { description: `${g.name(uid)} declared an attack` }, [player, opponent]);

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
  if (nowCount !== bb.targetCountAtDeclaration || (bb.target === null && nowCount > 0) || (bb.target !== null && !g.isMonsterOnField(g.card(bb.target)))) {
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
    yield* fastEffectWindow(g, { description: `${g.name(att.uid)} re-declared an attack` }, [player, opponent]);
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
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export function checkToBattlePhase(g: Game, player: PlayerId): string | null {
  if (g.state.winner !== null) return 'The Duel is over.';
  if (g.state.turnPlayer !== player) return 'It is not your turn.';
  if (g.state.phase !== 'MAIN1') return `You can only enter the Battle Phase from Main Phase 1 (it is currently the ${PHASE_LABEL[g.state.phase]}). After the Battle Phase comes Main Phase 2, then the End Phase.`;
  if (g.state.turn === 1) return 'The player who goes first cannot conduct a Battle Phase during the first turn of the Duel.';
  if (g.player(player).effectUses['rule:skipBattlePhase']) return 'A card effect prevents you from conducting your Battle Phase this turn.';
  return null;
}

export function* toBattlePhase(g: Game, player: PlayerId): Process<void> {
  const reason = checkToBattlePhase(g, player);
  if (reason) throw new Error(reason);
  yield* fastEffectWindow(g, { description: 'end of Main Phase 1' }, [g.opponent(player)]);
  g.state.phase = 'BATTLE';
  g.state.battle = { step: 'START', attacker: null, target: null, targetCountAtDeclaration: 0, damageStepStage: null, attackNegated: false };
  g.log(`${g.playerName(player)} enters the Battle Phase.`, 'phase');
  g.emit({ type: 'phaseStart', phase: 'BATTLE', player });
  yield* fastEffectWindow(g, { description: 'Start Step of the Battle Phase' });
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
  yield* fastEffectWindow(g, { description: 'End Step of the Battle Phase' });
  g.state.battle = null;
  g.state.phase = 'MAIN2';
  g.log(`${g.playerName(player)} enters Main Phase 2.`, 'phase');
  g.emit({ type: 'phaseStart', phase: 'MAIN2', player });
  yield* fastEffectWindow(g, { description: 'start of Main Phase 2' }, [g.opponent(player)]);
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
    yield* fastEffectWindow(g, { description: 'End Step of the Battle Phase' });
    g.state.battle = null;
  } else {
    yield* fastEffectWindow(g, { description: `end of ${PHASE_LABEL[g.state.phase]}` }, [g.opponent(player)]);
  }
  g.state.phase = 'END';
  g.log(`${g.playerName(player)} enters the End Phase.`, 'phase');
  g.emit({ type: 'phaseStart', phase: 'END', player });
  yield* fastEffectWindow(g, { description: 'End Phase' });
  yield* runScheduled(g, 'END');
  yield* fastEffectWindow(g, { description: 'End Phase' });

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
  for (const p of [0, 1] as PlayerId[]) g.player(p).effectUses = {};
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
  yield* fastEffectWindow(g, { description: 'Draw Phase' });

  g.state.phase = 'STANDBY';
  g.log('Standby Phase.', 'phase');
  g.emit({ type: 'phaseStart', phase: 'STANDBY', player });
  yield* runScheduled(g, 'STANDBY');
  yield* fastEffectWindow(g, { description: 'Standby Phase' });

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
