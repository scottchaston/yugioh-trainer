import rawCards from './data/cards.json';
import type { CardDefinition } from './types';

const CARDS: CardDefinition[] = rawCards as unknown as CardDefinition[];

const byId = new Map<string, CardDefinition>();
const byName = new Map<string, CardDefinition>();
for (const c of CARDS) {
  byId.set(c.id, c);
  byName.set(c.name, c);
}

/** Placeholder id used for cards whose identity is hidden from the viewer (online play). */
export const HIDDEN_CARD_ID = '__hidden__';
const HIDDEN_CARD: CardDefinition = {
  id: HIDDEN_CARD_ID,
  name: 'Face-down card',
  cardType: 'Monster',
  text: 'This card is hidden from you.',
  setNumbers: [],
  monsterTypes: [],
  level: 0,
  atk: 0,
  def: 0,
};

export function getCard(id: string): CardDefinition {
  if (id === HIDDEN_CARD_ID) return HIDDEN_CARD;
  const c = byId.get(id);
  if (!c) throw new Error(`Unknown card id ${id}`);
  return c;
}

export function getCardByName(name: string): CardDefinition {
  const c = byName.get(name);
  if (!c) throw new Error(`Unknown card name "${name}"`);
  return c;
}

export function allCards(): CardDefinition[] {
  return CARDS;
}

export * from './types';
