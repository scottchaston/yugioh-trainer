/**
 * WebRTC transport via PeerJS. Browsers talk to each other directly; PeerJS's free public server
 * is only used to introduce them (signalling). No game data goes through any server of ours.
 *
 * For local testing a PeerServer can be pointed at with ?peerhost=localhost&peerport=9000.
 */
import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import type { Transport } from './transport';

const ID_PREFIX = 'ygo-practice-table-';

const WORDS = ['DRAGON', 'TIGER', 'EAGLE', 'TORTOISE', 'PEGASUS', 'MAMMOTH', 'RUBY', 'SAPPHIRE', 'TOPAZ', 'AMBER', 'COBALT', 'EMERALD', 'AMETHYST', 'RAINBOW', 'CRYSTAL', 'AZURE', 'SILVER', 'MAIDEN', 'STORM', 'KNIGHT', 'PRISM', 'BEACON', 'SHRINE', 'BRIDGE'];

export function newRoomCode(): string {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w}-${n}`;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '-');
}

export function peerIdFor(code: string): string {
  return ID_PREFIX + normalizeCode(code).toLowerCase().replace(/[^a-z0-9-]/g, '');
}

export function peerOptions(): PeerOptions {
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    // Free relay for the rare networks where a direct connection is impossible.
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  ];
  const q = new URLSearchParams(window.location.search);
  const host = q.get('peerhost');
  if (host) {
    return { host, port: Number(q.get('peerport') ?? 9000), path: '/', secure: q.get('peersecure') === '1', config: { iceServers }, debug: 0 };
  }
  return { config: { iceServers }, debug: 0 };
}

function wrap<Out, In>(conn: DataConnection): Transport<Out, In> {
  let onMsg: ((m: In) => void) | null = null;
  let onClose: (() => void) | null = null;
  let closed = false;
  conn.on('data', (d) => onMsg?.(d as In));
  const fireClose = () => {
    if (closed) return;
    closed = true;
    onClose?.();
  };
  conn.on('close', fireClose);
  conn.on('error', (e) => console.error('[online] connection error', e));
  return {
    send: (m) => {
      if (!closed && conn.open) conn.send(m);
    },
    onMessage: (cb) => {
      onMsg = cb;
    },
    onClose: (cb) => {
      onClose = cb;
    },
    close: () => {
      if (closed) return;
      closed = true;
      conn.close();
    },
  };
}

export interface HostPeer {
  code: string;
  close(): void;
}

export function describePeerError(e: unknown): string {
  const type = (e as { type?: string })?.type;
  switch (type) {
    case 'peer-unavailable':
      return 'No Duel is waiting with that code. Check the code with your opponent (the host must keep their page open).';
    case 'unavailable-id':
      return 'That code is already in use. Try hosting again to get a new code.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Could not reach the connection service. Check your internet connection and try again.';
    case 'browser-incompatible':
      return 'This browser does not support the technology (WebRTC) needed for online play. Try Chrome, Edge, Firefox or Safari.';
    default:
      return `Connection problem: ${(e as Error)?.message ?? String(e)}`;
  }
}

/** Open a room: resolves once the code is registered; every guest connection is handed to onConnection. */
export function openRoom<Out, In>(code: string, onConnection: (t: Transport<Out, In>) => void): Promise<HostPeer> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerIdFor(code), peerOptions());
    let ready = false;
    peer.on('open', () => {
      ready = true;
      resolve({ code, close: () => peer.destroy() });
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => onConnection(wrap<Out, In>(conn)));
    });
    peer.on('error', (e) => {
      if (!ready) {
        peer.destroy();
        reject(e);
      }
    });
    peer.on('disconnected', () => {
      // Lost the signalling server (not the opponent): reconnect so new guests can still find us.
      if (!peer.destroyed) peer.reconnect();
    });
  });
}

/** Connect to a host's room. Resolves with the open data channel. */
export function joinRoom<Out, In>(code: string): Promise<{ transport: Transport<Out, In>; close: () => void }> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerOptions());
    let done = false;
    peer.on('open', () => {
      // 'binary' (the default) splits large messages into chunks; 'json' refuses anything over 16 KB.
      const conn = peer.connect(peerIdFor(code), { reliable: true, serialization: 'binary' });
      conn.on('open', () => {
        done = true;
        resolve({ transport: wrap<Out, In>(conn), close: () => peer.destroy() });
      });
      conn.on('error', (e) => {
        if (!done) reject(e);
      });
    });
    peer.on('error', (e) => {
      if (!done) {
        peer.destroy();
        reject(e);
      }
    });
    setTimeout(() => {
      if (!done) {
        peer.destroy();
        reject(new Error('Timed out while connecting. Check the code and that the host still has the page open.'));
      }
    }, 25000);
  });
}
