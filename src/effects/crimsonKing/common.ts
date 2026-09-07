import type { Game } from '../../engine/game';
import type { CardInstance, PlayerId } from '../../engine/types';
import { def } from '../helpers';

export const RDA = 'Red Dragon Archfiend';

/** Is the card "Red Dragon Archfiend" (including cards treated as it while on the field / in the GY)? */
export function isRDA(g: Game, uid: string): boolean {
  return g.isNamed(uid, RDA);
}
/** A "Red Dragon Archfiend" monster: its name contains the words (Scarlight, Abyss, Bane, King Calamity, Assault Mode ...) or it is treated as RDA. */
export function isRDAMonster(g: Game, uid: string): boolean {
  return def(g, uid).cardType === 'Monster' && (g.name(uid).includes(RDA) || isRDA(g, uid));
}
/** A Synchro Monster that mentions "Red Dragon Archfiend" in its text. */
export function synchroMentionsRDA(g: Game, uid: string): boolean {
  return g.isSynchroMonster(uid) && g.mentions(uid, RDA);
}
/** "While you control Red Dragon Archfiend or a Synchro Monster that mentions it". */
export function controlsRDA(g: Game, player: PlayerId): boolean {
  return g.fieldMonsters(player).some((m) => m.faceUp && (isRDA(g, m.uid) || synchroMentionsRDA(g, m.uid)));
}
export function isResonator(g: Game, uid: string): boolean {
  return g.name(uid).includes('Resonator') && def(g, uid).cardType === 'Monster';
}
export function isFiendTuner(g: Game, uid: string): boolean {
  const d = def(g, uid);
  return d.race === 'Fiend' && !!d.monsterTypes?.includes('Tuner');
}
export function isDarkDragonSynchro(g: Game, uid: string): boolean {
  return g.isSynchroMonster(uid) && def(g, uid).attribute === 'DARK' && def(g, uid).race === 'Dragon';
}
export function isTuner(g: Game, uid: string): boolean {
  return !!def(g, uid).monsterTypes?.includes('Tuner');
}
export function tunersInGY(g: Game, player: PlayerId): string[] {
  return g.player(player).graveyard.filter((u) => isTuner(g, u));
}
export function synchrosOnField(g: Game, player: PlayerId, minLevel = 0): CardInstance[] {
  return g.fieldMonsters(player).filter((m) => m.faceUp && g.isSynchroMonster(m.uid) && g.levelOf(m.uid) >= minLevel);
}
