'use client';

import { useEffect, useRef } from 'react';
import {
  BETTING_TIMEOUT_MS,
  GameState,
  NEXT_ROUND_TIMEOUT_MS,
  PLAYER_ACTION_TIMEOUT_MS,
  allPlayersFinished,
  isDealerBlackjackPending,
  hasPendingInsuranceDecision,
  autoStandTimedOutPlayers,
  flipDealerHoleCard,
  shouldDealerHit,
  dealerHitOne,
  finalizeDealerHand,
  resolveResults,
  dealInitialCards,
  hasActiveBets,
  restartPhaseTimer,
  addTableMessage,
} from '@/features/blackjack/lib/blackjack';
import { sounds } from '@/features/blackjack/lib/sounds';
import { useLanguage } from '@/shared/i18n/useLanguage';

interface UseDealerProgressionParams {
  gameState: GameState;
  gameStateRef: React.RefObject<GameState>;
  isHostRef: React.RefObject<boolean>;
  syncGameState: (state: GameState) => void;
  onResultsTimeout: () => void;
}

export function useDealerProgression({
  gameState, gameStateRef, isHostRef,
  syncGameState, onResultsTimeout,
}: UseDealerProgressionParams) {
  const { t } = useLanguage();
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

  // Auto-clear transient table messages in a dedicated effect so phaseStartedAt
  // updates do not prematurely cancel the cleanup timer.
  useEffect(() => {
    if (!gameState.tableOpen || !isHostRef.current || !gameState.tableMessage) return;
    const msgId = gameState.tableMessage.id;
    const timer = setTimeout(() => {
      if (gameStateRef.current.tableMessage?.id === msgId) {
        syncGameState({ ...gameStateRef.current, tableMessage: undefined });
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [gameState.tableOpen, gameState.tableMessage, syncGameState, gameStateRef, isHostRef]);

  // Deal as soon as everyone is ready.
  useEffect(() => {
    const currentPhase = gameState.phase;
    if (currentPhase !== 'betting' || !gameState.tableOpen) return;
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
      return () => {
        clearTimeout(timer);
        if (currentPhase === 'betting') {
          dealingRef.current = false;
        }
      };
    }
  }, [gameState, syncGameState, gameStateRef, isHostRef]);

  // Force the betting phase to move after 20s. If nobody bet, restart the counter.
  useEffect(() => {
    if (gameState.phase !== 'betting' || !gameState.tableOpen || !isHostRef.current) return;
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
      newState = addTableMessage(newState, t.table.noBetsRestart);
      syncGameState(newState);
    }, remaining);
    return () => {
      clearTimeout(timer);
    };
  }, [gameState.tableOpen, gameState.phase, gameState.phaseStartedAt, syncGameState, gameStateRef, isHostRef, t.table.noBetsRestart]);

  // Move results to the next betting window after NEXT_ROUND_TIMEOUT_MS (5s).
  useEffect(() => {
    if (gameState.phase !== 'results' || !gameState.tableOpen || !isHostRef.current) return;
    const elapsed = Date.now() - gameState.phaseStartedAt;
    const remaining = Math.max(0, NEXT_ROUND_TIMEOUT_MS - elapsed);
    const timer = setTimeout(() => {
      if (gameStateRef.current.phase !== 'results') return;
      onResultsTimeout();
    }, remaining);
    return () => clearTimeout(timer);
  }, [gameState.tableOpen, gameState.phase, gameState.phaseStartedAt, onResultsTimeout, gameStateRef, isHostRef]);

  // 10-second player action timeout: auto-stand all remaining actionable hands.
  // The timer resets whenever turnStartedAt changes (i.e., after any player action).
  useEffect(() => {
    if (gameState.phase !== 'playing' || !gameState.tableOpen) return;
    if (!isHostRef.current) return;

    const elapsed = Date.now() - gameState.turnStartedAt;
    const remaining = Math.max(0, PLAYER_ACTION_TIMEOUT_MS - elapsed);

    const timer = setTimeout(() => {
      const currentState = gameStateRef.current;
      if (currentState.phase !== 'playing') return;
      const newState = autoStandTimedOutPlayers(currentState);
      if (newState !== currentState) {
        syncGameState(newState);
      }
    }, remaining);
    return () => clearTimeout(timer);
  }, [gameState.tableOpen, gameState.phase, gameState.turnStartedAt, syncGameState, gameStateRef, isHostRef]);

  // Dealer turn — step 1: flip hole card
  useEffect(() => {
    if (gameState.phase !== 'playing' || !gameState.tableOpen) return;
    if (!isHostRef.current) return;

    // Check if dealer has BJ based on actual card values (the dealer.blackjack
    // flag is NOT set during dealInitialCards to avoid leaking the hole card).
    const dealerHasBJ = isDealerBlackjackPending(gameState);

    if (dealerHasBJ) {
      // Give eligible players a 5s window to decide on insurance when dealer shows Ace;
      // once all eligible players have decided (or if insurance doesn't apply), flip quickly.
      const waitingOnInsurance = hasPendingInsuranceDecision(gameState);
      const revealWindowMs = waitingOnInsurance ? 5000 : 1200;
      const anchor = waitingOnInsurance ? gameState.phaseStartedAt : gameState.turnStartedAt;
      const remaining = Math.max(0, revealWindowMs - (Date.now() - anchor));
      const timer = setTimeout(() => {
        if (gameStateRef.current.phase !== 'playing') return;
        sounds.cardDeal();
        const flipped = flipDealerHoleCard(gameStateRef.current);
        syncGameState(flipped);
      }, remaining);
      return () => clearTimeout(timer);
    }

    if (allPlayersFinished(gameState)) {
      // Anchor to the last player action (turnStartedAt) for the same reason.
      const remaining = Math.max(0, 800 - (Date.now() - gameState.turnStartedAt));
      const timer = setTimeout(() => {
        if (gameStateRef.current.phase !== 'playing') return;
        sounds.cardDeal();
        const flipped = flipDealerHoleCard(gameStateRef.current);
        syncGameState(flipped);
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [gameState, syncGameState, gameStateRef, isHostRef]);

  // Dealer turn — step 2: draw cards one by one
  useEffect(() => {
    if (gameState.phase !== 'dealer-turn' || !gameState.tableOpen) return;
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
        // The host's own wallet is persisted from authoritative state by
        // useRoomConnection once this state commits.
        syncGameState(resolved);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [gameState, syncGameState, gameStateRef, isHostRef]);
}
