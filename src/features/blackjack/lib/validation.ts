// ========================
// Host-side validation for untrusted peer message payloads
// ========================
// Every peer→host message payload is attacker-controlled. These helpers are
// pure so they can be unit-tested without React.

import { INITIAL_BALANCE } from './wallet.ts';
import type { GameState, RoomSettings } from './blackjack.ts';

export const MAX_PLAYER_NAME_LENGTH = 20;
export const MAX_JOIN_BALANCE = 1_000_000;
export const MAX_TABLE_SEATS = 5;
export const MAX_ROOM_CONNECTIONS = 16;
export const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
export const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export const VALID_PLAYER_ACTIONS = [
  'hit',
  'stand',
  'double',
  'split',
  'surrender',
  'insure',
  'decline-insurance',
] as const;
export type ValidPlayerAction = (typeof VALID_PLAYER_ACTIONS)[number];

const VALID_PHASES = ['betting', 'playing', 'dealer-turn', 'results'] as const;

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function isValidPlayerAction(action: unknown): action is ValidPlayerAction {
  return typeof action === 'string' && (VALID_PLAYER_ACTIONS as readonly string[]).includes(action);
}

/** A bet must be a positive safe integer within the player's balance.
 *  Plain comparisons are not enough: NaN passes both `bet <= 0` and
 *  `bet > balance` checks and would poison every downstream balance. */
export function isValidBet(bet: unknown, balance: number): bet is number {
  return typeof bet === 'number' && Number.isSafeInteger(bet) && bet > 0 && bet <= balance;
}

/** Trimmed, length-capped display name without control or invisible characters,
 *  or null when unusable. */
export function sanitizePlayerName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  // Strip control characters, zero-width spaces, and BiDi override characters
  const clean = name.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
  const trimmed = clean.trim().slice(0, MAX_PLAYER_NAME_LENGTH).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Sanitize optional persistent client session identifier used to prevent
 *  balance-reset exploits across WebRTC reconnects. */
export function sanitizeClientId(clientId: unknown): string | null {
  if (typeof clientId !== 'string') return null;
  const trimmed = clientId.trim();
  return CLIENT_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/** Joining balance is client-declared by design (local wallet model), but it
 *  must at least be a finite non-negative integer within a sane cap. */
export function sanitizeJoinBalance(balance: unknown): number {
  if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0) {
    return INITIAL_BALANCE;
  }
  return Math.min(Math.floor(balance), MAX_JOIN_BALANCE);
}

/** Validate and normalize RoomSettings payloads sent over P2P. */
export function sanitizeRoomSettings(val: unknown): RoomSettings | null {
  if (!isRecord(val)) return null;
  if (
    typeof val.insuranceEnabled !== 'boolean' ||
    typeof val.surrenderEnabled !== 'boolean'
  ) {
    return null;
  }
  return {
    insuranceEnabled: val.insuranceEnabled,
    surrenderEnabled: val.surrenderEnabled,
    splitEnabled: typeof val.splitEnabled === 'boolean' ? val.splitEnabled : true,
  };
}

/** Structural validation for host -> peer `game-state-sync` payloads. */
export function isValidGameStateSync(val: unknown): val is GameState {
  if (!isRecord(val)) return false;
  if (typeof val.phase !== 'string' || !(VALID_PHASES as readonly string[]).includes(val.phase)) return false;
  if (typeof val.phaseStartedAt !== 'number' || !Number.isFinite(val.phaseStartedAt)) return false;
  if (typeof val.turnStartedAt !== 'number' || !Number.isFinite(val.turnStartedAt)) return false;
  if (typeof val.roundNumber !== 'number' || !Number.isFinite(val.roundNumber)) return false;
  if (typeof val.tableOpen !== 'boolean') return false;
  if (typeof val.hostId !== 'string' || typeof val.hostName !== 'string') return false;
  if (!isRecord(val.dealer) || !Array.isArray(val.dealer.cards)) return false;
  if (!isRecord(val.players)) return false;
  for (const player of Object.values(val.players)) {
    if (!isRecord(player)) return false;
    if (typeof player.balance !== 'number' || !Number.isFinite(player.balance)) return false;
    if (!Array.isArray(player.hands)) return false;
  }
  if (!isRecord(val.settings)) return false;
  return true;
}
