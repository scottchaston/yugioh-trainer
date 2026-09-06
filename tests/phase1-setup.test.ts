import { describe, it, expect } from 'vitest';
import { makeGame, start } from './harness';
import { getCard, getCardByName, isExtraDeckMonster } from '../src/cards';
import { DECKS } from '../src/cards/decks';

describe('game setup', () => {
  it('builds both decks with correct sizes and Extra Deck separation', () => {
    const tg = makeGame({ keepHands: true });
    const p1 = tg.state.players[0];
    const p2 = tg.state.players[1];
    // SDBE: 40 main (5 in hand + 35 in deck), 1 extra
    expect(p1.hand.length).toBe(5);
    expect(p1.deck.length).toBe(35);
    expect(p1.extra.length).toBe(1);
    expect(getCard(tg.state.cards[p1.extra[0]].cardId).name).toBe('Azure-Eyes Silver Dragon');
    // SDCB: 44 main, 2 extra
    expect(p2.hand.length).toBe(5);
    expect(p2.deck.length).toBe(39);
    expect(p2.extra.length).toBe(2);
    const extraNames = p2.extra.map((u) => getCard(tg.state.cards[u].cardId).name).sort();
    expect(extraNames).toEqual(['Rainbow Overdragon', 'Ultimate Crystal Rainbow Dragon Overdrive']);
    expect(p1.lp).toBe(8000);
    expect(p2.lp).toBe(8000);
  });

  it('never puts an Extra Deck monster in the Main Deck or hand', () => {
    for (const deck of DECKS) {
      for (const e of deck.main) expect(isExtraDeckMonster(getCardByName(e.name))).toBe(false);
      for (const e of deck.extra) expect(isExtraDeckMonster(getCardByName(e.name))).toBe(true);
    }
  });

  it('shuffles deterministically by seed and differently for different seeds', () => {
    const a = makeGame({ seed: 1, keepHands: true }).state.players[0].deck.join(',');
    const b = makeGame({ seed: 1, keepHands: true }).state.players[0].deck.join(',');
    const c = makeGame({ seed: 2, keepHands: true }).state.players[0].deck.join(',');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('starts turn 1 without drawing, in Main Phase 1', () => {
    const tg = makeGame({ keepHands: true });
    start(tg);
    expect(tg.state.turn).toBe(1);
    expect(tg.state.phase).toBe('MAIN1');
    expect(tg.state.players[0].hand.length).toBe(5);
    expect(tg.log().some((l) => l.includes('does not draw'))).toBe(true);
  });
});
