/**
 * Online play screens: host a room, join with a code, resume, and the in-duel connection overlay.
 * The rules still run in exactly one place (the host's browser); see src/net.
 */
import { useEffect, useRef, useState } from 'react';
import { DECKS } from '../cards/decks';
import type { PlayerId } from '../engine';
import { GuestSession, HostSession, currentSession, loadHostSave, type HostSave } from '../net/session';
import { describePeerError, joinRoom, newRoomCode, normalizeCode, openRoom } from '../net/peer';
import { useStore, updateOnline } from '../state/store';

export type LobbyMode = { mode: 'host' } | { mode: 'join'; code?: string } | { mode: 'resume'; save: HostSave };

let peerCleanup: (() => void) | null = null;

/** Close the connection and forget the online session (both roles). */
export function leaveOnline(): void {
  currentSession()?.leave();
  peerCleanup?.();
  peerCleanup = null;
}

/** Guest: try to reach the host again after a dropped connection. */
export async function reconnectGuest(): Promise<void> {
  const s = currentSession();
  if (!s || s.role !== 'guest') return;
  updateOnline({ status: 'connecting', error: undefined });
  try {
    peerCleanup?.();
    const { transport, close } = await joinRoom((s as GuestSession).code);
    peerCleanup = close;
    s.attach(transport);
  } catch (e) {
    updateOnline({ status: 'disconnected', error: describePeerError(e) });
  }
}

export function joinLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('join', code);
  return url.toString();
}

function PlayerForm({ name, deckId, onChange, disabled }: { name: string; deckId: string; onChange: (p: { name: string; deckId: string }) => void; disabled?: boolean }) {
  return (
    <div className="setup-player">
      <label>
        Your name
        <input value={name} disabled={disabled} onChange={(e) => onChange({ name: e.target.value, deckId })} />
      </label>
      <label>
        Your deck
        <select value={deckId} disabled={disabled} onChange={(e) => onChange({ name, deckId: e.target.value })}>
          {DECKS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">{DECKS.find((d) => d.id === deckId)?.description}</p>
    </div>
  );
}

export function OnlineLobby({ lobby, onBack }: { lobby: LobbyMode; onBack: () => void }) {
  const store = useStore();
  const online = store.online;
  const [me, setMe] = useState({ name: lobby.mode === 'resume' ? lobby.save.me.name : lobby.mode === 'host' ? 'Player 1' : 'Player 2', deckId: lobby.mode === 'resume' ? lobby.save.me.deckId : DECKS[0].id });
  const [first, setFirst] = useState<PlayerId | 'coin'>('coin');
  const [code, setCode] = useState(lobby.mode === 'join' ? normalizeCode(lobby.code ?? '') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  // Host: open the room as soon as the screen appears.
  useEffect(() => {
    if (lobby.mode === 'join' || started.current) return;
    started.current = true;
    const roomCode = lobby.mode === 'resume' ? lobby.save.code : newRoomCode();
    const session = new HostSession(roomCode, me, first);
    if (lobby.mode === 'resume') session.resume(lobby.save);
    setBusy(true);
    openRoom(roomCode, (t) => session.attach(t))
      .then((peer) => {
        peerCleanup = () => peer.close();
        setBusy(false);
      })
      .catch((e) => {
        setBusy(false);
        setError(describePeerError(e));
        updateOnline({ status: 'error', error: describePeerError(e) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const session = currentSession();
  const host = session?.role === 'host' ? (session as HostSession) : null;

  const changeMe = (p: { name: string; deckId: string }) => {
    setMe(p);
    if (host) host.setMe(p);
    else if (session?.role === 'guest') (session as GuestSession).setMe(p);
  };
  const changeFirst = (f: PlayerId | 'coin') => {
    setFirst(f);
    host?.setFirst(f);
  };

  const join = async () => {
    const c = normalizeCode(code);
    if (!c) {
      setError('Enter the code your opponent gave you.');
      return;
    }
    setError(null);
    setBusy(true);
    const guest = new GuestSession(c, me);
    try {
      const { transport, close } = await joinRoom(c);
      peerCleanup = close;
      guest.attach(transport);
    } catch (e) {
      setError(describePeerError(e));
      leaveOnline();
    }
    setBusy(false);
  };

  const back = () => {
    leaveOnline();
    onBack();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinLink(online?.code ?? ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is shown as text anyway */
    }
  };

  const status = online?.status;
  const opponent = online?.opponent;

  return (
    <div className="setup">
      <div className="setup-card">
        <h1>Yu-Gi-Oh! Practice Table — online</h1>
        {lobby.mode !== 'join' ? (
          <>
            <p className="muted">You are the host: the rules engine runs on your screen and your opponent connects directly to you. Keep this page open during the Duel.</p>
            {online?.code && (
              <div className="room-box">
                <div className="room-code-label">Your room code</div>
                <div className="room-code">{online.code}</div>
                <div className="room-link">
                  <input readOnly value={joinLink(online.code)} onFocus={(e) => e.target.select()} />
                  <button className="btn" onClick={copy}>
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
                <p className="muted small">Send the code or the link to your opponent. They open the link (or press "Join a duel" and type the code).</p>
              </div>
            )}
            <div className="setup-grid">
              <PlayerForm name={me.name} deckId={me.deckId} onChange={changeMe} disabled={lobby.mode === 'resume'} />
              <div className="setup-player">
                <h3>Opponent</h3>
                {opponent ? (
                  <p>
                    <b>{opponent.name}</b> — {DECKS.find((d) => d.id === opponent.deckId)?.name ?? opponent.deckId}
                    <br />
                    <span className="muted small">{status === 'lobby' ? 'Connected and ready.' : status === 'playing' ? 'Connected.' : online?.error ?? 'Not connected.'}</span>
                  </p>
                ) : (
                  <p className="muted">{busy ? 'Opening the room…' : error ? '' : 'Waiting for your opponent to join…'}</p>
                )}
              </div>
            </div>
            {lobby.mode === 'host' && (
              <div className="setup-first">
                <h3>Who goes first?</h3>
                <div className="setup-first-options">
                  <label>
                    <input type="radio" checked={first === 'coin'} onChange={() => changeFirst('coin')} /> Coin flip
                  </label>
                  <label>
                    <input type="radio" checked={first === 0} onChange={() => changeFirst(0)} /> Host ({me.name || 'Player 1'}) first
                  </label>
                  <label>
                    <input type="radio" checked={first === 1} onChange={() => changeFirst(1)} /> Guest first
                  </label>
                </div>
              </div>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className="prompt-buttons">
              <button className="btn" onClick={back}>
                Back
              </button>
              {lobby.mode === 'host' && (
                <button className="btn btn-primary btn-big" disabled={status !== 'lobby'} onClick={() => host?.start()}>
                  Start Duel
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="muted">Join a friend's Duel. Ask them for their room code (or open the link they sent you).</p>
            <div className="setup-grid">
              <PlayerForm name={me.name} deckId={me.deckId} onChange={changeMe} disabled={status === 'lobby' || status === 'playing'} />
              <div className="setup-player">
                <label>
                  Room code
                  <input value={code} placeholder="e.g. DRAGON-4821" disabled={!!online} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && join()} />
                </label>
                {status === 'connecting' && <p className="muted">Connecting…</p>}
                {status === 'lobby' && (
                  <p>
                    Connected to <b>{opponent?.name}</b>. Waiting for them to start the Duel…
                  </p>
                )}
                {status === 'error' && <p className="error-text">{online?.error}</p>}
                {status === 'disconnected' && <p className="error-text">{online?.error}</p>}
              </div>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="prompt-buttons">
              <button className="btn" onClick={back}>
                Back
              </button>
              {!online && (
                <button className="btn btn-primary btn-big" disabled={busy} onClick={join}>
                  {busy ? 'Connecting…' : 'Join'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Shown over the board when the connection is down or the session was rejected. */
export function ConnectionOverlay({ onLeave }: { onLeave: () => void }) {
  const store = useStore();
  const o = store.online;
  if (!o || o.status === 'playing' || o.status === 'lobby' || o.status === 'waiting') return null;
  return (
    <div className="modal-backdrop">
      <div className="modal winner">
        <h2>{o.status === 'connecting' ? 'Reconnecting…' : 'Connection lost'}</h2>
        <p>{o.error ?? ''}</p>
        {o.role === 'host' && <p className="muted small">The Duel is saved on this screen. Your opponent can re-join with the code {o.code}; nothing is lost.</p>}
        <div className="prompt-buttons">
          {o.role === 'guest' && o.status !== 'connecting' && (
            <button className="btn btn-primary" onClick={() => reconnectGuest()}>
              Reconnect
            </button>
          )}
          <button className="btn" onClick={onLeave}>
            Leave the Duel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Undo needs both players to agree in an online Duel. */
export function UndoRequestModal() {
  const store = useStore();
  const o = store.online;
  if (!o?.undoRequest) return null;
  const name = o.opponent?.name ?? 'Your opponent';
  if (o.undoRequest === 'outgoing') {
    return <div className="undo-wait">Waiting for {name} to allow the undo…</div>;
  }
  return (
    <div className="modal-backdrop">
      <div className="modal winner">
        <h2>{name} asks to undo the last step</h2>
        <p className="muted">Practice tables usually allow take-backs. Do you agree?</p>
        <div className="prompt-buttons">
          <button className="btn btn-primary" onClick={() => currentSession()?.respondUndo(true)}>
            Allow
          </button>
          <button className="btn" onClick={() => currentSession()?.respondUndo(false)}>
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

export function useHostSave(): HostSave | null {
  const [save] = useState(() => loadHostSave());
  return save;
}
