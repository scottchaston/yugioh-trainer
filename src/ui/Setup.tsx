import { useState } from 'react';
import { DECKS } from '../cards/decks';
import type { PlayerId } from '../engine';
import { DIFFICULTIES, type Difficulty } from '../ai';
import { useHostSave, type LobbyMode } from './Online';

interface Props {
  onStart: (cfg: { names: [string, string]; decks: [string, string]; first: PlayerId; seed?: number; ai?: Difficulty }) => void;
  onOnline: (mode: LobbyMode) => void;
}

export function Setup({ onStart, onOnline }: Props) {
  const hostSave = useHostSave();
  const [joinCode, setJoinCode] = useState('');
  const [names, setNames] = useState<[string, string]>(['Player 1', 'Player 2']);
  const [decks, setDecks] = useState<[string, string]>([DECKS[0].id, DECKS[1].id]);
  const [first, setFirst] = useState<PlayerId | 'coin'>('coin');
  const [opponent, setOpponent] = useState<'human' | Difficulty>('human');
  const [coinResult, setCoinResult] = useState<PlayerId | null>(null);

  const flip = () => {
    const r = (Math.random() < 0.5 ? 0 : 1) as PlayerId;
    setCoinResult(r);
  };

  const start = () => {
    const f: PlayerId = first === 'coin' ? (coinResult ?? ((Math.random() < 0.5 ? 0 : 1) as PlayerId)) : first;
    const seedParam = new URLSearchParams(window.location.search).get('seed');
    onStart({ names, decks, first: f, seed: seedParam ? Number(seedParam) : undefined, ai: opponent === 'human' ? undefined : opponent });
  };

  return (
    <div className="setup">
      <div className="setup-card">
        <h1>Yu-Gi-Oh! Practice Table</h1>
        <p className="muted">A rules-enforcing duel table with training wheels. Two players share this screen.</p>
        <div className="setup-grid">
          {([0, 1] as PlayerId[]).map((p) => (
            <div key={p} className="setup-player">
              <h3>{p === 1 && opponent !== 'human' ? 'Computer opponent' : `Player ${p + 1}`}</h3>
              {p === 1 && (
                <label>
                  Opponent
                  <select value={opponent} onChange={(e) => setOpponent(e.target.value as 'human' | Difficulty)} data-testid="opponent">
                    <option value="human">Another person (shares this screen)</option>
                    {DIFFICULTIES.map((d) => (
                      <option key={d.id} value={d.id}>
                        Computer – {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {p === 1 && opponent !== 'human' && <p className="muted small">{DIFFICULTIES.find((d) => d.id === opponent)?.description}</p>}
              {(p === 0 || opponent === 'human') && (
                <label>
                  Name
                  <input value={names[p]} onChange={(e) => setNames(p === 0 ? [e.target.value, names[1]] : [names[0], e.target.value])} />
                </label>
              )}
              <label>
                {p === 1 && opponent !== 'human' ? "Computer's deck" : 'Deck'}
                <select value={decks[p]} onChange={(e) => setDecks(p === 0 ? [e.target.value, decks[1]] : [decks[0], e.target.value])}>
                  {DECKS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small">{DECKS.find((d) => d.id === decks[p])?.description}</p>
            </div>
          ))}
        </div>
        <div className="setup-first">
          <h3>Who goes first?</h3>
          <p className="muted small">In the real game, players flip a coin or play rock-paper-scissors; the winner chooses whether to go first or second. The player who goes first does not draw on their first turn and cannot attack on that turn.</p>
          <div className="setup-first-options">
            <label>
              <input type="radio" checked={first === 'coin'} onChange={() => setFirst('coin')} /> Coin flip
            </label>
            <label>
              <input type="radio" checked={first === 0} onChange={() => setFirst(0)} /> {names[0]} first
            </label>
            <label>
              <input type="radio" checked={first === 1} onChange={() => setFirst(1)} /> {names[1]} first
            </label>
          </div>
          {first === 'coin' && (
            <div className="coin">
              <button className="btn" onClick={flip}>
                Flip coin
              </button>
              {coinResult !== null && <span className="coin-result">{names[coinResult]} goes first!</span>}
            </div>
          )}
        </div>
        <button className="btn btn-primary btn-big" onClick={start}>
          Start Duel
        </button>
        <div className="online-box">
          <h3>Play online with a friend</h3>
          <p className="muted small">One of you hosts and gets a room code; the other joins with it. Each player sees only their own hand and choices, and waits while the other decides.</p>
          <div className="online-actions">
            <button className="btn btn-primary" onClick={() => onOnline({ mode: 'host' })}>
              Host a duel
            </button>
            <span className="muted">or</span>
            <input value={joinCode} placeholder="Room code" onChange={(e) => setJoinCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && onOnline({ mode: 'join', code: joinCode })} />
            <button className="btn" onClick={() => onOnline({ mode: 'join', code: joinCode })}>
              Join a duel
            </button>
          </div>
          {hostSave && (
            <p className="small">
              You hosted a Duel earlier (code <b>{hostSave.code}</b>, {new Date(hostSave.savedAt).toLocaleString()}).{' '}
              <button className="btn btn-link" onClick={() => onOnline({ mode: 'resume', save: hostSave })}>
                Resume it
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
