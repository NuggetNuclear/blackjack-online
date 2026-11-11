'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import {
  startNewRound,
  canDoubleDown,
  canSplit,
  canSurrender,
  dealerShowsAce,
} from '@/features/blackjack/lib/blackjack';
import { sounds } from '@/features/blackjack/lib/sounds';
import type { AutoplayConfig } from '@/features/blackjack/types/autoplay';
import { useRoomConnection } from '@/features/blackjack/hooks/useRoomConnection';
import { useDealerProgression } from '@/features/blackjack/hooks/useDealerProgression';
import { useResultsEffects } from '@/features/blackjack/hooks/useResultsEffects';
import { useAutoplay } from '@/features/blackjack/hooks/useAutoplay';
import { useRoundCountdown } from '@/features/blackjack/hooks/useRoundCountdown';
import { useLanguage } from '@/shared/i18n/useLanguage';
import { useViewportHeight } from '@/shared/hooks/useViewportHeight';
import LobbyScreen from '@/features/blackjack/screens/LobbyScreen';
import WaitingRoomScreen from '@/features/blackjack/screens/WaitingRoomScreen';
import GameTable from '@/features/blackjack/components/GameTable';
import ConfirmModal from '@/features/blackjack/components/ConfirmModal';
import { readStorage, writeStorage } from '@/shared/lib/storage';
import { isBettingOpen } from '@/features/blackjack/lib/clock';

const BOTTOM_OFFSET_OPTIONS = [0, 16, 32] as const;
const BOTTOM_OFFSET_STORAGE_KEY = 'bj_bottom_offset_index';
const BOTTOM_OFFSET_CHANGE_EVENT = 'bj-bottom-offset-change';
const SOUND_STORAGE_KEY = 'bj_sound';
const DEFAULT_AUTOPLAY: AutoplayConfig = {
  enabled: false,
  standOn: 17,
  autoBet: 0,
};

function readBottomOffsetIndex(): number {
  if (typeof window === 'undefined') return 0;
  const stored = readStorage(BOTTOM_OFFSET_STORAGE_KEY);
  if (!stored) return 0;
  const parsed = Number.parseInt(stored, 10);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed < BOTTOM_OFFSET_OPTIONS.length) {
    return parsed;
  }
  return 0;
}

function subscribeBottomOffsetIndex(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleChange = (event: Event) => {
    if (event instanceof StorageEvent && event.key && event.key !== BOTTOM_OFFSET_STORAGE_KEY) {
      return;
    }
    onStoreChange();
  };

  window.addEventListener('storage', handleChange);
  window.addEventListener(BOTTOM_OFFSET_CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener(BOTTOM_OFFSET_CHANGE_EVENT, handleChange);
  };
}

function writeBottomOffsetIndex(nextIndex: number) {
  if (typeof window === 'undefined') return;
  writeStorage(BOTTOM_OFFSET_STORAGE_KEY, String(nextIndex));
  window.dispatchEvent(new Event(BOTTOM_OFFSET_CHANGE_EVENT));
}

export default function GameRoom() {
  const room = useRoomConnection();
  return <GameSession key={room.sessionKey} room={room} />;
}

function GameSession({ room }: { room: ReturnType<typeof useRoomConnection> }) {
  const {
    screen,
    playerName,
    setPlayerName,
    inputRoomCode,
    setInputRoomCode,
    roomCode,
    error,
    clearError,
    pendingAction,
    handleCancelEntry,
    sessionKey,
    clockOffsetMs,
    connectionStatus,
    localToast,
    myId,
    isSpectator,
    isHost,
    gameState,
    setGameState,
    balance,
    setLocalBalance,
    roomSettings,
    setRoomSettings,
    copied,
    gameStateRef,
    isHostRef,
    handleCreateRoom,
    handleJoinRoom,
    handlePlaySolo,
    handleStartGame,
    handleExitRoom: leaveRoom,
    handleCopyLink,
    handleSwitchToSpectator: switchToSpectator,
    handleJoinFromSpectator,
    syncGameState,
    sendAction,
    sendBet,
  } = room;
  const { t } = useLanguage();
  useViewportHeight();
  const bottomOffsetIndex = useSyncExternalStore(
    subscribeBottomOffsetIndex,
    readBottomOffsetIndex,
    () => 0
  );
  const updateOptimisticBalance = useCallback((nextBalance: number) => {
    setLocalBalance(nextBalance);
  }, [setLocalBalance]);

  // Local UI state not in hooks
  const [currentBet, setCurrentBet] = useState(0);
  const [soundOn, setSoundOnState] = useState(() => {
    if (typeof window === 'undefined') return true;
    return readStorage(SOUND_STORAGE_KEY) !== 'off';
  });
  const setSoundOn = useCallback((next: boolean) => {
    setSoundOnState(next);
    writeStorage(SOUND_STORAGE_KEY, next ? 'on' : 'off');
  }, []);
  const [dismissedInsuranceRound, setDismissedInsuranceRound] = useState<number | null>(null);
  const [autoplay, setAutoplay] = useState<AutoplayConfig>(DEFAULT_AUTOPLAY);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const setBottomOffsetIndex = useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= BOTTOM_OFFSET_OPTIONS.length) return;
    writeBottomOffsetIndex(nextIndex);
  }, []);

  // Sound toggle
  useEffect(() => { sounds.setEnabled(soundOn); }, [soundOn]);

  // ==================== Results Effects (sounds, history, balance sync) ====================
  const { showMoneyRain, showLoseVignette, history } = useResultsEffects({
    sessionKey,
    gameState,
    myId,
    isSpectator,
  });

  // ==================== Player Actions (host-authoritative) ====================
  // All actions route through `sendAction`: the host applies them via the
  // authoritative reducer path, peers send intents to the host. Peers update
  // local UI balance optimistically; the authoritative balance is persisted
  // from host state inside useRoomConnection upon sync.

  const handleHit = useCallback(() => {
    sounds.cardDeal();
    sendAction('hit');
  }, [sendAction]);

  const handleStand = useCallback(() => {
    sounds.stand();
    sendAction('stand');
  }, [sendAction]);

  const handleDouble = useCallback(() => {
    sounds.cardDeal();
    if (!isHostRef.current) {
      const latestPlayer = gameStateRef.current.players[myId];
      const activeHand = latestPlayer?.hands[latestPlayer.activeHandIndex ?? 0];
      if (activeHand && canDoubleDown(activeHand) && balance >= activeHand.bet) {
        updateOptimisticBalance(balance - activeHand.bet);
      }
    }
    sendAction('double');
  }, [balance, gameStateRef, isHostRef, myId, updateOptimisticBalance, sendAction]);

  const handleSurrender = useCallback(() => {
    sounds.stand();
    if (!isHostRef.current) {
      const state = gameStateRef.current;
      const latestPlayer = state.players[myId];
      const activeHand = latestPlayer?.hands[latestPlayer.activeHandIndex ?? 0];
      if (activeHand && latestPlayer && canSurrender(activeHand, state.settings.surrenderEnabled, latestPlayer.hands.length)) {
        updateOptimisticBalance(balance + Math.floor(activeHand.bet / 2));
      }
    }
    sendAction('surrender');
  }, [balance, gameStateRef, isHostRef, myId, updateOptimisticBalance, sendAction]);

  const handleSplit = useCallback(() => {
    sounds.cardDeal();
    if (!isHostRef.current) {
      const state = gameStateRef.current;
      const latestPlayer = state.players[myId];
      const activeHand = latestPlayer?.hands[latestPlayer.activeHandIndex ?? 0];
      if (activeHand && latestPlayer && canSplit(activeHand, balance, state.settings, latestPlayer.hands.length)) {
        updateOptimisticBalance(balance - activeHand.bet);
      }
    }
    sendAction('split');
  }, [balance, gameStateRef, isHostRef, myId, updateOptimisticBalance, sendAction]);

  const handleInsure = useCallback(() => {
    const state = gameStateRef.current;
    if (!isHostRef.current && state.settings.insuranceEnabled && dealerShowsAce(state)) {
      const latestPlayer = state.players[myId];
      const firstHand = latestPlayer?.hands[0];
      const cost = firstHand ? Math.floor(firstHand.bet / 2) : 0;
      if (
        latestPlayer &&
        latestPlayer.hands.length === 1 &&
        firstHand &&
        firstHand.cards.length === 2 &&
        firstHand.insuranceBet === 0 &&
        !firstHand.insuranceDecided &&
        cost > 0 &&
        balance >= cost
      ) {
        updateOptimisticBalance(balance - cost);
      }
    }
    sendAction('insure');
    setDismissedInsuranceRound(state.roundNumber);
  }, [balance, gameStateRef, isHostRef, myId, updateOptimisticBalance, sendAction]);

  const handleDeclineInsurance = useCallback(() => {
    sendAction('decline-insurance');
    setDismissedInsuranceRound(gameStateRef.current.roundNumber);
  }, [gameStateRef, sendAction]);

  const handleNewRound = useCallback(() => {
    if (!isHostRef.current || gameStateRef.current.phase !== 'results') return;
    sounds.newRound();
    setGameState((prev) => (prev.phase === 'results' ? startNewRound(prev) : prev));
    setCurrentBet(0);
    setDismissedInsuranceRound(null);
  }, [gameStateRef, isHostRef, setGameState]);

  // ==================== Dealer Progression (host only) ====================
  useDealerProgression({
    gameState,
    gameStateRef,
    isHostRef,
    syncGameState,
    onResultsTimeout: handleNewRound,
  });

  // ==================== Betting ====================

  const handleConfirmBetWith = useCallback((bet: number) => {
    if (clockOffsetMs === null || !isBettingOpen(gameStateRef.current, Date.now() + clockOffsetMs)) return;
    if (bet <= 0 || bet > balance) return;
    if (gameStateRef.current.players[myId]?.ready) return;

    sounds.bet();
    setCurrentBet(bet);
    if (!isHostRef.current) {
      // Optimistic local balance; the host's next sync is authoritative.
      updateOptimisticBalance(balance - bet);
    }
    sendBet(bet);
  }, [balance, clockOffsetMs, gameStateRef, isHostRef, myId, updateOptimisticBalance, sendBet]);

  const handleConfirmBet = useCallback(() => {
    handleConfirmBetWith(currentBet);
  }, [currentBet, handleConfirmBetWith]);

  const handleAllIn = useCallback(() => setCurrentBet(balance), [balance]);

  // ==================== Autoplay ====================

  const { autoplayRoundActive } = useAutoplay({
    bettingSynchronized: clockOffsetMs !== null,
    gameState,
    myId,
    isSpectator,
    isHostRef,
    autoplay,
    balance,
    currentBet,
    gameStateRef,
    handleHit,
    handleStand,
    handleNewRound,
    handleConfirmBetWith,
  });
  const { bettingSecondsLeft, bettingTimeExpired, bettingProgress, nextRoundProgress, nextRoundSecondsLeft, playerActionSecondsLeft, playerActionProgress } = useRoundCountdown(gameState, clockOffsetMs);

  // ==================== Derived State ====================

  const myPlayer = gameState.players[myId];
  const hasActiveWager = gameState.phase !== 'results' && !!myPlayer?.hands.some((hand) => hand.bet > 0);
  const activeHandDetails = myPlayer?.hands[myPlayer.activeHandIndex];
  const activeHandDealt = !!activeHandDetails && activeHandDetails.cards.length >= 2;
  const canAct = gameState.phase === 'playing' && !!myPlayer && !!activeHandDetails
    && activeHandDealt
    && !activeHandDetails.stood && !activeHandDetails.busted
    && !activeHandDetails.surrendered && !activeHandDetails.blackjack
    && !isSpectator;
  const insurancePromptDismissed = dismissedInsuranceRound === gameState.roundNumber;
  const leaderName = gameState.hostName || playerName;

  // ==================== In-Game Confirm Actions (replaces window.confirm) ====================

  const handleExitRoom = useCallback(() => {
    const title = t.header.exit;
    const message = hasActiveWager ? t.header.exitConfirmWithBet : t.header.exitConfirm;
    setConfirmModal({
      title,
      message,
      onConfirm: () => {
        setConfirmModal(null);
        leaveRoom();
        setCurrentBet(0);
        setAutoplay(DEFAULT_AUTOPLAY);
      },
    });
  }, [hasActiveWager, leaveRoom, t.header.exit, t.header.exitConfirm, t.header.exitConfirmWithBet]);

  const handleSwitchToSpectator = useCallback(() => {
    const title = t.header.spectate;
    const message = hasActiveWager ? t.header.spectateConfirmWithBet : t.header.spectateConfirm;
    setConfirmModal({
      title,
      message,
      onConfirm: () => {
        setConfirmModal(null);
        switchToSpectator();
        setAutoplay(DEFAULT_AUTOPLAY);
        setCurrentBet(0);
      },
    });
  }, [hasActiveWager, switchToSpectator, t.header.spectate, t.header.spectateConfirm, t.header.spectateConfirmWithBet]);

  // ==================== Screen Routing ====================

  if (screen === 'lobby') {
    return (
      <LobbyScreen
        playerName={playerName}
        setPlayerName={setPlayerName}
        inputRoomCode={inputRoomCode}
        setInputRoomCode={setInputRoomCode}
        error={error}
        clearError={clearError}
        pendingAction={pendingAction}
        onCancelEntry={handleCancelEntry}
        balance={balance}
        roomSettings={roomSettings}
        setRoomSettings={setRoomSettings}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onPlaySolo={handlePlaySolo}
      />
    );
  }

  if (screen === 'waiting') {
    return (
      <WaitingRoomScreen
        roomCode={roomCode}
        gameState={gameState}
        isHost={isHost}
        isSpectator={isSpectator}
        onStartGame={handleStartGame}
        onExitRoom={leaveRoom}
      />
    );
  }

  return (
    <>
    <GameTable
      gameState={gameState}
      myId={myId}
      myPlayer={myPlayer}
      isSpectator={isSpectator}
      isHost={isHost}
      balance={balance}
      currentBet={currentBet}
      setCurrentBet={setCurrentBet}
      autoplay={autoplay}
      onAutoplayChange={setAutoplay}
      autoplayRoundActive={autoplayRoundActive}
      canAct={canAct}
      bottomOffsetIndex={bottomOffsetIndex}
      setBottomOffsetIndex={setBottomOffsetIndex}
      soundOn={soundOn}
      setSoundOn={setSoundOn}
      roomCode={roomCode}
      copied={copied}
      connectionStatus={connectionStatus ? t.entry.status[connectionStatus] : ''}
      localToast={localToast}
      leaderName={leaderName}
      showMoneyRain={showMoneyRain}
      showLoseVignette={showLoseVignette}
      history={history}
      insurancePromptDismissed={insurancePromptDismissed}
      bettingSecondsLeft={bettingSecondsLeft}
      bettingTimeExpired={bettingTimeExpired}
      bettingProgress={bettingProgress}
      nextRoundProgress={nextRoundProgress}
      nextRoundSecondsLeft={nextRoundSecondsLeft}
      playerActionSecondsLeft={playerActionSecondsLeft}
      playerActionProgress={playerActionProgress}
      onHit={handleHit}
      onStand={handleStand}
      onDouble={handleDouble}
      onSplit={handleSplit}
      onSurrender={handleSurrender}
      onInsure={handleInsure}
      onDeclineInsurance={handleDeclineInsurance}
      onConfirmBet={handleConfirmBet}
      onAllIn={handleAllIn}
      onNewRound={handleNewRound}
      onCopyLink={handleCopyLink}
      onSwitchToSpectator={handleSwitchToSpectator}
      onExitRoom={handleExitRoom}
      onJoinFromSpectator={handleJoinFromSpectator}
    />
    {confirmModal && (
      <ConfirmModal
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(null)}
      />
    )}
    </>
  );
}
