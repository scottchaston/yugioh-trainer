import { BEWARE_OF_TRAPTRIX } from './sdbt';
import { THE_CRIMSON_KING } from './sdck';
import { SAGA_OF_BLUE_EYES } from './sdbe';
import { LEGEND_OF_THE_CRYSTAL_BEASTS } from './sdcb';
import type { DeckDefinition } from './types';

export const DECKS: DeckDefinition[] = [SAGA_OF_BLUE_EYES, LEGEND_OF_THE_CRYSTAL_BEASTS, BEWARE_OF_TRAPTRIX, THE_CRIMSON_KING];

export function getDeck(id: string): DeckDefinition {
  const d = DECKS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown deck ${id}`);
  return d;
}

export * from './types';
export { SAGA_OF_BLUE_EYES, LEGEND_OF_THE_CRYSTAL_BEASTS, BEWARE_OF_TRAPTRIX, THE_CRIMSON_KING };
