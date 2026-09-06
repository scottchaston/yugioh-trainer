/**
 * Messages exchanged between the host (who runs the rules engine) and the guest (a thin client).
 * Everything is plain JSON so it can travel over any transport (WebRTC data channel, WebSocket, ...).
 */
import type { Action, Answer, PlayerId } from '../engine';
import type { PlayerView } from '../state/store';
import type { Suggestion } from '../strategy/suggest';

export interface PlayerInfo {
  name: string;
  deckId: string;
}

export type GuestMessage =
  | { t: 'hello'; player: PlayerInfo; protocol: number }
  | { t: 'action'; action: Action }
  | { t: 'answer'; answer: Answer }
  | { t: 'cancel' }
  | { t: 'undoRequest' }
  | { t: 'undoReply'; ok: boolean }
  | { t: 'suggest' }
  | { t: 'leave' };

export type HostMessage =
  | { t: 'lobby'; host: PlayerInfo; guest: PlayerInfo | null; first: PlayerId | 'coin' }
  | { t: 'start'; seat: PlayerId; players: [PlayerInfo, PlayerInfo] }
  | { t: 'view'; view: PlayerView }
  | { t: 'notice'; title: string; text: string; kind: 'error' | 'info' }
  | { t: 'undoRequest' }
  | { t: 'undoReply'; ok: boolean }
  | { t: 'suggestions'; suggestions: Suggestion[] }
  | { t: 'rejected'; reason: string }
  | { t: 'ended' };

export const PROTOCOL_VERSION = 1;
