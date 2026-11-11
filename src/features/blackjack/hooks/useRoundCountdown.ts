'use client';

import { useEffect, useState } from 'react';
import type { GameState } from '@/features/blackjack/lib/blackjack';
import { roundCountdown } from '@/features/blackjack/lib/clock';

export function useRoundCountdown(gameState: GameState, clockOffsetMs: number | null = 0) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!gameState.tableOpen || clockOffsetMs === null) return;
    const update = () => setNow(Date.now());
    const frame = requestAnimationFrame(update);
    const interval = window.setInterval(update, 100);
    return () => { cancelAnimationFrame(frame); window.clearInterval(interval); };
  }, [gameState.tableOpen, gameState.phase, gameState.phaseStartedAt, gameState.turnStartedAt, clockOffsetMs]);
  return roundCountdown(gameState, Math.max(now, gameState.phaseStartedAt - (clockOffsetMs ?? 0)), clockOffsetMs);
}
