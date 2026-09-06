/**
 * Helpers shared by the newer decks' scripts (searching, window events, targeting with "unaffected" checks).
 */
import { hasType, type CardDefinition } from '../cards';
import type { Game } from '../engine/game';
import type { Process } from '../engine/scripts';
import type { CardInstance, GameEvent, PlayerId, Zone } from '../engine/types';
import { def } from './helpers';

/** Add a card to its owner's hand (from Deck / GY / banished / field), shuffling the Deck if it came from there. */
export function addToHand(g: Game, uid: string, why?: string): void {
  const from = g.card(uid).zone;
  g.log(`${g.name(uid)} is added to the hand${from === 'deck' ? ' from the Deck' : from === 'graveyard' ? ' from the Graveyard' : from === 'banished' ? ' from the banished cards' : ''}${why ? ` (${why})` : ''}.`, 'effect');
  g.toHand(uid);
  if (from === 'deck') g.shuffleDeck(g.card(uid).owner);
}

/** Let `player` choose a card from a pool and add it to the hand. Returns the chosen uid or null. */
export function* searchAndAdd(g: Game, player: PlayerId, title: string, pool: string[], why?: string): Process<string | null> {
  if (pool.length === 0) {
    g.log(`There is no card to add (${title}).`, 'rule');
    return null;
  }
  const [u] = yield* g.selectCards(player, title, pool, 1, 1);
  addToHand(g, u, why);
  return u;
}

export function isNormalTrap(d: CardDefinition): boolean {
  return d.cardType === 'Trap' && (d.property ?? 'Normal') === 'Normal';
}
export function isNormalSpell(d: CardDefinition): boolean {
  return d.cardType === 'Spell' && (d.property ?? 'Normal') === 'Normal';
}
export function isTunerDef(d: CardDefinition): boolean {
  return hasType(d, 'Tuner');
}

/** Summon events (by `player`, optionally restricted to methods) among the events of the current response window. */
export function summonsInWindow(g: Game, player: PlayerId, methods?: ('normal' | 'special' | 'flip')[]): Extract<GameEvent, { type: 'summon' }>[] {
  return g.state.windowEvents.filter((e): e is Extract<GameEvent, { type: 'summon' }> => e.type === 'summon' && e.player === player && (!methods || methods.includes(e.method)));
}
/** Monsters `player` Summoned in the current window that are still face-up on the field. */
export function summonedMonstersInWindow(g: Game, player: PlayerId, methods?: ('normal' | 'special' | 'flip')[]): string[] {
  const out: string[] = [];
  for (const e of summonsInWindow(g, player, methods)) {
    const c = g.state.cards[e.uid];
    if (c && g.isMonsterOnField(c) && !out.includes(e.uid)) out.push(e.uid);
  }
  return out;
}

/** All cards a player controls on the field (monsters, Spells/Traps, Field Spell). */
export function controlledCards(g: Game, player: PlayerId): CardInstance[] {
  const out = [...g.fieldMonsters(player), ...g.spellTrapCards(player)];
  const f = g.fieldSpell(player);
  if (f) out.push(f);
  return out;
}

/** Cards on the field that `player` may target with `source`'s effect (targeting protection and "unaffected" honoured). */
export function targetableCards(g: Game, player: PlayerId, side: 'own' | 'opponent' | 'any', source: string, filter?: (c: CardInstance) => boolean): string[] {
  const ps: PlayerId[] = side === 'any' ? [0, 1] : [side === 'own' ? player : g.opponent(player)];
  const out: string[] = [];
  for (const p of ps) for (const c of controlledCards(g, p)) if ((!filter || filter(c)) && !g.targetingProtection(c, player, source)) out.push(c.uid);
  return out;
}
export function targetableMonstersOf(g: Game, player: PlayerId, side: 'own' | 'opponent' | 'any', source: string, filter?: (c: CardInstance) => boolean): string[] {
  return targetableCards(g, player, side, source, (c) => g.isMonsterOnField(c) && (!filter || filter(c)));
}

/** Banish a card by a card effect (respects "unaffected"). Returns true if banished. */
export function banishByEffect(g: Game, uid: string, source: string, faceUp = true): boolean {
  if (g.isUnaffected(uid, source)) {
    g.log(`${g.name(uid)} is unaffected by ${g.name(source)}, so it is not banished.`, 'rule');
    return false;
  }
  g.log(`${g.name(uid)} is banished${faceUp ? '' : ' face-down'} by ${g.name(source)}.`, 'effect');
  g.banish(uid, faceUp, source);
  return true;
}

/** Return a card to the hand by a card effect (respects "unaffected"). */
export function bounceByEffect(g: Game, uid: string, source: string): boolean {
  if (g.isUnaffected(uid, source)) {
    g.log(`${g.name(uid)} is unaffected by ${g.name(source)}, so it is not returned.`, 'rule');
    return false;
  }
  g.log(`${g.name(uid)} is returned to the hand by ${g.name(source)}.`, 'effect');
  g.toHand(uid);
  return true;
}

/** Send a card to the GY by a card effect (respects "unaffected"). */
export function sendByEffect(g: Game, uid: string, source: string): boolean {
  if (g.isUnaffected(uid, source)) {
    g.log(`${g.name(uid)} is unaffected by ${g.name(source)}, so it is not sent to the Graveyard.`, 'rule');
    return false;
  }
  g.log(`${g.name(uid)} is sent to the Graveyard by ${g.name(source)}.`, 'effect');
  g.sendToGraveyard(uid, 'sent', source);
  return true;
}

export function zoneOf(g: Game, uid: string): Zone {
  return g.card(uid).zone;
}

/** Face-up monsters `player` controls. */
export function faceUpMonsters(g: Game, player: PlayerId, filter?: (c: CardInstance) => boolean): CardInstance[] {
  return g.fieldMonsters(player).filter((m) => m.faceUp && (!filter || filter(m)));
}

/** The chain link being responded to (the last link on the chain), if any. */
export function lastChainLink(g: Game) {
  const chain = g.state.chain;
  return chain.length ? chain[chain.length - 1] : null;
}

/** Discard `n` cards chosen by `player` from their hand (as a cost or effect). */
export function* discardCards(g: Game, player: PlayerId, n: number, title: string, pool?: string[]): Process<string[]> {
  const hand = pool ?? g.player(player).hand.slice();
  const chosen = yield* g.selectCards(player, title, hand, n, n);
  for (const u of chosen) {
    g.log(`${g.playerName(player)} discards ${g.name(u)}.`, 'effect');
    g.sendToGraveyard(u, 'discard');
  }
  return chosen;
}

/** Special Summon from the Deck/hand/GY with the usual bookkeeping (shuffle when it came from the Deck). */
export function* summonCard(g: Game, uid: string, player: PlayerId, how: string, position: 'ATK' | 'DEF' | 'choose' = 'choose'): Process<boolean> {
  const from = g.card(uid).zone;
  const ok = yield* g.specialSummon(uid, player, { position, how });
  if (from === 'deck') g.shuffleDeck(g.card(uid).owner);
  return ok;
}

export function defOf(g: Game, uid: string): CardDefinition {
  return def(g, uid);
}
