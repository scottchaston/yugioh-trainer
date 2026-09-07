import { getCardByName, isExtraDeckMonster } from '../cards';
import { getDeck } from '../cards/decks';
import { shuffleWithState } from './rng';
import type { CardInstance, GameState, PlayerId, PlayerState } from './types';

export interface PlayerConfig {
  name: string;
  deckId: string;
  /** This seat is played by the computer opponent (src/ai) at the given level. */
  ai?: 'easy' | 'medium' | 'hard';
}

export interface GameConfig {
  players: [PlayerConfig, PlayerConfig];
  firstPlayer: PlayerId;
  seed?: number;
  startingLP?: number;
  /** For tests: don't shuffle (decks stay in list order). */
  noShuffle?: boolean;
}

function blankInstance(uid: string, cardId: string, owner: PlayerId, zone: 'deck' | 'extra'): CardInstance {
  return {
    uid,
    cardId,
    owner,
    controller: owner,
    zone,
    index: -1,
    faceUp: false,
    position: null,
    turnEnteredField: -1,
    summonedThisTurn: false,
    setThisTurn: false,
    positionChangedThisTurn: false,
    attacksDeclaredThisTurn: 0,
    geminiEffectActive: false,
    treatedAsSpell: null,
    token: null,
    fusionSummoned: false,
    equippedTo: null,
    treatedAsMonster: null,
    materials: [],
    attachedTo: null,
    properlySummoned: false,
    statMods: [],
    counters: {},
    flags: {},
  };
}

/** Build the initial state: decks shuffled, 5 cards drawn each. The game has not started (see START_GAME). */
export function createGame(config: GameConfig): GameState {
  const cards: Record<string, CardInstance> = {};
  let rngState = (config.seed ?? Date.now()) >>> 0;
  const players = config.players.map((pc, pi) => {
    const p = pi as PlayerId;
    const deckDef = getDeck(pc.deckId);
    const deck: string[] = [];
    const extra: string[] = [];
    // Card ids are opaque labels: the numbering is shuffled so a uid reveals nothing about which
    // card it is (online play sends uids of hidden cards to the opponent).
    const total = [...deckDef.main, ...deckDef.extra].reduce((acc, e) => acc + e.qty, 0);
    const labels = shuffleWithState(Array.from({ length: total }, (_, i) => i + 1), rngState);
    rngState = labels.state;
    let n = 0;
    for (const entry of [...deckDef.main, ...deckDef.extra]) {
      const def = getCardByName(entry.name);
      for (let i = 0; i < entry.qty; i++) {
        const uid = `p${p}-${labels.result[n++]}`;
        const isExtra = isExtraDeckMonster(def);
        cards[uid] = blankInstance(uid, def.id, p, isExtra ? 'extra' : 'deck');
        (isExtra ? extra : deck).push(uid);
      }
    }
    let shuffled = deck;
    if (!config.noShuffle) {
      const r = shuffleWithState(deck, rngState);
      shuffled = r.result;
      rngState = r.state;
    }
    const hand = shuffled.slice(0, 5);
    const rest = shuffled.slice(5);
    for (const u of hand) cards[u].zone = 'hand';
    const ps: PlayerState = {
      name: pc.name,
      deckId: pc.deckId,
      lp: config.startingLP ?? 8000,
      deck: rest,
      hand,
      graveyard: [],
      banished: [],
      extra,
      monsterZones: [null, null, null, null, null],
      spellTrapZones: [null, null, null, null, null],
      fieldZone: null,
      normalSummonsUsed: 0,
      normalSummonsAllowed: 1,
      effectUses: {},
      turnFlags: {},
      duelFlags: {},
      pendulumSummonUsed: false,
    };
    return ps;
  }) as [PlayerState, PlayerState];

  return {
    turn: 0,
    turnPlayer: config.firstPlayer,
    phase: 'DRAW',
    players,
    cards,
    extraMonsterZones: [null, null],
    battle: null,
    chain: [],
    resolvingChain: false,
    resolvingLinkIndex: -1,
    windowOpen: false,
    pendingEvents: [],
    log: [],
    nextLogId: 1,
    rngState,
    winner: null,
    winReason: null,
    started: false,
    scheduled: [],
    nextScheduledId: 1,
    links: {},
    summonAttempt: null,
    windowEvents: [],
    recentEvents: [],
    fx: [],
    nextFxId: 1,
    banishInsteadUntilTurn: null,
    nextTokenId: 1,
  };
}
