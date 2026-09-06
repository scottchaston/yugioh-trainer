import { getCard, type CardDefinition } from '../cards';
import { tokenDefinition } from '../engine/game';
import type { CardInstance } from '../engine';

/** Card definition for an instance, including Tokens created during the Duel. */
export function defOf(c: CardInstance): CardDefinition {
  return c.token ? tokenDefinition(c.token) : getCard(c.cardId);
}
