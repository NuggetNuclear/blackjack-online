'use client';

import { useEffect, useMemo, useState } from 'react';
import { BETTING_TIMEOUT_MS, GameState, NEXT_ROUND_TIMEOUT_MS, PLAYER_ACTION_TIMEOUT_MS } from '@/features/blackjack/lib/blackjack';

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function useRoundCountdown(gameState: GameState) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (gameState.phase !== 'betting' && gameState.phase !== 'results' && gameState.phase !== 'playing') {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => window.clearInterval(interval);
  }, [gameState.phase, gameState.phaseStartedAt, gameState.turnStartedAt]);

  return useMemo(() => {
    // Keep countdowns from rendering a stale pre-transition timestamp on the
    // first render after host state changes while still preserving elapsed time
    // already accrued on clients that receive the update slightly later.
    const phaseNow = Math.max(now, gameState.phaseStartedAt);
    const turnNow = Math.max(now, gameState.turnStartedAt);
    const elapsed = Math.max(0, phaseNow - gameState.phaseStartedAt);
    const bettingRemainingMs = gameState.phase === 'betting'
      ? Math.max(0, BETTING_TIMEOUT_MS - elapsed)
      : 0;
    const nextRoundRemainingMs = gameState.phase === 'results'
      ? Math.max(0, NEXT_ROUND_TIMEOUT_MS - elapsed)
      : 0;

    // BUG-FIX: Expose `bettingTimeExpired` so the UI can hard-disable betting
    // controls the moment time runs out, preventing last-millisecond bets that
    // race with the host's timeout handler.
    const bettingTimeExpired = gameState.phase === 'betting' && bettingRemainingMs <= 0;

    // NEW: Expose `bettingProgress` for the visual ring during betting phase,
    // matching the existing `nextRoundProgress` pattern.
    const bettingProgress = gameState.phase === 'betting'
      ? clamp(elapsed / BETTING_TIMEOUT_MS)
      : 0;

    const playerActionElapsed = gameState.phase === 'playing'
      ? Math.max(0, turnNow - gameState.turnStartedAt)
      : 0;
    const playerActionRemainingMs = gameState.phase === 'playing'
      ? Math.max(0, PLAYER_ACTION_TIMEOUT_MS - playerActionElapsed)
      : 0;

    return {
      bettingRemainingMs,
      bettingSecondsLeft: gameState.phase === 'betting' ? Math.ceil(bettingRemainingMs / 1000) : 0,
      bettingTimeExpired,
      bettingProgress,
      nextRoundRemainingMs,
      nextRoundSecondsLeft: gameState.phase === 'results' ? Math.ceil(nextRoundRemainingMs / 1000) : 0,
      nextRoundProgress: gameState.phase === 'results'
        ? clamp(elapsed / NEXT_ROUND_TIMEOUT_MS)
        : 0,
      playerActionSecondsLeft: gameState.phase === 'playing'
        ? Math.ceil(playerActionRemainingMs / 1000)
        : 0,
      playerActionProgress: gameState.phase === 'playing'
        ? clamp(playerActionElapsed / PLAYER_ACTION_TIMEOUT_MS)
        : 0,
    };
  }, [gameState.phase, gameState.phaseStartedAt, gameState.turnStartedAt, now]);
}
