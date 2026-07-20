'use client';

import { useEffect, useRef } from 'react';
import { GameState, handValue, Hand } from '@/features/blackjack/lib/blackjack';
import type { AutoplayConfig } from '@/features/blackjack/types/autoplay';

function isHandDone(hand: Hand): boolean {
  return hand.stood || hand.busted || hand.blackjack || hand.surrendered;
}

/** Maximum time (ms) autoplay will wait before force-standing.
 *  Prevents infinite loops/hangs if state gets desynchronized. */
const AUTOPLAY_SAFETY_TIMEOUT_MS = 15_000;

interface UseAutoplayParams {
  gameState: GameState;
  myId: string;
  isSpectator: boolean;
  isHostRef: React.RefObject<boolean>;
  autoplay: AutoplayConfig;
  balance: number;
  currentBet: number;
  gameStateRef: React.RefObject<GameState>;
  handleHit: () => void;
  handleStand: () => void;
  handleNewRound: () => void;
  handleConfirmBetWith: (bet: number) => void;
}

export function useAutoplay({
  gameState, myId, isSpectator, isHostRef,
  autoplay, balance,
  gameStateRef,
  handleHit, handleStand, handleNewRound,
  handleConfirmBetWith,
}: UseAutoplayParams) {
  const autoplayRef = useRef(autoplay);
  const balanceRef = useRef(balance);
  const confirmBetRef = useRef(handleConfirmBetWith);
  const autoBetPhaseRef = useRef<number | null>(null);
  useEffect(() => { autoplayRef.current = autoplay; }, [autoplay]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { confirmBetRef.current = handleConfirmBetWith; }, [handleConfirmBetWith]);

  // Narrow derived state to avoid re-running effects on unrelated gameState changes
  const autoPlayer = gameState.players[myId];
  const myAutoReady = autoPlayer?.ready ?? false;
  const activeHandIndex = autoPlayer?.activeHandIndex ?? 0;
  const activeHand = autoPlayer?.hands[activeHandIndex];
  const myAutoHandDone = activeHand ? isHandDone(activeHand) : true;
  const myAutoCardCount = activeHand?.cards.length ?? 0;

  // Whether autoplay should be driving the current hand right now. This is a
  // live derivation (not a snapshot taken once when the round started), so
  // flipping the toggle mid-hand takes effect immediately in both directions:
  // turning it on picks up the current hand right away instead of waiting for
  // next round, and turning it off actually stops it instead of continuing
  // to auto-act until the next betting phase.
  const autoplayRoundActive = autoplay.enabled && !isSpectator && gameState.phase === 'playing';

  // --- Auto-bet ---
  useEffect(() => {
    const cfg = autoplayRef.current;
    if (!cfg.enabled || isSpectator) return;
    if (gameState.phase !== 'betting') return;
    if (cfg.autoBet === 0 || myAutoReady) return;
    if (autoBetPhaseRef.current === gameState.phaseStartedAt) return;

    const currentBal = balanceRef.current;
    if (currentBal <= 0) return; // No money → skip, don't hang

    const betAmount = cfg.autoBet === -1 ? currentBal : Math.min(cfg.autoBet, currentBal);
    if (betAmount <= 0) return;

    const timer = setTimeout(() => {
      const latestBal = balanceRef.current;
      if (latestBal <= 0) return; // Re-check inside callback
      if (gameStateRef.current.phase !== 'betting') return;
      if (gameStateRef.current.players[myId]?.ready) return;
      const finalBet = cfg.autoBet === -1 ? latestBal : Math.min(cfg.autoBet, latestBal);
      if (finalBet <= 0) return;
      autoBetPhaseRef.current = gameState.phaseStartedAt;
      confirmBetRef.current(finalBet);
    }, 800);
    return () => clearTimeout(timer);
  }, [gameState.phase, gameState.phaseStartedAt, myAutoReady, isSpectator, myId, gameStateRef, autoplay.enabled, autoplay.autoBet]);

  // --- Auto-play (hit/stand/double) ---
  useEffect(() => {
    if (!autoplayRoundActive) return;
    if (myAutoHandDone || myAutoCardCount === 0) return;

    const me = gameStateRef.current.players[myId];
    if (!me) return;
    const hand = me.hands[me.activeHandIndex];
    if (!hand || isHandDone(hand)) return;

    const timer = setTimeout(() => {
      // Re-check live enabled state and re-read latest state inside the
      // callback, so toggling autoplay off during this window cancels the
      // queued action instead of firing it anyway.
      if (!autoplayRef.current.enabled) return;
      const latestMe = gameStateRef.current.players[myId];
      if (!latestMe) return;
      const latestHand = latestMe.hands[latestMe.activeHandIndex];
      if (!latestHand || isHandDone(latestHand)) return;
      const latestVal = handValue(latestHand.cards);

      // Strategy: hit/stand on threshold
      if (latestVal >= autoplayRef.current.standOn) {
        handleStand();
      } else {
        handleHit();
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [autoplayRoundActive, myAutoHandDone, myAutoCardCount, activeHandIndex, myId,
      handleHit, handleStand, gameStateRef]);

  // --- Safety timeout: force stand if auto-play hangs for 15s ---
  useEffect(() => {
    if (!autoplayRoundActive) return;
    if (myAutoHandDone) return;

    const timer = setTimeout(() => {
      if (!autoplayRef.current.enabled) return;
      const latestMe = gameStateRef.current.players[myId];
      if (!latestMe) return;
      const latestHand = latestMe.hands[latestMe.activeHandIndex];
      if (!latestHand || isHandDone(latestHand)) return;
      // Force stand to unstick the game
      handleStand();
    }, AUTOPLAY_SAFETY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [autoplayRoundActive, myAutoHandDone, myId, handleStand, gameStateRef]);

  // --- Auto new-round (host only) ---
  useEffect(() => {
    if (gameState.phase !== 'results') return;
    if (!isHostRef.current || isSpectator) return;

    const cfg = autoplayRef.current;
    if (!cfg.enabled) return;

    const timer = setTimeout(() => {
      if (!autoplayRef.current.enabled) return;
      if (gameStateRef.current.phase !== 'results') return;
      handleNewRound();
    }, 2500);
    return () => clearTimeout(timer);
  }, [gameState.phase, isSpectator, handleNewRound, gameStateRef, isHostRef]);

  return { autoplayRoundActive };
}
