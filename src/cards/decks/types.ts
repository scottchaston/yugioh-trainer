export interface DeckEntry {
  /** Card name (looked up in the card database). */
  name: string;
  qty: number;
}

export interface DeckDefinition {
  id: string;
  name: string;
  description: string;
  main: DeckEntry[];
  extra: DeckEntry[];
}
