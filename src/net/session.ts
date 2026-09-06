/**
 * Online play sessions. The host runs the rules engine (the normal store) and is the single source
 * of truth; the guest is a thin client that sends intents (actions/answers) and renders the view the
 * host sends back. Neither side ever trusts the other's rules: the host validates every intent
 * through the engine, and the guest only ever sees a redacted view.
 */
import type { Action, Answer, PlayerId } from '../engine';
import { suggestMoves } from '../strategy/suggest';
import {
  getStore,
  localAnswer,
  localCancelPending,
  localDispatch,
  localUndo,
  newGame,
  restoreDuel,
  saveDuel,
  setInterceptor,
  setNotice,
  setOnline,
  subscribe,
  updateOnline,
  clearGame,
  type SavedDuel,
} from '../state/store';
import type { PlayerView } from '../state/store';
import { buildPlayerView } from './view';
import { PROTOCOL_VERSION, type GuestMessage, type HostMessage, type PlayerInfo } from './protocol';
import type { AnyTransport, Transport } from './transport';

export type HostTransport = Transport<HostMessage, GuestMessage>;
export type GuestTransport = Transport<GuestMessage, HostMessage>;

export interface Session {
  role: 'host' | 'guest';
  /** Answer the opponent's undo request. */
  respondUndo(ok: boolean): void;
  /** Leave the online Duel and return to the menu. */
  leave(): void;
  /** Guest: ask the host for strategy suggestions; host: computed locally. */
  requestSuggestions(): void;
  /** Re-attach after a dropped connection. */
  attach(t: AnyTransport): void;
}

let current: Session | null = null;
export function currentSession(): Session | null {
  return current;
}

const HOST_SEAT: PlayerId = 0;
const GUEST_SEAT: PlayerId = 1;

export interface HostSave {
  code: string;
  me: PlayerInfo;
  guest: PlayerInfo | null;
  duel: SavedDuel;
  savedAt: number;
}

const SAVE_KEY = 'ygo-trainer-online-host';
export function loadHostSave(): HostSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as HostSave) : null;
  } catch {
    return null;
  }
}
function writeHostSave(save: HostSave | null): void {
  try {
    if (save) localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export class HostSession implements Session {
  role = 'host' as const;
  private conn: HostTransport | null = null;
  private guest: PlayerInfo | null = null;
  private playing = false;
  private unsubscribe: (() => void) | null = null;
  private lastSent: { history: unknown; pending: unknown } = { history: null, pending: null };

  constructor(
    public readonly code: string,
    private me: PlayerInfo,
    private first: PlayerId | 'coin',
  ) {
    current = this;
    setOnline({ role: 'host', seat: HOST_SEAT, code, status: 'waiting', opponent: null, remote: null, undoRequest: null, suggestions: null });
    setInterceptor({
      dispatch: (a) => this.localIntent(() => localDispatch(a)),
      answer: (a) => this.localIntent(() => localAnswer(a)),
      cancelPending: () => this.localIntent(() => localCancelPending()),
      undo: () => this.requestUndo(),
    });
    this.unsubscribe = subscribe(() => this.afterChange());
  }

  /** Resume a saved Duel (after the host reloaded the page). The guest re-joins with the same code. */
  resume(save: HostSave): void {
    this.me = save.me;
    this.guest = save.guest;
    restoreDuel(save.duel);
    this.playing = true;
    updateOnline({ status: 'disconnected', opponent: save.guest, error: 'Waiting for your opponent to re-join with the same code…' });
  }

  setMe(me: PlayerInfo): void {
    this.me = me;
    this.sendLobby();
  }

  setFirst(first: PlayerId | 'coin'): void {
    this.first = first;
    this.sendLobby();
  }

  attach(t: AnyTransport): void {
    const conn = t as HostTransport;
    if (this.conn) this.conn.close();
    this.conn = conn;
    conn.onMessage((m) => this.handle(m));
    conn.onClose(() => {
      if (this.conn !== conn) return;
      this.conn = null;
      updateOnline({ status: 'disconnected', error: 'Your opponent disconnected. They can re-join with the same code.', undoRequest: null });
    });
  }

  private send(m: HostMessage): void {
    this.conn?.send(m);
  }

  private sendLobby(): void {
    if (!this.playing) this.send({ t: 'lobby', host: this.me, guest: this.guest, first: this.first });
  }

  private handle(m: GuestMessage): void {
    switch (m.t) {
      case 'hello': {
        if (m.protocol !== PROTOCOL_VERSION) {
          this.send({ t: 'rejected', reason: 'Your opponent is running a different version of the game. Both players should reload the page.' });
          return;
        }
        if (this.playing) {
          // Reconnection (or a page reload) mid-Duel: send everything again.
          this.guest = this.guest ?? m.player;
          updateOnline({ status: 'playing', opponent: this.guest, error: undefined });
          this.send({ t: 'start', seat: GUEST_SEAT, players: [this.me, this.guest] });
          this.lastSent = { history: null, pending: null };
          this.afterChange();
          return;
        }
        this.guest = m.player;
        updateOnline({ status: 'lobby', opponent: m.player });
        this.sendLobby();
        return;
      }
      case 'action':
        if (!this.playing) return;
        if (!('player' in m.action) || m.action.player !== GUEST_SEAT) {
          this.send({ t: 'notice', title: 'Not your action', text: 'Only the host can do that.', kind: 'error' });
          return;
        }
        this.remoteIntent(() => localDispatch(m.action));
        return;
      case 'answer': {
        if (!this.playing) return;
        const p = getStore().pending;
        if (!p || p.prompt.player !== GUEST_SEAT) {
          this.send({ t: 'notice', title: 'Not your decision', text: 'That question is not for you (it may already be answered).', kind: 'info' });
          return;
        }
        this.remoteIntent(() => localAnswer(m.answer));
        return;
      }
      case 'cancel': {
        const p = getStore().pending;
        if (p && p.prompt.player === GUEST_SEAT) localCancelPending();
        return;
      }
      case 'undoRequest':
        if (!this.playing) return;
        updateOnline({ undoRequest: 'incoming' });
        return;
      case 'undoReply':
        if (getStore().online?.undoRequest !== 'outgoing') return;
        updateOnline({ undoRequest: null });
        if (m.ok) localUndo();
        else setNotice({ title: 'Undo declined', text: `${this.guest?.name ?? 'Your opponent'} did not allow the undo.`, kind: 'info' });
        return;
      case 'suggest': {
        const s = getStore();
        const view = s.pending?.view ?? s.history[s.history.length - 1]?.state;
        if (!view) return;
        const prompt = s.pending?.prompt ?? null;
        this.send({ t: 'suggestions', suggestions: suggestMoves(view, GUEST_SEAT, prompt && prompt.player === GUEST_SEAT ? prompt : null) });
        return;
      }
      case 'leave':
        this.conn?.close();
        this.conn = null;
        updateOnline({ status: 'disconnected', error: `${this.guest?.name ?? 'Your opponent'} left the Duel.`, undoRequest: null });
        return;
    }
  }

  /** Run an engine call on behalf of the local (host) player. */
  private localIntent(fn: () => void): void {
    fn();
  }

  /** Run an engine call on behalf of the guest; any rules explanation goes back to them, not on our screen. */
  private remoteIntent(fn: () => void): void {
    const before = getStore().notice;
    fn();
    const after = getStore().notice;
    if (after && after !== before) {
      this.send({ t: 'notice', title: after.title, text: after.text, kind: after.kind });
      setNotice(before);
    }
  }

  private requestUndo(): void {
    if (!this.playing) return;
    if (!this.conn) {
      setNotice({ title: 'Opponent not connected', text: 'Undo needs your opponent to agree; wait until they are back online.', kind: 'info' });
      return;
    }
    if (getStore().online?.undoRequest) return;
    updateOnline({ undoRequest: 'outgoing' });
    this.send({ t: 'undoRequest' });
  }

  respondUndo(ok: boolean): void {
    if (getStore().online?.undoRequest !== 'incoming') return;
    updateOnline({ undoRequest: null });
    if (ok) localUndo();
    this.send({ t: 'undoReply', ok });
  }

  requestSuggestions(): void {
    /* the host computes suggestions locally */
  }

  /** Start the Duel: host is Player 1 (seat 0), guest is Player 2 (seat 1). */
  start(): void {
    if (!this.guest || this.playing) return;
    const first: PlayerId = this.first === 'coin' ? ((Math.random() < 0.5 ? 0 : 1) as PlayerId) : this.first;
    this.playing = true;
    newGame({ players: [{ name: this.me.name || 'Player 1', deckId: this.me.deckId }, { name: this.guest.name || 'Player 2', deckId: this.guest.deckId }], firstPlayer: first });
    updateOnline({ status: 'playing' });
    this.send({ t: 'start', seat: GUEST_SEAT, players: [this.me, this.guest] });
    this.lastSent = { history: null, pending: null };
    this.afterChange();
  }

  private afterChange(): void {
    if (!this.playing) return;
    const s = getStore();
    if (s.history.length === 0) return;
    if (s.history === this.lastSent.history && s.pending === this.lastSent.pending) return;
    this.lastSent = { history: s.history, pending: s.pending };
    const view = buildPlayerView(s, GUEST_SEAT);
    if (view) this.send({ t: 'view', view });
    const duel = saveDuel(s);
    if (duel) writeHostSave({ code: this.code, me: this.me, guest: this.guest, duel, savedAt: Date.now() });
  }

  /** Testing/inspection: the view the guest currently sees. */
  guestView(): PlayerView | null {
    return buildPlayerView(getStore(), GUEST_SEAT);
  }

  leave(): void {
    this.send({ t: 'ended' });
    this.conn?.close();
    this.conn = null;
    this.unsubscribe?.();
    setInterceptor(null);
    writeHostSave(null);
    current = null;
    clearGame();
    setOnline(null);
  }
}

// ---------------------------------------------------------------------------
// Guest
// ---------------------------------------------------------------------------

export class GuestSession implements Session {
  role = 'guest' as const;
  private conn: GuestTransport | null = null;

  constructor(
    public readonly code: string,
    private me: PlayerInfo,
  ) {
    current = this;
    setOnline({ role: 'guest', seat: GUEST_SEAT, code, status: 'connecting', opponent: null, remote: null, undoRequest: null, suggestions: null });
    setInterceptor({
      dispatch: (a) => this.send({ t: 'action', action: a }),
      answer: (a) => this.send({ t: 'answer', answer: a }),
      cancelPending: () => this.send({ t: 'cancel' }),
      undo: () => this.requestUndo(),
    });
  }

  setMe(me: PlayerInfo): void {
    this.me = me;
    this.send({ t: 'hello', player: me, protocol: PROTOCOL_VERSION });
  }

  attach(t: AnyTransport): void {
    const conn = t as GuestTransport;
    this.conn = conn;
    conn.onMessage((m) => this.handle(m));
    conn.onClose(() => {
      if (this.conn !== conn) return;
      this.conn = null;
      updateOnline({ status: 'disconnected', error: 'Connection to the host was lost.', undoRequest: null });
    });
    updateOnline({ status: getStore().online?.remote ? 'playing' : 'connecting', error: undefined });
    this.send({ t: 'hello', player: this.me, protocol: PROTOCOL_VERSION });
  }

  private send(m: GuestMessage): void {
    if (!this.conn) {
      setNotice({ title: 'Not connected', text: 'Waiting for the connection to the host…', kind: 'info' });
      return;
    }
    this.conn.send(m);
  }

  private handle(m: HostMessage): void {
    switch (m.t) {
      case 'lobby':
        updateOnline({ status: 'lobby', opponent: m.host });
        return;
      case 'start':
        updateOnline({ status: 'playing', seat: m.seat, opponent: m.players[m.seat === 0 ? 1 : 0], undoRequest: null, error: undefined });
        return;
      case 'view':
        updateOnline({ remote: m.view, status: 'playing', suggestions: null });
        return;
      case 'notice':
        setNotice({ title: m.title, text: m.text, kind: m.kind });
        return;
      case 'undoRequest':
        updateOnline({ undoRequest: 'incoming' });
        return;
      case 'undoReply':
        if (getStore().online?.undoRequest !== 'outgoing') return;
        updateOnline({ undoRequest: null });
        if (!m.ok) setNotice({ title: 'Undo declined', text: `${getStore().online?.opponent?.name ?? 'Your opponent'} did not allow the undo.`, kind: 'info' });
        return;
      case 'suggestions':
        updateOnline({ suggestions: m.suggestions });
        return;
      case 'rejected':
        updateOnline({ status: 'error', error: m.reason });
        return;
      case 'ended':
        updateOnline({ status: 'disconnected', error: 'The host ended the Duel.', undoRequest: null });
        return;
    }
  }

  private requestUndo(): void {
    if (getStore().online?.undoRequest) return;
    updateOnline({ undoRequest: 'outgoing' });
    this.send({ t: 'undoRequest' });
  }

  respondUndo(ok: boolean): void {
    if (getStore().online?.undoRequest !== 'incoming') return;
    updateOnline({ undoRequest: null });
    this.send({ t: 'undoReply', ok });
  }

  requestSuggestions(): void {
    this.send({ t: 'suggest' });
  }

  leave(): void {
    if (this.conn) this.conn.send({ t: 'leave' });
    this.conn?.close();
    this.conn = null;
    setInterceptor(null);
    current = null;
    clearGame();
    setOnline(null);
  }
}
