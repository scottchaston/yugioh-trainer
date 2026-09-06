/**
 * Test helpers: build a game with chosen hands/fields and drive actions with answers.
 */
import { expect } from 'vitest';
import { getCard, getCardByName } from '../src/cards';
import { createGame, execute, getLegalActions } from '../src/engine';
import type { Action, Answer, CardInstance, GameState, PlayerId, Prompt, Zone } from '../src/engine';
import '../src/effects';

export interface TestGame {
  state: GameState;
  /** Run an action, feeding answers in order. Throws if the action ends on an unanswered prompt or error. */
  run(action: Action, ...answers: Answer[]): GameState;
  /** Run an action and return the prompt it stops at (or undefined if it completed). */
  runPartial(action: Action, ...answers: Answer[]): { prompt?: Prompt; state: GameState; done: boolean; error?: string };
  /** Expect the action to be rejected; returns the reason. */
  expectIllegal(action: Action, ...answers: Answer[]): string;
  /** Find a card uid by name for a player (first match in the given zone or anywhere). */
  find(player: PlayerId, name: string, zone?: Zone): string;
  card(uid: string): CardInstance;
  log(): string[];
  legal(player: PlayerId): ReturnType<typeof getLegalActions>;
}

export function makeGame(opts: { firstPlayer?: PlayerId; decks?: [string, string]; seed?: number; keepHands?: boolean } = {}): TestGame {
  let state = createGame({
    players: [
      { name: 'Player 1', deckId: opts.decks?.[0] ?? 'sdbe' },
      { name: 'Player 2', deckId: opts.decks?.[1] ?? 'sdcb' },
    ],
    firstPlayer: opts.firstPlayer ?? 0,
    seed: opts.seed ?? 42,
  });
  if (!opts.keepHands) {
    // Neutral hands: put the dealt cards at the bottom of the Deck so scenarios only contain what they `put`.
    // Reactive cards (hand traps, Quick-Plays, "from hand" effects) are moved to the very bottom.
    for (const pl of state.players) {
      const hand = pl.hand.slice();
      pl.hand = [];
      for (const u of hand) {
        state.cards[u].zone = 'deck';
        pl.deck.push(u);
      }
      const reactive = (u: string) => {
        const d = getCard(state.cards[u].cardId);
        return /\(Quick Effect\)|from your hand|Quick-Play/.test(d.text + (d.property ?? '')) || d.name === 'Honest' || d.name.startsWith('Ash Blossom') || d.name.startsWith('Ghost Belle') || d.name === 'Dimension Shifter' || d.name === 'Contact "C"' || d.name === 'Crystal Beast Rainbow Dragon' || d.name === 'Crystal Keeper';
      };
      pl.deck = [...pl.deck.filter((u) => !reactive(u)), ...pl.deck.filter(reactive)];
    }
  }
  const tg: TestGame = {
    get state() {
      return state;
    },
    set state(s: GameState) {
      state = s;
    },
    run(action, ...answers) {
      // Answers are matched to prompts by type: response windows and optional triggers the test does not
      // answer explicitly are declined automatically.
      const queue = answers.slice();
      const all: Answer[] = [];
      for (let guard = 0; guard < 60; guard++) {
        const r = execute(state, action, all);
        if (r.error) throw new Error(`Action ${action.type} failed: ${r.error}`);
        if (r.done) {
          state = r.state;
          return state;
        }
        const p = r.prompt!;
        const next = queue[0];
        const fits =
          next !== undefined &&
          ((p.type === 'fastEffects' && 'activation' in next) ||
            (p.type === 'selectCards' && 'cards' in next) ||
            (p.type === 'selectOption' && 'option' in next) ||
            (p.type === 'selectZone' && 'zone' in next) ||
            ('cancel' in next && !!next.cancel));
        if (fits) {
          all.push(queue.shift()!);
          continue;
        }
        if (p.type === 'fastEffects') {
          all.push({ activation: null });
          continue;
        }
        if (p.type === 'selectOption' && p.title.startsWith('Activate ')) {
          all.push({ option: 'no' });
          continue;
        }
        throw new Error(`Action ${action.type} stopped at prompt: ${JSON.stringify(p)} (next answer: ${JSON.stringify(next)})`);
      }
      throw new Error('Too many prompts');
    },
    runPartial(action, ...answers) {
      const r = execute(state, action, answers);
      if (r.done) state = r.state;
      return { prompt: r.prompt, state: r.state, done: r.done, error: r.error };
    },
    expectIllegal(action, ...answers) {
      const r = execute(state, action, answers);
      expect(r.error, `expected ${action.type} to be illegal`).toBeTruthy();
      return r.error!;
    },
    find(player, name, zone) {
      const def = getCardByName(name);
      const matches = Object.values(state.cards).filter((c) => c.owner === player && c.cardId === def.id && (!zone || c.zone === zone));
      if (!matches.length) throw new Error(`No ${name} for player ${player}${zone ? ` in ${zone}` : ''}`);
      return matches[0].uid;
    },
    card(uid) {
      return state.cards[uid];
    },
    log() {
      return state.log.map((l) => l.text);
    },
    legal(player) {
      return getLegalActions(state, player);
    },
  };
  return tg;
}

/** Move a card (by name) into a zone directly, for scenario setup. */
export function put(
  tg: TestGame,
  player: PlayerId,
  name: string,
  zone: 'hand' | 'monster' | 'spellTrap' | 'field' | 'graveyard' | 'deckTop' | 'banished' | 'extra',
  opts: { faceUp?: boolean; position?: 'ATK' | 'DEF'; index?: number; turnEnteredField?: number; setThisTurn?: boolean; treatedAsSpell?: 'continuous' | 'equip' | 'pendulum' | null } = {},
): string {
  const s = tg.state;
  const def = getCardByName(name);
  // prefer a copy that's in the deck, else anywhere
  const candidates = Object.values(s.cards).filter((c) => c.owner === player && c.cardId === def.id);
  if (!candidates.length) {
    // The card is not in this player's Deck: create a fresh copy (for cross-deck interaction tests).
    const uid = `x${player}-${Object.keys(s.cards).length + 1}`;
    s.cards[uid] = {
      uid,
      cardId: def.id,
      owner: player,
      controller: player,
      zone: 'deck',
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
    candidates.push(s.cards[uid]);
  }
  const c = candidates.find((x) => x.zone === 'deck' || x.zone === 'extra') ?? candidates[0];
  const pl = s.players[player];
  // detach
  pl.deck = pl.deck.filter((u) => u !== c.uid);
  pl.hand = pl.hand.filter((u) => u !== c.uid);
  pl.graveyard = pl.graveyard.filter((u) => u !== c.uid);
  pl.banished = pl.banished.filter((u) => u !== c.uid);
  pl.extra = pl.extra.filter((u) => u !== c.uid);
  pl.monsterZones = pl.monsterZones.map((u) => (u === c.uid ? null : u));
  pl.spellTrapZones = pl.spellTrapZones.map((u) => (u === c.uid ? null : u));
  if (pl.fieldZone === c.uid) pl.fieldZone = null;
  c.controller = player;
  c.faceUp = opts.faceUp ?? true;
  c.position = null;
  c.index = -1;
  c.turnEnteredField = opts.turnEnteredField ?? (s.turn > 1 ? s.turn - 1 : 0);
  c.setThisTurn = opts.setThisTurn ?? false;
  c.summonedThisTurn = false;
  c.treatedAsSpell = opts.treatedAsSpell ?? null;
  switch (zone) {
    case 'hand':
      c.zone = 'hand';
      c.faceUp = false;
      pl.hand.push(c.uid);
      break;
    case 'deckTop':
      c.zone = 'deck';
      c.faceUp = false;
      pl.deck.unshift(c.uid);
      break;
    case 'graveyard':
      c.zone = 'graveyard';
      c.faceUp = true;
      pl.graveyard.push(c.uid);
      break;
    case 'banished':
      c.zone = 'banished';
      pl.banished.push(c.uid);
      break;
    case 'extra':
      c.zone = 'extra';
      c.faceUp = false;
      pl.extra.push(c.uid);
      break;
    case 'monster': {
      const idx = opts.index ?? pl.monsterZones.findIndex((u) => u === null);
      c.zone = 'monster';
      c.index = idx;
      c.position = opts.position ?? 'ATK';
      c.faceUp = opts.faceUp ?? true;
      pl.monsterZones[idx] = c.uid;
      break;
    }
    case 'spellTrap': {
      const idx = opts.index ?? pl.spellTrapZones.findIndex((u) => u === null);
      c.zone = 'spellTrap';
      c.index = idx;
      c.faceUp = opts.faceUp ?? false;
      pl.spellTrapZones[idx] = c.uid;
      break;
    }
    case 'field':
      c.zone = 'field';
      c.index = 0;
      c.faceUp = opts.faceUp ?? true;
      pl.fieldZone = c.uid;
      break;
  }
  return c.uid;
}

/** Start the game (turn 1). */
export function start(tg: TestGame): void {
  tg.run({ type: 'START_GAME' });
}

/** Ends the current turn and starts the next; answers are used if prompts occur. */
export function endTurn(tg: TestGame, ...answers: Answer[]): void {
  const action: Action = { type: 'END_TURN', player: tg.state.turnPlayer };
  const all = answers.slice();
  for (let guard = 0; guard < 40; guard++) {
    const r = tg.runPartial(action, ...all);
    if (r.error) throw new Error(`END_TURN failed: ${r.error}`);
    if (r.done) return;
    if (r.prompt?.type === 'fastEffects') {
      all.push({ activation: null });
      continue;
    }
    if (r.prompt?.type === 'selectCards' && r.prompt.title.startsWith('Discard')) {
      all.push({ cards: r.prompt.cards.slice(0, r.prompt.min) });
      continue;
    }
    // Optional trigger effects ("Activate X?") are declined unless the test answers them.
    if (r.prompt?.type === 'selectOption' && r.prompt.title.startsWith('Activate ')) {
      all.push({ option: 'no' });
      continue;
    }
    throw new Error(`END_TURN stopped at prompt: ${JSON.stringify(r.prompt)}`);
  }
}

/** Convenience answers */
export const A = {
  cards: (...uids: string[]): Answer => ({ cards: uids }),
  option: (id: string): Answer => ({ option: id }),
  zone: (player: PlayerId, zone: 'monster' | 'spellTrap', index: number): Answer => ({ zone: { player, zone, index } }),
  pass: (): Answer => ({ activation: null }),
  activate: (uid: string, effectId = 'activate'): Answer => ({ activation: { uid, effectId } }),
  yes: (): Answer => ({ option: 'yes' }),
  no: (): Answer => ({ option: 'no' }),
};
