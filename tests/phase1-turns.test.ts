import { describe, it, expect } from 'vitest';
import { makeGame, start, endTurn, put, A } from './harness';

describe('turn structure', () => {
  it('second player draws on turn 2 and phases progress', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg);
    expect(tg.state.turn).toBe(2);
    expect(tg.state.turnPlayer).toBe(1);
    expect(tg.state.phase).toBe('MAIN1');
    expect(tg.state.players[1].hand.length).toBe(6);
  });

  it('cannot act on the opponent turn', () => {
    const tg = makeGame();
    start(tg);
    const uid = tg.state.players[1].hand[0];
    const reason = tg.expectIllegal({ type: 'NORMAL_SUMMON', player: 1, uid });
    expect(reason).toMatch(/turn/i);
  });

  it('first turn: cannot enter Battle Phase', () => {
    const tg = makeGame();
    start(tg);
    const reason = tg.expectIllegal({ type: 'TO_BATTLE_PHASE', player: 0 });
    expect(reason).toMatch(/first turn/i);
    endTurn(tg);
    // Player 2 (turn 2) may enter battle phase
    tg.run({ type: 'TO_BATTLE_PHASE', player: 1 });
    expect(tg.state.phase).toBe('BATTLE');
    tg.run({ type: 'TO_MAIN2', player: 1 });
    expect(tg.state.phase).toBe('MAIN2');
    tg.expectIllegal({ type: 'TO_BATTLE_PHASE', player: 1 });
  });

  it('enforces the hand size limit at the End Phase', () => {
    const tg = makeGame();
    start(tg);
    endTurn(tg); // P2 turn 2: 6 cards
    endTurn(tg); // P1 turn 3: draws to 6
    // P1 now has 6 cards; give them one more so they must discard.
    put(tg, 0, 'Rabidragon', 'hand');
    expect(tg.state.players[0].hand.length).toBe(7);
    const r = tg.runPartial({ type: 'END_TURN', player: 0 });
    expect(r.done).toBe(false);
    expect(r.prompt?.type).toBe('selectCards');
    const toDiscard = tg.state.players[0].hand[0];
    tg.run({ type: 'END_TURN', player: 0 }, A.cards(toDiscard));
    expect(tg.state.players[0].hand.length).toBe(6);
    expect(tg.state.cards[toDiscard].zone).toBe('graveyard');
  });

  it('loses when unable to draw', () => {
    const tg = makeGame();
    start(tg);
    tg.state.players[1].deck = [];
    endTurn(tg);
    expect(tg.state.winner).toBe(0);
  });
});
