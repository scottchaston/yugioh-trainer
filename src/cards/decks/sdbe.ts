import type { DeckDefinition } from './types';

/**
 * Saga of Blue-Eyes White Dragon Structure Deck (SDBE), TCG 2013.
 * 41 cards: 40 Main Deck (Shining Angel x2) + 1 Extra Deck.
 * Verified against SDBE-EN001..EN040 set numbers and two independent deck-list mirrors.
 */
export const SAGA_OF_BLUE_EYES: DeckDefinition = {
  id: 'sdbe',
  name: 'Saga of Blue-Eyes White Dragon',
  description: 'Structure Deck (2013). Big LIGHT Dragons, Synchro Summoning Azure-Eyes Silver Dragon.',
  main: [
    { name: 'Blue-Eyes White Dragon', qty: 1 },
    { name: 'Rabidragon', qty: 1 },
    { name: 'Alexandrite Dragon', qty: 1 },
    { name: 'Luster Dragon', qty: 1 },
    { name: 'Flamvell Guard', qty: 1 },
    { name: 'Maiden with Eyes of Blue', qty: 1 },
    { name: 'Rider of the Storm Winds', qty: 1 },
    { name: 'Darkstorm Dragon', qty: 1 },
    { name: 'Kaiser Glider', qty: 1 },
    { name: 'Hieratic Dragon of Tefnuit', qty: 1 },
    { name: 'Mirage Dragon', qty: 1 },
    { name: 'Divine Dragon Apocralyph', qty: 1 },
    { name: 'The White Stone of Legend', qty: 1 },
    { name: 'Kaibaman', qty: 1 },
    { name: 'Herald of Creation', qty: 1 },
    { name: 'Kaiser Sea Horse', qty: 1 },
    { name: 'Honest', qty: 1 },
    { name: 'Shining Angel', qty: 2 },
    { name: 'Dragon Shrine', qty: 1 },
    { name: "Silver's Cry", qty: 1 },
    { name: 'Burst Stream of Destruction', qty: 1 },
    { name: 'Stamping Destruction', qty: 1 },
    { name: 'A Wingbeat of Giant Dragon', qty: 1 },
    { name: 'Trade-In', qty: 1 },
    { name: 'Cards of Consonance', qty: 1 },
    { name: "White Elephant's Gift", qty: 1 },
    { name: 'One for One', qty: 1 },
    { name: 'Monster Reborn', qty: 1 },
    { name: 'Dragonic Tactics', qty: 1 },
    { name: 'Soul Exchange', qty: 1 },
    { name: 'Swords of Revealing Light', qty: 1 },
    { name: 'Enemy Controller', qty: 1 },
    { name: 'Castle of Dragon Souls', qty: 1 },
    { name: 'Fiendish Chain', qty: 1 },
    { name: 'Kunai with Chain', qty: 1 },
    { name: 'Damage Condenser', qty: 1 },
    { name: 'Call of the Haunted', qty: 1 },
    { name: 'Compulsory Evacuation Device', qty: 1 },
    { name: "Champion's Vigilance", qty: 1 },
  ],
  extra: [{ name: 'Azure-Eyes Silver Dragon', qty: 1 }],
};
