/**
 * Per-player views of the game: what one seat is allowed to see.
 * Hidden information (the opponent's hand, face-down cards, both Decks, the opponent's Extra Deck)
 * is replaced by a placeholder so the data sent to a remote player never contains it.
 */
import { HIDDEN_CARD_ID } from '../cards';
import { getLegalActions, PHASE_LABEL, type CardInstance, type GameState, type PlayerId, type Prompt } from '../engine';
import type { PlayerView, StoreState } from '../state/store';
import { committedState, currentView } from '../state/store';

const PUBLIC_ZONES = new Set(['monster', 'extraMonster', 'spellTrap', 'field']);

export function isHiddenFrom(c: CardInstance, viewer: PlayerId): boolean {
  if (c.zone === 'deck') return true;
  if (c.zone === 'hand') return c.owner !== viewer;
  if (c.zone === 'extra') return !c.faceUp && c.owner !== viewer;
  if (PUBLIC_ZONES.has(c.zone)) return !c.faceUp && c.controller !== viewer;
  return false;
}

function hide(c: CardInstance): CardInstance {
  return {
    uid: c.uid,
    cardId: HIDDEN_CARD_ID,
    owner: c.owner,
    controller: c.controller,
    zone: c.zone,
    index: c.index,
    faceUp: false,
    position: c.position,
    turnEnteredField: c.turnEnteredField,
    summonedThisTurn: c.summonedThisTurn,
    setThisTurn: c.setThisTurn,
    positionChangedThisTurn: false,
    attacksDeclaredThisTurn: 0,
    geminiEffectActive: false,
    treatedAsSpell: c.treatedAsSpell,
    token: null,
    fusionSummoned: false,
    equippedTo: null,
    properlySummoned: false,
    statMods: [],
    counters: {},
    flags: {},
  };
}

/**
 * The state as `viewer` may see it. Cards the viewer is currently choosing from (e.g. searching
 * their own Deck) are revealed, since the engine is showing them to that player.
 */
export function redactState(state: GameState, viewer: PlayerId, prompt: Prompt | null): GameState {
  const revealed = new Set<string>(prompt && prompt.player === viewer && prompt.type === 'selectCards' ? prompt.cards : []);
  const cards: Record<string, CardInstance> = {};
  for (const [uid, c] of Object.entries(state.cards)) {
    cards[uid] = !revealed.has(uid) && isHiddenFrom(c, viewer) ? hide(c) : c;
  }
  const players = state.players.map((p) => ({ ...p, deck: p.deck.slice().sort() })) as GameState['players'];
  return { ...state, cards, players, rngState: 0 };
}

export function waitingText(state: GameState, prompt: Prompt | null, me: PlayerId): { player: PlayerId; text: string } | null {
  if (state.winner !== null) return null;
  if (prompt) {
    if (prompt.player === me) return null;
    const name = state.players[prompt.player].name;
    return { player: prompt.player, text: prompt.type === 'fastEffects' ? `${name} is deciding whether to respond…` : `${name} is choosing: ${prompt.title}` };
  }
  if (state.turnPlayer !== me) {
    const name = state.players[state.turnPlayer].name;
    return { player: state.turnPlayer, text: `${name}'s turn (${PHASE_LABEL[state.phase]}) — you can still respond when a window opens.` };
  }
  return null;
}

/** Build the view a seat should see from the full store. */
export function buildPlayerView(s: StoreState, seat: PlayerId): PlayerView | null {
  const view = currentView(s);
  const committed = committedState(s);
  if (!view || !committed) return null;
  const prompt = s.pending?.prompt ?? null;
  const mine = prompt && prompt.player === seat ? prompt : null;
  return {
    view: redactState(view, seat, mine),
    prompt: mine,
    legal: s.pending ? [] : getLegalActions(committed, seat),
    waiting: waitingText(view, prompt, seat),
    canUndo: s.history.length > 1 || !!s.pending,
  };
}
