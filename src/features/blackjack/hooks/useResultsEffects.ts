'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameState, PlayerState } from '@/features/blackjack/lib/blackjack';
import { sounds } from '@/features/blackjack/lib/sounds';
import { addRecord, getHistory, type BetRecord } from '@/features/blackjack/lib/history';

interface UseResultsEffectsParams {
  gameState: GameState;
  myId: string;
  isSpectator: boolean;
  sessionKey: number;
}

export function useResultsEffects({ gameState, myId, isSpectator, sessionKey }: UseResultsEffectsParams) {
  const [effects, setEffects] = useState({ key: '', money: false, lose: false });
  const [history, setHistory] = useState<BetRecord[]>([]);
  const lastRecordedKey = useRef('');
  const playerRef = useRef<PlayerState | undefined>(undefined);
  const me = gameState.players[myId];
  const resultKey = gameState.phase === 'results' && me && !isSpectator
    ? `${sessionKey}:${gameState.roundNumber}:${myId}` : '';

  useEffect(() => { playerRef.current = gameState.players[myId]; }, [gameState.players, myId]);
  useEffect(() => {
    let active = true;
    void getHistory().then((records) => { if (active) setHistory(records); });
    return () => { active = false; };
  }, [sessionKey]);

  useEffect(() => {
    if (!resultKey) return;
    const player = playerRef.current;
    if (!player) return;
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Commit history immediately, independently of delayed visual effects.
    // StrictMode may run this effect twice; the session/round key prevents duplicates.
    if (lastRecordedKey.current !== resultKey) {
      lastRecordedKey.current = resultKey;
      const round = Number(resultKey.split(':')[1]);
      for (const hand of player.hands) {
        if (!hand.result) continue;
        void addRecord({ round, bet: hand.bet, result: hand.result, payout: hand.payout ?? 0,
          balanceAfter: player.balance <= 0 ? 100 : player.balance, timestamp: Date.now() })
          .then((records) => { if (active) setHistory(records); });
      }
    }
    void getHistory().then((records) => { if (active) setHistory(records); });
    player.hands.forEach((hand, index) => {
      timers.push(setTimeout(() => {
        if (!active) return;
        if (hand.result === 'blackjack') sounds.blackjack();
        else if (hand.result === 'win') sounds.win();
        else if (hand.result === 'lose') sounds.lose();
        else if (hand.result === 'push') sounds.push();
        if (index === 0) {
          const money = hand.result === 'blackjack';
          const lose = hand.result === 'lose';
          setEffects({ key: resultKey, money, lose });
          if (money || lose) timers.push(setTimeout(() => {
            if (active) setEffects({ key: resultKey, money: false, lose: false });
          }, money ? 3500 : 800));
        }
      }, index * 600));
    });
    return () => { active = false; timers.forEach(clearTimeout); };
  }, [resultKey]);

  return { showMoneyRain: effects.key === resultKey && effects.money,
    showLoseVignette: effects.key === resultKey && effects.lose, history };
}
