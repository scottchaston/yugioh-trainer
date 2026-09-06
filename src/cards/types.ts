/**
 * Static card definitions (what is printed on the card).
 * Generated from official TCG card text; see scripts/extract-cards.py.
 */
export type CardKind = 'Monster' | 'Spell' | 'Trap';

export type SpellProperty = 'Normal' | 'Quick-Play' | 'Continuous' | 'Equip' | 'Field' | 'Ritual';
export type TrapProperty = 'Normal' | 'Continuous' | 'Counter';

export type MonsterTypeMarker =
  | 'Normal'
  | 'Effect'
  | 'Tuner'
  | 'Gemini'
  | 'Fusion'
  | 'Synchro'
  | 'Xyz'
  | 'Link'
  | 'Pendulum'
  | 'Ritual'
  | 'Flip'
  | 'Spirit'
  | 'Union'
  | 'Toon';

export type Attribute = 'LIGHT' | 'DARK' | 'EARTH' | 'WATER' | 'FIRE' | 'WIND' | 'DIVINE';

export interface CardDefinition {
  /** Passcode (the 8-digit number printed on the card), used as the stable id. */
  id: string;
  konamiId?: number;
  name: string;
  cardType: CardKind;
  /** Official card text (TCG). For Pendulum monsters this is the monster effect text. */
  text: string;
  setNumbers: string[];
  // Monster fields
  race?: string; // Dragon, Beast, Fairy ...
  monsterTypes?: MonsterTypeMarker[];
  attribute?: Attribute;
  level?: number;
  atk?: number;
  def?: number;
  pendulumScale?: number;
  pendulumEffect?: string;
  materials?: string;
  // Spell/Trap fields
  property?: SpellProperty | TrapProperty;
}

export function isMonster(c: CardDefinition): boolean {
  return c.cardType === 'Monster';
}
export function hasType(c: CardDefinition, t: MonsterTypeMarker): boolean {
  return !!c.monsterTypes?.includes(t);
}
export function isExtraDeckMonster(c: CardDefinition): boolean {
  return hasType(c, 'Fusion') || hasType(c, 'Synchro') || hasType(c, 'Xyz') || hasType(c, 'Link');
}
export function isNormalMonster(c: CardDefinition): boolean {
  return c.cardType === 'Monster' && hasType(c, 'Normal');
}
export function isEffectMonster(c: CardDefinition): boolean {
  return c.cardType === 'Monster' && hasType(c, 'Effect');
}
export function isTuner(c: CardDefinition): boolean {
  return hasType(c, 'Tuner');
}
