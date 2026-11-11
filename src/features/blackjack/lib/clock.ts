import { BETTING_TIMEOUT_MS, NEXT_ROUND_TIMEOUT_MS, PLAYER_ACTION_TIMEOUT_MS } from './blackjack.ts';
import type { GameState } from './blackjack.ts';

/** Upper bound on the host clock offset, including the return-trip delay.
 * Using this conservative bound never grants extra betting time due to latency. */
export function hostClockOffset(sentAt: number, hostRepliedAt: number, receivedAt: number): number | null {
  if (![sentAt, hostRepliedAt, receivedAt].every(Number.isFinite) || receivedAt < sentAt) return null;
  return hostRepliedAt - sentAt;
}

export function isBettingOpen(state: GameState, hostNow = Date.now()): boolean {
  return state.tableOpen && state.phase === 'betting' && hostNow < state.phaseStartedAt + BETTING_TIMEOUT_MS;
}

export function roundCountdown(state: GameState, localNow: number, clockOffsetMs: number | null) {
  const synchronized = state.tableOpen && clockOffsetMs !== null;
  const hostNow = localNow + (clockOffsetMs ?? 0);
  const phaseElapsed = Math.max(0, hostNow - state.phaseStartedAt);
  const turnElapsed = Math.max(0, hostNow - state.turnStartedAt);
  const remaining = (phase: GameState['phase'], duration: number, elapsed = phaseElapsed) =>
    synchronized && state.phase === phase ? Math.max(0, duration - elapsed) : 0;
  const progress = (phase: GameState['phase'], duration: number, elapsed = phaseElapsed) =>
    synchronized && state.phase === phase ? Math.min(1, elapsed / duration) : 0;
  const bettingRemainingMs = remaining('betting', BETTING_TIMEOUT_MS);
  const nextRoundRemainingMs = remaining('results', NEXT_ROUND_TIMEOUT_MS);
  return {
    bettingRemainingMs,
    bettingSecondsLeft: Math.ceil(bettingRemainingMs / 1000),
    bettingTimeExpired: !synchronized || (state.phase === 'betting' && bettingRemainingMs <= 0),
    bettingProgress: progress('betting', BETTING_TIMEOUT_MS),
    nextRoundRemainingMs,
    nextRoundSecondsLeft: Math.ceil(nextRoundRemainingMs / 1000),
    nextRoundProgress: progress('results', NEXT_ROUND_TIMEOUT_MS),
    playerActionSecondsLeft: Math.ceil(remaining('playing', PLAYER_ACTION_TIMEOUT_MS, turnElapsed) / 1000),
    playerActionProgress: progress('playing', PLAYER_ACTION_TIMEOUT_MS, turnElapsed),
  };
}
