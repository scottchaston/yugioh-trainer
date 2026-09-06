/**
 * Small helpers shared by card scripts.
 */
import { getCard, hasType, type CardDefinition } from '../cards';
import type { Game } from '../engine/game';
import type { ActivationContext, Process } from '../engine/scripts';
import type { CardInstance, PlayerId, Zone } from '../engine/types';

export function def(g: Game, uid: string): CardDefinition {
  return getCard(g.card(uid).cardId);
}

export function isDragon(g: Game, uid: string): boolean {
  return def(g, uid).race === 'Dragon';
}
export function isNormalMonster(g: Game, uid: string): boolean {
  const d = def(g, uid);
  return d.cardType === 'Monster' && hasType(d, 'Normal');
}
export function isLight(g: Game, uid: string): boolean {
  return def(g, uid).attribute === 'LIGHT';
}
export function isTunerCard(g: Game, uid: string): boolean {
  return hasType(def(g, uid), 'Tuner');
}
export function nameOf(g: Game, uid: string): string {
  return def(g, uid).name;
}
export function isCrystalBeast(g: Game, uid: string): boolean {
  return def(g, uid).name.startsWith('Crystal Beast');
}

/** Targets recorded at activation that are still in the same kind of place (a monster that left the field is no longer a valid target). */
export function validTargets(g: Game, ctx: ActivationContext, zones: Zone[]): string[] {
  return ctx.targets.filter((t) => {
    const c = g.state.cards[t];
    return c && zones.includes(c.zone);
  });
}

/** Monsters on the field, optionally filtered, that `player` can target (respecting targeting protection). */
export function targetableMonsters(g: Game, player: PlayerId, side: 'own' | 'opponent' | 'any', filter?: (c: CardInstance) => boolean): string[] {
  const ps: PlayerId[] = side === 'any' ? [0, 1] : [side === 'own' ? player : g.opponent(player)];
  const out: string[] = [];
  for (const p of ps) {
    for (const m of g.fieldMonsters(p)) {
      if (filter && !filter(m)) continue;
      if (g.targetingProtection(m, player)) continue;
      out.push(m.uid);
    }
  }
  return out;
}

export function fieldMonsterUids(g: Game, player: PlayerId): string[] {
  return g.fieldMonsters(player).map((m) => m.uid);
}

/** Choose `n` cards from `pool` for `player`, returning [] if the pool is too small. */
export function* pick(g: Game, player: PlayerId, title: string, pool: string[], min: number, max: number, description?: string): Process<string[]> {
  if (pool.length < min) return [];
  return yield* g.selectCards(player, title, pool, min, max, description);
}

export function deckCards(g: Game, player: PlayerId, filter?: (d: CardDefinition, c: CardInstance) => boolean): string[] {
  return g.player(player).deck.filter((u) => !filter || filter(def(g, u), g.card(u)));
}
export function handCards(g: Game, player: PlayerId, filter?: (d: CardDefinition, c: CardInstance) => boolean): string[] {
  return g.player(player).hand.filter((u) => !filter || filter(def(g, u), g.card(u)));
}
export function graveyardCards(g: Game, player: PlayerId, filter?: (d: CardDefinition, c: CardInstance) => boolean): string[] {
  return g.player(player).graveyard.filter((u) => !filter || filter(def(g, u), g.card(u)));
}

/** Spell/Trap activation "from" zones. */
export const SPELL_FROM: Zone[] = ['hand', 'spellTrap'];
export const FIELD_SPELL_FROM: Zone[] = ['hand', 'field'];
export const TRAP_FROM: Zone[] = ['spellTrap'];

/** Is the current fast-effect timing "an opponent's monster declared an attack" (before the Damage Step)? */
export function respondingToOpponentAttack(g: Game, player: PlayerId): boolean {
  const b = g.state.battle;
  if (!b || !b.attacker || b.step !== 'BATTLE' || b.damageStepStage) return false;
  return g.card(b.attacker).controller !== player;
}

/** The monster `player` controls that is currently battling, and the opposing monster it battles (if any). */
export function battlingMonsters(g: Game, player: PlayerId): { mine: string; theirs: string | null } | null {
  const b = g.state.battle;
  if (!b || !b.attacker) return null;
  const att = g.card(b.attacker);
  if (att.controller === player) return { mine: b.attacker, theirs: b.target };
  if (b.target && g.card(b.target).controller === player) return { mine: b.target, theirs: b.attacker };
  return null;
}
