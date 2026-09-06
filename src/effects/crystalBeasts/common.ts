/** Helpers shared by the Crystal Beast deck scripts. */
import type { Game } from '../../engine/game';
import type { Process } from '../../engine/scripts';
import type { CardInstance, PlayerId } from '../../engine/types';
import { def } from '../helpers';

const ULTIMATE_CRYSTAL = new Set(['Rainbow Dragon', 'Rainbow Dark Dragon', 'Rainbow Overdragon', 'Ultimate Crystal Rainbow Dragon Overdrive']);

export function isCB(g: Game, uid: string): boolean {
  return g.name(uid).startsWith('Crystal Beast');
}
export function isCBMonsterCard(g: Game, uid: string): boolean {
  return isCB(g, uid) && def(g, uid).cardType === 'Monster';
}
export function isUltimateCrystal(g: Game, uid: string): boolean {
  return ULTIMATE_CRYSTAL.has(g.name(uid)) || g.name(uid).includes('Ultimate Crystal');
}
/** "Crystal" Spell/Trap: a Spell or Trap Card with "Crystal" in its name. */
export function isCrystalSpellTrap(g: Game, uid: string): boolean {
  const d = def(g, uid);
  return d.cardType !== 'Monster' && d.name.includes('Crystal');
}
/** Crystal Beast cards in a player's Spell & Trap Zone (Continuous Spells), not the Field Zone. */
export function cbInSTZone(g: Game, player: PlayerId): CardInstance[] {
  return g.spellTrapCards(player).filter((c) => c.faceUp && isCB(g, c.uid));
}
export function cbMonstersOnField(g: Game, player: PlayerId): CardInstance[] {
  return g.fieldMonsters(player).filter((m) => isCB(g, m.uid));
}
/** Number of Crystal Beast cards with different names among the given uids. */
export function differentNames(g: Game, uids: string[]): number {
  return new Set(uids.map((u) => g.name(u))).size;
}
export function cbInDeck(g: Game, player: PlayerId, filter?: (c: CardInstance) => boolean): string[] {
  return g.player(player).deck.filter((u) => isCBMonsterCard(g, u) && (!filter || filter(g.card(u))));
}
export function cbInGY(g: Game, player: PlayerId): string[] {
  return g.player(player).graveyard.filter((u) => isCBMonsterCard(g, u));
}
export function cbInHand(g: Game, player: PlayerId): string[] {
  return g.player(player).hand.filter((u) => isCBMonsterCard(g, u));
}

/** Place a Crystal Beast monster card face-up in the Spell & Trap Zone as a Continuous Spell. */
export function* placeCB(g: Game, uid: string, player: PlayerId): Process<boolean> {
  const from = g.card(uid).zone;
  const ok = yield* g.placeMonsterAsSpell(uid, player, 'continuous');
  if (ok) {
    g.log(`${g.name(uid)} is placed face-up in ${g.playerName(player)}'s Spell & Trap Zone as a Continuous Spell${from === 'deck' ? ' (from the Deck)' : from === 'graveyard' ? ' (from the Graveyard)' : from === 'hand' ? ' (from the hand)' : ''}.`, 'effect');
    if (from === 'deck') g.shuffleDeck(player);
  }
  return ok;
}

/** Special Summon a Crystal Beast from the Spell & Trap Zone to the Monster Zone. */
export function* summonFromST(g: Game, uid: string, player: PlayerId, how: string): Process<boolean> {
  const c = g.card(uid);
  if (c.zone !== 'spellTrap' || !isCBMonsterCard(g, uid)) return false;
  return yield* g.specialSummon(uid, player, { position: 'choose', how });
}

/** Zones a player may Special Summon a Crystal Beast Monster Card from, given a list of zones. */
export function cbCandidates(g: Game, player: PlayerId, zones: ('hand' | 'deck' | 'graveyard' | 'spellTrap')[]): string[] {
  const out: string[] = [];
  const pl = g.player(player);
  if (zones.includes('hand')) out.push(...cbInHand(g, player));
  if (zones.includes('deck')) out.push(...cbInDeck(g, player));
  if (zones.includes('graveyard')) out.push(...cbInGY(g, player));
  if (zones.includes('spellTrap')) out.push(...cbInSTZone(g, player).filter((c) => def(g, c.uid).cardType === 'Monster').map((c) => c.uid));
  void pl;
  return out;
}

export function zoneWord(z: string): string {
  return z === 'graveyard' ? 'Graveyard' : z === 'deck' ? 'Deck' : z === 'hand' ? 'hand' : z === 'spellTrap' ? 'Spell & Trap Zone' : z;
}
