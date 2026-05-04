'use client';

import { useEffect, useRef } from 'react';
import {
  BETTING_TIMEOUT_MS,
  GameState,
  NEXT_ROUND_TIMEOUT_MS,
  PLAYER_ACTION_TIMEOUT_MS,
  allPlayersFinished,
  isBlackjack,
  flipDealerHoleCard,
  shouldDealerHit,
  dealerHitOne,
  finalizeDealerHand,
  resolveResults,
  dealInitialCards,
  hasActiveBets,
  restartPhaseTimer,
  playerStand,
  addTableMessage,
} from '@/features/blackjack/lib/blackjack';
import { setBalance } from '@/features/blackjack/lib/wallet';
import { sounds } from '@/features/blackjack/lib/sounds';

interface UseDealerProgressionParams {
  gameState: GameState;
  gameStateRef: React.RefObject<GameState>;
  isHostRef: React.RefObject<boolean>;
  myId: string;
  setLocalBalance: (b: number) => void;
  syncGameState: (state: GameState) => void;
  onResultsTimeout: () => void;
}

export function useDealerProgression({
  gameState, gameStateRef, isHostRef, myId,
  setLocalBalance, syncGameState, onResultsTimeout,
}: UseDealerProgressionParams) {
  const dealingRef = useRef(false);

  // BUG-FIX: Reset dealingRef at the START of each betting phase.
  // Previously it was reset on `phase !== 'betting'` which means it only cleared
  // when leaving betting — but the flag needs to be clean when ENTERING betting
  // so that the "all-ready" and "timeout" paths start fresh.
  useEffect(() => {
    if (gameState.phase === 'betting') {
      dealingRef.current = false;
    }
  }, [gameState.phase, gameState.phaseStartedAt]);

  // Deal as soon as everyone is ready.
  useEffect(() => {
    if (gameState.phase !== 'betting') return;
    if (!isHostRef.current) return;

    const players = Object.values(gameState.players);
    if (players.length < 1) return;
    if (!hasActiveBets(gameState)) return;

    if (players.every((p) => p.ready) && !dealingRef.current) {
      dealingRef.current = true;
      const timer = setTimeout(() => {
        // BUG-FIX: Double-check dealingRef inside the callback — prevents the
        // race where the timeout fires simultaneously with the "all-ready" path.
        if (gameStateRef.current.phase !== 'betting') return;
        sounds.cardDeal();
        syncGameState(dealInitialCards(gameStateRef.current));
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [gameState, syncGameState, gameStateRef, isHostRef]);

  // Force the betting phase to move after 20s. If nobody bet, restart the counter.
  useEffect(() => {
    if (gameState.phase !== 'betting' || !isHostRef.current) return;
    const elapsed = Date.now() - gameState.phaseStartedAt;
    const remaining = Math.max(0, BETTING_TIMEOUT_MS - elapsed);
    const timer = setTimeout(() => {
      if (gameStateRef.current.phase !== 'betting') return;
      // BUG-FIX: Check dealingRef BEFORE doing anything — if the "all-ready"
      // path already set it, bail out. This is the core race-condition fix.
      if (dealingRef.current) return;

      if (hasActiveBets(gameStateRef.current)) {
        dealingRef.current = true;
        sounds.cardDeal();
        syncGameState(dealInitialCards(gameStateRef.current));
        return;
      }

      let newState = restartPhaseTimer(gameStateRef.current);
      newState = addTableMessage(newState, 'No bets placed in time. Restarting timer...');
      syncGameState(newState);

      // Clear the message after 5 seconds if it's still there
      setTimeout(() => {
        if (
          gameStateRef.current.phase === 'betting' &&
          gameStateRef.current.tableMessage?.text === 'No bets placed in time. Restarting timer...'
        ) {
          syncGameState({ ...gameStateRef.current, tableMessage: undefined });
        }
      }, 5000);
    }, remaining);
    return () => clearTimeout(timer);
  }, [gameState.phase, gameState.phaseStartedAt, syncGameState, gameStateRef, isHostRef]);

  // Move results to the next betting window after NEXT_ROUND_TIMEOUT_MS (5s).
  useEffect(() => {
    if (gameState.phase !== 'results' || !isHostRef.current) return;
    const elapsed = Date.now() - gameState.phaseStartedAt;
    const remaining = Math.max(0, NEXT_ROUND_TIMEOUT_MS - elapsed);
    const timer = setTimeout(() => {
      if (gameStateRef.current.phase !== 'results') return;
      onResultsTimeout();
    }, remaining);
    return () => clearTimeout(timer);
  }, [gameState.phase, gameState.phaseStartedAt, onResultsTimeout, gameStateRef, isHostRef]);

  // 10-second player action timeout: auto-stand the current active player.
  // The timer resets whenever turnStartedAt changes (i.e., after any player action).
  useEffect(() => {
    if (gameState.phase !== 'playing') return;
    if (!isHostRef.current) return;

    const elapsed = Date.now() - gameState.turnStartedAt;
    const remaining = Math.max(0, PLAYER_ACTION_TIMEOUT_MS - elapsed);

    const timer = setTimeout(() => {
      const currentState = gameStateRef.current;
      if (currentState.phase !== 'playing') return;

      // Find the first player with an actionable hand
      for (const [pid, player] of Object.entries(currentState.players)) {
        const hand = player.hands[player.activeHandIndex];
        if (hand && hand.cards.length >= 2 && !hand.stood && !hand.busted && !hand.blackjack && !hand.surrendered) {
          // Force stand this player
          const newState = playerStand(currentState, pid);
          syncGameState(newState);
          return;
        }
      }
    }, remaining);
    return () => clearTimeout(timer);
  }, [gameState.phase, gameState.turnStartedAt, syncGameState, gameStateRef, isHostRef]);

  // Dealer turn — step 1: flip hole card
  useEffect(() => {
    if (gameState.phase !== 'playing') return;
    if (!isHostRef.current) return;

    // Check if dealer has BJ based on actual card values (the dealer.blackjack
    // flag is NOT set during dealInitialCards to avoid leaking the hole card).
    const dealerHasBJ = isBlackjack(gameState.dealer.cards);

    if (dealerHasBJ) {
      const timer = setTimeout(() => {
        if (gameStateRef.current.phase !== 'playing') return;
        sounds.cardDeal();
        const flipped = flipDealerHoleCard(gameStateRef.current);
        syncGameState(flipped);
      }, 1800);
      return () => clearTimeout(timer);
    }

    if (allPlayersFinished(gameState)) {
      const timer = setTimeout(() => {
        if (gameStateRef.current.phase !== 'playing') return;
        sounds.cardDeal();
        const flipped = flipDealerHoleCard(gameStateRef.current);
        syncGameState(flipped);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [gameState, syncGameState, gameStateRef, isHostRef]);

  // Dealer turn — step 2: draw cards one by one
  useEffect(() => {
    if (gameState.phase !== 'dealer-turn') return;
    if (!isHostRef.current) return;

    if (shouldDealerHit(gameState)) {
      const timer = setTimeout(() => {
        sounds.cardDeal();
        const newState = dealerHitOne(gameStateRef.current);
        syncGameState(newState);
      }, 800);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        const finalized = finalizeDealerHand(gameStateRef.current);
        const resolved = resolveResults(finalized);
        syncGameState(resolved);
        const me = resolved.players[myId];
        if (me) {
          let newBal = me.balance;
          if (newBal <= 0) newBal = 100;
          setLocalBalance(newBal);
          setBalance(newBal);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [gameState, syncGameState, myId, setLocalBalance, gameStateRef, isHostRef]);
}
