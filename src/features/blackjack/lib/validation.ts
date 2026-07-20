// ========================
// Host-side validation for untrusted peer message payloads
// ========================
// Every peer→host message payload is attacker-controlled. These helpers are
// pure so they can be unit-tested without React.

import { INITIAL_BALANCE } from './wallet.ts';

export const MAX_PLAYER_NAME_LENGTH = 20;
export const MAX_JOIN_BALANCE = 1_000_000;
export const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;

/** A bet must be a positive safe integer within the player's balance.
 *  Plain comparisons are not enough: NaN passes both `bet <= 0` and
 *  `bet > balance` checks and would poison every downstream balance. */
export function isValidBet(bet: unknown, balance: number): bet is number {
  return typeof bet === 'number' && Number.isSafeInteger(bet) && bet > 0 && bet <= balance;
}

/** Trimmed, length-capped display name, or null when unusable. */
export function sanitizePlayerName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().slice(0, MAX_PLAYER_NAME_LENGTH).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Joining balance is client-declared by design (local wallet model), but it
 *  must at least be a finite non-negative integer within a sane cap. */
export function sanitizeJoinBalance(balance: unknown): number {
  if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0) {
    return INITIAL_BALANCE;
  }
  return Math.min(Math.floor(balance), MAX_JOIN_BALANCE);
}
