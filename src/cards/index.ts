import rawCards from './data/cards.json';
import type { CardDefinition } from './types';

const CARDS: CardDefinition[] = rawCards as unknown as CardDefinition[];

const byId = new Map<string, CardDefinition>();
const byName = new Map<string, CardDefinition>();
for (const c of CARDS) {
  byId.set(c.id, c);
  byName.set(c.name, c);
}

export function getCard(id: string): CardDefinition {
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
