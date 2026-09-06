import type { CardScript } from '../../engine/scripts';
import type { Game } from '../../engine/game';
import type { CardInstance, PlayerId } from '../../engine/types';
import { def } from '../helpers';
import { isNormalTrap } from '../shared';

export function isTraptrix(g: Game, uid: string): boolean {
  return g.name(uid).startsWith('Traptrix ');
}
export function isTraptrixMonster(g: Game, uid: string): boolean {
  return isTraptrix(g, uid) && def(g, uid).cardType === 'Monster';
}
/** "Hole" Normal Trap: a Normal Trap with "Hole" in its name. */
export function isHoleTrap(g: Game, uid: string): boolean {
  const d = def(g, uid);
  return isNormalTrap(d) && d.name.includes('Hole');
}
export function isInsectOrPlant(g: Game, uid: string): boolean {
  const r = g.raceOf(uid);
  return r === 'Insect' || r === 'Plant';
}
/** Every Traptrix Main Deck monster is unaffected by the effects of "Hole" Normal Traps. */
export const unaffectedByHoleTraps: NonNullable<CardScript['unaffectedBy']> = (g, self, source) => isHoleTrap(g, source.uid) && !source.treatedAsMonster;
/** Link Summoned Traptrix Link Monsters are unaffected by Trap effects. */
export const linkSummonedUnaffectedByTraps: NonNullable<CardScript['unaffectedBy']> = (g, self, source) => !!self.flags['linkSummoned'] && def(g, source.uid).cardType === 'Trap' && !source.treatedAsMonster;

export function holeTrapsIn(g: Game, player: PlayerId, zone: 'deck' | 'graveyard'): string[] {
  return g.player(player)[zone].filter((u) => isHoleTrap(g, u));
}
export function traptrixIn(g: Game, player: PlayerId, zone: 'deck' | 'graveyard' | 'hand', filter?: (c: CardInstance) => boolean): string[] {
  return g.player(player)[zone].filter((u) => isTraptrixMonster(g, u) && (!filter || filter(g.card(u))));
}
export function normalTrapsIn(g: Game, player: PlayerId, zone: 'deck' | 'graveyard'): string[] {
  return g.player(player)[zone].filter((u) => isNormalTrap(def(g, u)));
}
/** Names of the cards `player` controls (for "with a different name than the cards you control"). */
export function controlledNames(g: Game, player: PlayerId): Set<string> {
  const out = new Set<string>();
  for (const m of g.fieldMonsters(player)) out.add(g.name(m.uid));
  for (const c of g.spellTrapCards(player)) out.add(g.name(c.uid));
  const f = g.fieldSpell(player);
  if (f) out.add(g.name(f.uid));
  return out;
}
