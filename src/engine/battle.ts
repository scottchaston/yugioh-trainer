/**
 * Battle Phase: attack declaration follow-through and the Damage Step.
 */
import { Game } from './game';
import { getScript, type Process } from './scripts';
import { fastEffectWindow, processTriggers } from './flow';
import type { PlayerId } from './types';

export function tributesRequired(level: number): number {
  if (level >= 7) return 2;
  if (level >= 5) return 1;
  return 0;
}

export function extraAttacksFor(g: Game, uid: string): number {
  let n = 0;
  const m = g.card(uid);
  for (const src of g.activeFieldCards()) {
    const s = getScript(g.name(src.uid));
    if (s?.extraAttacks) n += s.extraAttacks(g, src, m);
  }
  return n;
}

export function hasPiercing(g: Game, uid: string): boolean {
  const m = g.card(uid);
  if (m.flags['piercing'] || m.flags['piercingThisTurn']) return true;
  for (const src of g.activeFieldCards()) {
    const s = getScript(g.name(src.uid));
    if (s?.piercing?.(g, src, m)) return true;
  }
  return false;
}

/** Continuous "cannot attack" style restrictions. Returns a reason or null. */
export function attackRestriction(g: Game, attacker: string, target: string | null): string | null {
  const a = g.card(attacker);
  if (a.flags['cannotAttackThisTurn']) return `${g.name(attacker)} cannot attack this turn (${a.flags['cannotAttackReason'] ?? 'card effect'}).`;
  if (a.flags['cannotAttack']) return `${g.name(attacker)} cannot attack (${a.flags['cannotAttackReason'] ?? 'card effect'}).`;
  const nameFlag = g.player(a.controller).turnFlags[`cannotAttack:${g.name(attacker)}`];
  if (nameFlag) return `${g.name(attacker)} cannot attack this turn (${nameFlag}).`;
  for (const src of g.activeFieldCards()) {
    const s = getScript(g.name(src.uid));
    const r = s?.restrictAttack?.(g, src, a, target ? g.card(target) : null);
    if (r) return r;
  }
  return null;
}

/** Perform the Damage Step for the current battle. */
export function* damageStep(g: Game): Process<void> {
  const b = g.state.battle!;
  b.step = 'DAMAGE';
  const attackerUid = b.attacker!;
  const attackerCtrl = g.card(attackerUid).controller;
  const defender: PlayerId = g.opponent(attackerCtrl);

  g.log('Damage Step begins.', 'battle');
  b.damageStepStage = 'start';
  for (const uid of [attackerUid, b.target]) {
    const m = uid ? g.state.cards[uid] : undefined;
    const boost = m?.flags['atkBoostInBattleThisTurn'] as { atk: number; source: string } | undefined;
    if (m && boost && m.faceUp) {
      g.addStatMod(uid!, boost.atk, 0, 'endOfDamageStep', boost.source);
      g.log(`${g.name(uid!)} gains ${boost.atk} ATK until the end of the Damage Step (${boost.source}).`, 'effect');
    }
  }
  {
    const att = g.card(attackerUid);
    if (!att.flags['effectsNegated']) getScript(g.name(attackerUid))?.onDamageStepStart?.(g, att, 'attacker');
    if (b.target) {
      const t = g.card(b.target);
      if (t.faceUp && !t.flags['effectsNegated']) getScript(g.name(b.target))?.onDamageStepStart?.(g, t, 'target');
    }
  }
  yield* fastEffectWindow(g, { description: 'start of the Damage Step', damageStepStage: 'start' });

  // Before damage calculation: flip a face-down monster face-up.
  b.damageStepStage = 'beforeCalc';
  if (b.target) {
    const t = g.card(b.target);
    if (!t.faceUp) {
      t.faceUp = true;
      const st = g.stats(t.uid);
      g.log(`${g.name(t.uid)} is flipped face-up (ATK ${st.atk} / DEF ${st.def}). It stays in Defense Position.`, 'battle');
      g.emit({ type: 'flipped', uid: t.uid, how: 'battle' });
    }
  }
  yield* fastEffectWindow(g, { description: 'before damage calculation', damageStepStage: 'beforeCalc' });
  if (!g.state.battle?.attacker) {
    g.log('The attacking monster is no longer on the field, so the battle ends.', 'rule');
    return;
  }

  // Damage calculation window (Honest etc.).
  b.damageStepStage = 'calc';
  yield* fastEffectWindow(g, { description: 'during damage calculation', damageStepStage: 'calc' });
  if (!g.state.battle?.attacker) {
    g.log('The attacking monster is no longer on the field, so the battle ends.', 'rule');
    return;
  }

  const destroyed: string[] = [];
  b.damageStepStage = 'calc';
  const attackerStats = g.stats(attackerUid);
  const attackerName = g.name(attackerUid);
  const inflict = (player: PlayerId, amount: number, reason: string, source: string) => {
    let dmg = amount;
    const mod = b.damageModifier[String(player)];
    const turnHalf = false;
    const noBattle = g.player(player).turnFlags['noBattleDamage'];
    if (b.directAttackByEffect && player === defender) {
      dmg = Math.floor(dmg / 2);
      g.log(`The battle damage is halved because the direct attack was allowed by a card effect: ${dmg}.`, 'rule');
    }
    if (mod === 'half' || turnHalf) {
      dmg = Math.floor(dmg / 2);
      g.log(`The battle damage is halved: ${dmg}.`, 'rule');
    }
    if (mod === 'none' || noBattle) {
      g.log(`${g.playerName(player)} takes no battle damage from this battle (card effect).`, 'rule');
      return;
    }
    const src = g.state.cards[source];
    if (src && src.controller !== player && src.flags['doubleBattleDamageThisTurn']) {
      dmg *= 2;
      g.log(`The battle damage is doubled (${src.flags['doubleBattleDamageThisTurn']}): ${dmg}.`, 'rule');
    }
    if (dmg <= 0) return;
    g.changeLP(player, -dmg, reason);
    g.emit({ type: 'battleDamage', player, amount: dmg, attacker: source });
  };
  if (!b.target) {
    g.log(`Damage calculation: ${attackerName} (ATK ${attackerStats.atk}) attacks directly.`, 'battle');
    inflict(defender, attackerStats.atk, `direct attack by ${attackerName}`, attackerUid);
  } else {
    const targetUid = b.target;
    const target = g.card(targetUid);
    const targetStats = g.stats(targetUid);
    const targetName = g.name(targetUid);
    if (target.position === 'ATK') {
      g.log(`Damage calculation: ${attackerName} (ATK ${attackerStats.atk}) vs ${targetName} (ATK ${targetStats.atk}).`, 'battle');
      if (attackerStats.atk > targetStats.atk) {
        const dmg = attackerStats.atk - targetStats.atk;
        g.log(`${attackerName} wins the battle. ${targetName} will be destroyed; ${g.playerName(target.controller)} takes ${dmg} battle damage (the difference in ATK).`, 'battle');
        destroyed.push(targetUid);
        inflict(target.controller, dmg, `battle: ${attackerName} vs ${targetName}`, attackerUid);
      } else if (attackerStats.atk < targetStats.atk) {
        const dmg = targetStats.atk - attackerStats.atk;
        g.log(`${targetName} wins the battle. ${attackerName} will be destroyed; ${g.playerName(attackerCtrl)} takes ${dmg} battle damage (the difference in ATK).`, 'battle');
        destroyed.push(attackerUid);
        inflict(attackerCtrl, dmg, `battle: ${attackerName} vs ${targetName}`, targetUid);
      } else {
        g.log(`Both monsters have equal ATK. Both will be destroyed, and no battle damage is inflicted.`, 'battle');
        destroyed.push(targetUid, attackerUid);
      }
    } else {
      g.log(`Damage calculation: ${attackerName} (ATK ${attackerStats.atk}) vs ${targetName} (DEF ${targetStats.def}).`, 'battle');
      if (attackerStats.atk > targetStats.def) {
        g.log(`${attackerName}'s ATK is higher than ${targetName}'s DEF. ${targetName} will be destroyed.`, 'battle');
        destroyed.push(targetUid);
        if (hasPiercing(g, attackerUid)) {
          const dmg = attackerStats.atk - targetStats.def;
          g.log(`${attackerName} inflicts piercing battle damage: ${dmg}.`, 'battle');
          inflict(target.controller, dmg, `piercing battle damage from ${attackerName}`, attackerUid);
        } else {
          g.log('No battle damage is inflicted when attacking a Defense Position monster (unless the attacker has a piercing effect).', 'rule');
        }
      } else if (attackerStats.atk < targetStats.def) {
        const dmg = targetStats.def - attackerStats.atk;
        g.log(`${targetName}'s DEF is higher than ${attackerName}'s ATK. Neither monster is destroyed, but ${g.playerName(attackerCtrl)} takes ${dmg} battle damage (the difference).`, 'battle');
        inflict(attackerCtrl, dmg, `battle: ${attackerName} attacked ${targetName} in Defense Position`, targetUid);
      } else {
        g.log(`${attackerName}'s ATK equals ${targetName}'s DEF. Nothing is destroyed and no damage is inflicted.`, 'battle');
      }
    }
  }
  g.emit({ type: 'damageCalculated', attacker: attackerUid, target: b.target });

  b.damageStepStage = 'afterCalc';
  yield* fastEffectWindow(g, { description: 'after damage calculation', damageStepStage: 'afterCalc' });

  // End of the Damage Step: monsters destroyed by battle are sent to the Graveyard.
  b.damageStepStage = 'end';
  for (const uid of destroyed) {
    const c = g.state.cards[uid];
    if (!c || !g.isMonsterOnField(c)) continue;
    yield* g.destroyByBattle(uid, uid === attackerUid ? (b.target ?? attackerUid) : attackerUid);
  }
  for (const uid of [attackerUid, b.target]) {
    const c = uid ? g.state.cards[uid] : undefined;
    if (!c || !g.isMonsterOnField(c)) continue;
    c.flags['battledThisTurn'] = true;
    if (c.flags['destroyAtEndOfDamageStep']) {
      delete c.flags['destroyAtEndOfDamageStep'];
      g.log(`${g.name(uid!)} is destroyed at the end of the Damage Step (${c.flags['destroyAtEndReason'] ?? 'card effect'}).`, 'effect');
      yield* g.destroyByEffect([uid!], null);
    }
  }
  g.expireStatMods('endOfDamageStep');
  g.log('Damage Step ends.', 'battle');
  yield* processTriggers(g);
  yield* fastEffectWindow(g, { description: 'end of the Damage Step', damageStepStage: 'end' });
}

/** Expected battle damage to `player` for the current battle if it were calculated now (for "you would take damage" effects). */
export function expectedBattleDamage(g: Game, player: PlayerId): number {
  const b = g.state.battle;
  if (!b || !b.attacker) return 0;
  const att = g.card(b.attacker);
  const a = g.stats(b.attacker);
  if (!b.target) return att.controller !== player ? a.atk : 0;
  const t = g.card(b.target);
  const ts = g.stats(b.target);
  if (t.position === 'ATK') {
    if (a.atk > ts.atk && t.controller === player) return a.atk - ts.atk;
    if (a.atk < ts.atk && att.controller === player) return ts.atk - a.atk;
    return 0;
  }
  if (a.atk < ts.def && att.controller === player) return ts.def - a.atk;
  if (a.atk > ts.def && t.controller === player && hasPiercing(g, b.attacker)) return a.atk - ts.def;
  return 0;
}
