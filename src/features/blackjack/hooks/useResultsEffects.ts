'use client';

import { useEffect, useRef, useState } from 'react';
import { GameState } from '@/features/blackjack/lib/blackjack';
import { sounds } from '@/features/blackjack/lib/sounds';
import { addRecord, getHistory, BetRecord } from '@/features/blackjack/lib/history';

interface UseResultsEffectsParams {
  gameState: GameState;
  myId: string;
  isSpectator: boolean;
}

export function useResultsEffects({
  gameState, myId, isSpectator,
}: UseResultsEffectsParams) {
  const [showMoneyRain, setShowMoneyRain] = useState(false);
  const [showLoseVignette, setShowLoseVignette] = useState(false);
  const [history, setHistory] = useState<BetRecord[]>([]);

  // Load history on mount
  useEffect(() => {
    getHistory().then(setHistory);
  }, []);

  // Effects on results (sounds, history, visual effects)
  const lastEffectRound = useRef(-1);
  useEffect(() => {
    if (gameState.phase !== 'results') return;
    if (lastEffectRound.current === gameState.roundNumber) return;
    lastEffectRound.current = gameState.roundNumber;
    const me = gameState.players[myId];
    if (!me || isSpectator) return;

    me.hands.forEach((hand, idx) => {
      setTimeout(() => {
        if (hand.result) {
          addRecord({
            round: gameState.roundNumber, bet: hand.bet, result: hand.result,
            payout: hand.payout ?? 0, balanceAfter: me.balance <= 0 ? 100 : me.balance, timestamp: Date.now(),
          }).then((hist) => { if (idx === me.hands.length - 1) setHistory(hist); });
        }

        if (hand.result === 'blackjack') {
          sounds.blackjack();
          if (idx === 0) setShowMoneyRain(true);
          setTimeout(() => setShowMoneyRain(false), 3500);
        } else if (hand.result === 'win') {
          sounds.win();
        } else if (hand.result === 'lose') {
          sounds.lose();
          if (idx === 0) setShowLoseVignette(true);
          setTimeout(() => setShowLoseVignette(false), 800);
        } else if (hand.result === 'push') {
          sounds.push();
        }
      }, idx * 600);
    });
  }, [gameState.phase, gameState.roundNumber, gameState.players, myId, isSpectator]);

  return { showMoneyRain, showLoseVignette, history };
}
