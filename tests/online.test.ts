/**
 * Online play: opaque card ids, per-player redaction, and the host/guest session protocol
 * (run over an in-memory transport; the WebRTC transport is exercised in e2e/online.mjs).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { HIDDEN_CARD_ID, getCard } from '@/cards';
import { getDeck } from '@/cards/decks';
import { Game, createGame, execute, getLegalActions, type Action, type GameState, type PlayerId } from '@/engine';
import { redactState, isHiddenFrom } from '@/net/view';
import { HostSession, GuestSession } from '@/net/session';
import { loopbackPair } from '@/net/transport';
import type { GuestMessage, HostMessage } from '@/net/protocol';
import { answer, clearGame, dispatch, getStore, newGame, replayDuel, saveDuel, setInterceptor, setOnline, undo } from '@/state/store';
import { suggestMoves } from '@/strategy/suggest';
import '@/effects';

function startedState(seed = 7, first: PlayerId = 0): GameState {
  const initial = createGame({ players: [{ name: 'A', deckId: 'sdbe' }, { name: 'B', deckId: 'sdcb' }], firstPlayer: first, seed });
  const r = execute(initial, { type: 'START_GAME' }, []);
  return r.state;
}

describe('Opaque card ids', () => {
  it('uids do not reveal the card and are unique', () => {
    const s = startedState();
    const uids = Object.keys(s.cards);
    expect(new Set(uids).size).toBe(uids.length);
    for (const uid of uids) {
      const c = s.cards[uid];
      expect(uid).not.toContain(c.cardId);
      expect(uid).toMatch(/^p[01]-\d+$/);
    }
  });
  it('noShuffle keeps the deck list order (by card, not by label)', () => {
    const s = createGame({ players: [{ name: 'A', deckId: 'sdbe' }, { name: 'B', deckId: 'sdbe' }], firstPlayer: 0, seed: 1, noShuffle: true });
    const names = [...s.players[0].hand, ...s.players[0].deck].map((u) => getCard(s.cards[u].cardId).name);
    const expected = getDeck('sdbe').main.flatMap((e) => Array.from({ length: e.qty }, () => e.name));
    expect(names).toEqual(expected);
  });
});

describe('Redacted views', () => {
  it('hides the opponent hand, both decks, the opponent Extra Deck and face-down cards; shows own cards', () => {
    const s = startedState();
    // Give player 1 a Set Spell/Trap and a face-down monster; player 0 a Set card too.
    const set = (p: PlayerId, uid: string, zone: 'spellTrap' | 'monster') => {
      const c = s.cards[uid];
      c.zone = zone;
      c.index = 0;
      c.faceUp = false;
      c.controller = p;
      if (zone === 'monster') {
        c.position = 'DEF';
        s.players[p].monsterZones[0] = uid;
      } else s.players[p].spellTrapZones[0] = uid;
      s.players[p].hand = s.players[p].hand.filter((u) => u !== uid);
    };
    set(1, s.players[1].hand[0], 'spellTrap');
    set(1, s.players[1].hand[0], 'monster');
    set(0, s.players[0].hand[0], 'spellTrap');
    const v0 = redactState(s, 0, null);
    const v1 = redactState(s, 1, null);
    const hidden = (v: GameState, uid: string) => v.cards[uid].cardId === HIDDEN_CARD_ID;
    for (const u of s.players[1].hand) expect(hidden(v0, u)).toBe(true);
    for (const u of s.players[0].hand) expect(hidden(v0, u)).toBe(false);
    for (const u of s.players[0].deck) expect(hidden(v0, u)).toBe(true);
    for (const u of s.players[1].deck) expect(hidden(v0, u)).toBe(true);
    for (const u of s.players[1].extra) expect(hidden(v0, u)).toBe(true);
    for (const u of s.players[0].extra) expect(hidden(v0, u)).toBe(false);
    expect(hidden(v0, s.players[1].spellTrapZones[0]!)).toBe(true);
    expect(hidden(v0, s.players[1].monsterZones[0]!)).toBe(true);
    expect(hidden(v0, s.players[0].spellTrapZones[0]!)).toBe(false);
    // The other way round
    expect(hidden(v1, s.players[1].spellTrapZones[0]!)).toBe(false);
    expect(hidden(v1, s.players[0].spellTrapZones[0]!)).toBe(true);
    for (const u of s.players[0].hand) expect(hidden(v1, u)).toBe(true);
    // No hidden card carries bookkeeping that could leak
    const h = v0.cards[s.players[1].hand[0]];
    expect(h.token).toBeNull();
    expect(h.flags).toEqual({});
    expect(v0.rngState).toBe(0);
    // Deck order is not sent
    expect(v0.players[0].deck).toEqual(s.players[0].deck.slice().sort());
    expect(v0.players[0].deck.length).toBe(s.players[0].deck.length);
    // Original untouched
    expect(s.cards[s.players[1].hand[0]].cardId).not.toBe(HIDDEN_CARD_ID);
  });

  it('reveals the cards a player is currently choosing from (e.g. searching their own Deck)', () => {
    const s = startedState();
    const pick = s.players[0].deck.slice(0, 3);
    const v = redactState(s, 0, { type: 'selectCards', player: 0, title: 'Choose', cards: pick, min: 1, max: 1 });
    for (const u of pick) expect(v.cards[u].cardId).not.toBe(HIDDEN_CARD_ID);
    for (const u of s.players[0].deck.slice(3)) expect(v.cards[u].cardId).toBe(HIDDEN_CARD_ID);
    // ... but not when the prompt belongs to the other player
    const v2 = redactState(s, 1, { type: 'selectCards', player: 0, title: 'Choose', cards: pick, min: 1, max: 1 });
    for (const u of pick) expect(v2.cards[u].cardId).toBe(HIDDEN_CARD_ID);
  });

  it('a redacted state is safe for the UI helpers (stats, legality, suggestions)', () => {
    const s = startedState();
    const v = redactState(s, 1, null);
    const g = new Game(v);
    for (const m of g.fieldMonsters(0).concat(g.fieldMonsters(1))) if (m.faceUp) g.stats(m.uid);
    expect(() => getLegalActions(v, 1)).not.toThrow();
    expect(() => suggestMoves(v, 1, null)).not.toThrow();
    expect(getCard(HIDDEN_CARD_ID).name).toBe('Face-down card');
    expect(isHiddenFrom(v.cards[s.players[0].hand[0]], 1)).toBe(true);
  });
});

describe('Save / replay', () => {
  beforeEach(() => {
    setInterceptor(null);
    setOnline(null);
    clearGame();
  });
  it('replaying the recorded steps reproduces the same state', () => {
    newGame({ players: [{ name: 'A', deckId: 'sdbe' }, { name: 'B', deckId: 'sdcb' }], firstPlayer: 0, seed: 11 });
    const st = getStore().history[0].state;
    const hand = st.players[0].hand.find((u) => getCard(st.cards[u].cardId).cardType === 'Monster' && (getCard(st.cards[u].cardId).level ?? 0) <= 4)!;
    dispatch({ type: 'SET_MONSTER', player: 0, uid: hand });
    if (getStore().pending?.prompt.type === 'selectZone') answer({ zone: { player: 0, zone: 'monster', index: 2 } });
    expect(getStore().pending).toBeNull();
    dispatch({ type: 'END_TURN', player: 0 });
    for (let i = 0; i < 6 && getStore().pending; i++) answer({ activation: null });
    expect(getStore().history.length).toBe(3);
    const saved = saveDuel()!;
    expect(saved.steps.length).toBe(3);
    expect(saved.steps[0].action.type).toBe('START_GAME');
    const replayed = replayDuel(JSON.parse(JSON.stringify(saved)));
    expect(replayed.length).toBe(3);
    expect(JSON.stringify(replayed[2].state)).toBe(JSON.stringify(getStore().history[2].state));
  });
});

/** Answer whatever the engine asks with the most neutral choice (pass / "no" / the minimum selection). */
function neutralAnswer(p: import('@/engine').Prompt): import('@/engine').Answer {
  switch (p.type) {
    case 'fastEffects':
      return { activation: null };
    case 'selectOption': {
      const no = p.options.find((o) => /^(no|do not|don't|skip|decline)/i.test(o.label) || /^(no|skip|decline)$/i.test(o.id));
      return { option: (no ?? p.options[p.options.length - 1]).id };
    }
    case 'selectCards':
      return { cards: p.cards.slice(0, p.min) };
    case 'selectZone':
      return { zone: p.zones[0] };
  }
}

const SEED = 4242;

describe('Host session', () => {
  let host: HostSession;
  let guestSide: ReturnType<typeof loopbackPair<HostMessage, GuestMessage>>[1];
  let received: HostMessage[];
  const last = <T extends HostMessage['t']>(t: T) => received.filter((m) => m.t === t).pop() as Extract<HostMessage, { t: T }> | undefined;

  beforeEach(() => {
    setInterceptor(null);
    setOnline(null);
    clearGame();
    host = new HostSession('TEST-1', { name: 'Hosty', deckId: 'sdbe' }, 0, SEED);
    const [a, b] = loopbackPair<HostMessage, GuestMessage>();
    guestSide = b;
    received = [];
    b.onMessage((m) => received.push(m));
    host.attach(a);
    b.send({ t: 'hello', player: { name: 'Guesty', deckId: 'sdcb' }, protocol: 1 });
  });

  it('lobby, start, and a redacted view for the guest', () => {
    expect(last('lobby')?.guest?.name).toBe('Guesty');
    expect(getStore().online?.status).toBe('lobby');
    host.start();
    expect(last('start')?.seat).toBe(1);
    const v = last('view')!.view;
    expect(getStore().online?.status).toBe('playing');
    expect(v.view.players[0].name).toBe('Hosty');
    for (const u of v.view.players[0].hand) expect(v.view.cards[u].cardId).toBe(HIDDEN_CARD_ID);
    for (const u of v.view.players[1].hand) expect(v.view.cards[u].cardId).not.toBe(HIDDEN_CARD_ID);
    expect(v.prompt).toBeNull();
    expect(v.waiting?.player).toBe(0);
    // Not the guest's turn: nothing a turn player does is legal (a Quick Effect from the hand may be).
    const turnOnly = new Set(['NORMAL_SUMMON', 'SET_MONSTER', 'SET_SPELL_TRAP', 'DECLARE_ATTACK', 'TO_BATTLE_PHASE', 'TO_MAIN2', 'END_TURN', 'FLIP_SUMMON', 'CHANGE_POSITION']);
    expect(v.legal.filter((a) => a.legal && turnOnly.has(a.action.type))).toEqual([]);
    // Host's own view: guest's hand hidden
    const full = getStore().history[0].state;
    const hv = redactState(full, 0, null);
    for (const u of full.players[1].hand) expect(hv.cards[u].cardId).toBe(HIDDEN_CARD_ID);
  });

  it('rejects guest actions that are not theirs, with an explanation sent to the guest only', () => {
    host.start();
    const st = getStore().history[0].state;
    const before = getStore().history.length;
    guestSide.send({ t: 'action', action: { type: 'NORMAL_SUMMON', player: 1, uid: st.players[1].hand[0] } });
    expect(last('notice')).toBeTruthy();
    expect(getStore().history.length).toBe(before);
    expect(getStore().notice).toBeNull();
    guestSide.send({ t: 'action', action: { type: 'END_TURN', player: 0 } });
    expect(last('notice')?.title).toBe('Not your action');
    expect(getStore().history.length).toBe(before);
    // An answer when no question is pending for the guest
    guestSide.send({ t: 'answer', answer: { activation: null } });
    expect(last('notice')?.title).toBe('Not your decision');
  });

  it('runs a full exchange: host turn, guest response window, guest turn with a zone choice, undo both ways', () => {
    host.start();
    // Host ends its turn. The End Phase window asks the guest whether to respond.
    dispatch({ type: 'END_TURN', player: 0 });
    let guard = 0;
    while (getStore().pending && guard++ < 10) {
      const p = getStore().pending!.prompt;
      if (p.player === 0) answer(neutralAnswer(p));
      else {
        const gv = last('view')!.view;
        expect(gv.prompt?.player).toBe(1);
        guestSide.send({ t: 'answer', answer: neutralAnswer(gv.prompt!) });
      }
    }
    const st = getStore().history[getStore().history.length - 1].state;
    expect(st.turnPlayer).toBe(1);
    // Guest's view now lists legal actions
    const gv = last('view')!.view;
    expect(gv.waiting).toBeNull();
    const summon = gv.legal.find((a) => a.legal && a.action.type === 'NORMAL_SUMMON');
    expect(summon).toBeTruthy();
    guestSide.send({ t: 'action', action: summon!.action });
    const zoneView = last('view')!.view;
    expect(zoneView.prompt?.type).toBe('selectZone');
    expect(zoneView.prompt?.player).toBe(1);
    // Meanwhile the host is told to wait
    expect(host.guestView()?.prompt?.player).toBe(1);
    expect(getStore().pending!.prompt.player).toBe(1);
    guestSide.send({ t: 'answer', answer: { zone: { player: 1, zone: 'monster', index: 2 } } });
    // Possible summon-response window / optional triggers for either player
    guard = 0;
    while (getStore().pending && guard++ < 10) {
      const p = getStore().pending!.prompt;
      if (p.player === 0) answer(neutralAnswer(p));
      else guestSide.send({ t: 'answer', answer: neutralAnswer(last('view')!.view.prompt!) });
    }
    expect(getStore().notice).toBeNull();
    const after = getStore().history[getStore().history.length - 1].state;
    expect(after.players[1].monsterZones[2]).toBeTruthy();
    const summonUid = after.players[1].monsterZones[2]!;
    // The host sees the summoned monster face-up (public)
    expect(redactState(after, 0, null).cards[summonUid].cardId).not.toBe(HIDDEN_CARD_ID);
    // Guest asks to undo; host allows
    const len = getStore().history.length;
    guestSide.send({ t: 'undoRequest' });
    expect(getStore().online?.undoRequest).toBe('incoming');
    host.respondUndo(true);
    expect(getStore().online?.undoRequest).toBeNull();
    expect(getStore().history.length).toBe(len - 1);
    expect(last('undoReply')?.ok).toBe(true);
    // Host asks to undo; guest declines, then allows
    undo();
    expect(getStore().online?.undoRequest).toBe('outgoing');
    expect(last('undoRequest')).toBeTruthy();
    guestSide.send({ t: 'undoReply', ok: false });
    expect(getStore().history.length).toBe(len - 1);
    expect(getStore().notice?.title).toBe('Undo declined');
    undo();
    guestSide.send({ t: 'undoReply', ok: true });
    expect(getStore().history.length).toBe(len - 2);
    // Suggestions on request
    guestSide.send({ t: 'suggest' });
    expect(Array.isArray(last('suggestions')?.suggestions)).toBe(true);
    // Save data was recorded for every step
    expect(saveDuel()!.steps.length).toBe(getStore().history.length);
  });

  it('a reconnecting guest gets the whole game again; leaving ends the session', () => {
    host.start();
    const [a2, b2] = loopbackPair<HostMessage, GuestMessage>();
    const got: HostMessage[] = [];
    b2.onMessage((m) => got.push(m));
    host.attach(a2);
    b2.send({ t: 'hello', player: { name: 'Guesty', deckId: 'sdcb' }, protocol: 1 });
    expect(got.map((m) => m.t)).toEqual(['start', 'view']);
    host.leave();
    expect(got[got.length - 1].t).toBe('ended');
    expect(getStore().online).toBeNull();
    expect(getStore().history.length).toBe(0);
  });
});

describe('Guest session', () => {
  it('forwards intents to the host and mirrors what the host sends', () => {
    setInterceptor(null);
    setOnline(null);
    clearGame();
    const guest = new GuestSession('TEST-2', { name: 'Guesty', deckId: 'sdcb' });
    const [a, b] = loopbackPair<GuestMessage, HostMessage>();
    const got: GuestMessage[] = [];
    b.onMessage((m) => got.push(m));
    guest.attach(a);
    expect(got[0]).toMatchObject({ t: 'hello', player: { name: 'Guesty' } });
    b.send({ t: 'lobby', host: { name: 'Hosty', deckId: 'sdbe' }, guest: { name: 'Guesty', deckId: 'sdcb' }, first: 'coin' });
    expect(getStore().online?.status).toBe('lobby');
    expect(getStore().online?.opponent?.name).toBe('Hosty');
    const st = startedState();
    b.send({ t: 'start', seat: 1, players: [{ name: 'Hosty', deckId: 'sdbe' }, { name: 'Guesty', deckId: 'sdcb' }] });
    b.send({ t: 'view', view: { view: redactState(st, 1, null), prompt: null, legal: [], waiting: { player: 0, text: 'x' }, canUndo: false } });
    expect(getStore().online?.status).toBe('playing');
    expect(getStore().online?.remote?.view.players[1].hand.length).toBe(5);
    const act: Action = { type: 'END_TURN', player: 1 };
    dispatch(act);
    expect(got[got.length - 1]).toEqual({ t: 'action', action: act });
    answer({ activation: null });
    expect(got[got.length - 1]).toEqual({ t: 'answer', answer: { activation: null } });
    undo();
    expect(got[got.length - 1]).toEqual({ t: 'undoRequest' });
    expect(getStore().online?.undoRequest).toBe('outgoing');
    b.send({ t: 'undoReply', ok: false });
    expect(getStore().online?.undoRequest).toBeNull();
    expect(getStore().notice?.title).toBe('Undo declined');
    b.send({ t: 'undoRequest' });
    expect(getStore().online?.undoRequest).toBe('incoming');
    guest.respondUndo(true);
    expect(got[got.length - 1]).toEqual({ t: 'undoReply', ok: true });
    b.send({ t: 'notice', title: 'Nope', text: 'because', kind: 'error' });
    expect(getStore().notice?.title).toBe('Nope');
    guest.requestSuggestions();
    expect(got[got.length - 1]).toEqual({ t: 'suggest' });
    b.send({ t: 'suggestions', suggestions: [{ title: 'x', reason: 'y', kind: 'info' }] });
    expect(getStore().online?.suggestions?.length).toBe(1);
    guest.leave();
    expect(got[got.length - 1]).toEqual({ t: 'leave' });
    expect(getStore().online).toBeNull();
  });
});
