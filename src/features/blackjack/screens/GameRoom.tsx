'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import {
  playerHit,
  playerStand,
  playerDoubleDown,
  playerSurrender,
  playerSplit,
  playerInsure,
  startNewRound,
} from '@/features/blackjack/lib/blackjack';
import { setBalance } from '@/features/blackjack/lib/wallet';
import { sounds } from '@/features/blackjack/lib/sounds';
import type { AutoplayConfig } from '@/features/blackjack/types/autoplay';
import { useRoomConnection } from '@/features/blackjack/hooks/useRoomConnection';
import { useDealerProgression } from '@/features/blackjack/hooks/useDealerProgression';
import { useResultsEffects } from '@/features/blackjack/hooks/useResultsEffects';
import { useAutoplay } from '@/features/blackjack/hooks/useAutoplay';
import { useRoundCountdown } from '@/features/blackjack/hooks/useRoundCountdown';
import { useLanguage } from '@/shared/i18n/useLanguage';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useViewportHeight } from '@/shared/hooks/useViewportHeight';
import LobbyScreen from '@/features/blackjack/screens/LobbyScreen';
import WaitingRoomScreen from '@/features/blackjack/screens/WaitingRoomScreen';
import GameTable from '@/features/blackjack/components/GameTable';
import ConfirmModal from '@/features/blackjack/components/ConfirmModal';

const BOTTOM_OFFSET_OPTIONS = [0, 48, 88] as const;
const BOTTOM_OFFSET_STORAGE_KEY = 'bj_bottom_offset_index';
const BOTTOM_OFFSET_CHANGE_EVENT = 'bj-bottom-offset-change';
const DEFAULT_AUTOPLAY: AutoplayConfig = {
  enabled: false,
  standOn: 17,
  autoBet: 0,
};

function readBottomOffsetIndex(isMobile: boolean): number {
  if (typeof window === 'undefined') return 0;
  const stored = window.localStorage.getItem(BOTTOM_OFFSET_STORAGE_KEY);
  if (!stored) return isMobile ? 1 : 0;
  const parsed = Number.parseInt(stored, 10);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed < BOTTOM_OFFSET_OPTIONS.length) {
    return parsed;
  }
  return isMobile ? 1 : 0;
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
  window.localStorage.setItem(BOTTOM_OFFSET_STORAGE_KEY, String(nextIndex));
  window.dispatchEvent(new Event(BOTTOM_OFFSET_CHANGE_EVENT));
}

export default function GameRoom() {
  const {
    screen,
    playerName,
    setPlayerName,
    inputRoomCode,
    setInputRoomCode,
    roomCode,
    error,
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
    p2pRef,
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
  } = useRoomConnection();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  useViewportHeight();
  const bottomOffsetIndex = useSyncExternalStore(
    subscribeBottomOffsetIndex,
    () => readBottomOffsetIndex(isMobile),
    () => 0
  );
  const persistLocalBalance = useCallback((nextBalance: number) => {
    setLocalBalance(nextBalance);
    void setBalance(nextBalance);
  }, [setLocalBalance]);

  // Local UI state not in hooks
  const [currentBet, setCurrentBet] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [dismissedInsuranceRound, setDismissedInsuranceRound] = useState<number | null>(null);
  const [autoplay, setAutoplay] = useState<AutoplayConfig>(DEFAULT_AUTOPLAY);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const setBottomOffsetIndex = useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= BOTTOM_OFFSET_OPTIONS.length) return;
    writeBottomOffsetIndex(nextIndex);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasStoredPreference = window.localStorage.getItem(BOTTOM_OFFSET_STORAGE_KEY) !== null;
    if (!hasStoredPreference && isMobile && bottomOffsetIndex === 0) {
      writeBottomOffsetIndex(1);
    }
  }, [bottomOffsetIndex, isMobile]);

  // Sound toggle
  useEffect(() => { sounds.setEnabled(soundOn); }, [soundOn]);

  // ==================== Results Effects (sounds, history, balance sync) ====================
  const { showMoneyRain, showLoseVignette, history } = useResultsEffects({
    gameState,
    myId,
    isSpectator,
  });

  // ==================== Player Actions (host-authoritative) ====================
  // Host: apply action directly and broadcast
  // Non-host: send intent to host who applies and broadcasts

  const handleHit = useCallback(() => {
    sounds.cardDeal();
    if (isHostRef.current) {
      setGameState((prev) => {
        const newState = playerHit(prev, myId);
        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
    } else {
      p2pRef.current?.send({
        type: 'player-action',
        payload: { playerId: myId, action: 'hit' },
        senderId: myId,
      });
    }
  }, [isHostRef, myId, p2pRef, setGameState]);

  const handleStand = useCallback(() => {
    sounds.stand();
    if (isHostRef.current) {
      setGameState((prev) => {
        const newState = playerStand(prev, myId);
        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
    } else {
      p2pRef.current?.send({
        type: 'player-action',
        payload: { playerId: myId, action: 'stand' },
        senderId: myId,
      });
    }
  }, [isHostRef, myId, p2pRef, setGameState]);

  const handleDouble = useCallback(() => {
    sounds.cardDeal();
    if (isHostRef.current) {
      setGameState((prev) => {
        const newState = playerDoubleDown(prev, myId);
        const me = newState.players[myId];
        if (me) {
          persistLocalBalance(me.balance);
        }
        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
    } else {
      const latestPlayer = gameStateRef.current.players[myId];
      const activeHand = latestPlayer?.hands[latestPlayer.activeHandIndex ?? 0];
      if (activeHand) {
        persistLocalBalance(balance - activeHand.bet);
      }
      p2pRef.current?.send({
        type: 'player-action',
        payload: { playerId: myId, action: 'double' },
        senderId: myId,
      });
    }
  }, [balance, gameStateRef, isHostRef, myId, p2pRef, persistLocalBalance, setGameState]);

  const handleSurrender = useCallback(() => {
    sounds.stand();
    if (isHostRef.current) {
      setGameState((prev) => {
        const newState = playerSurrender(prev, myId);
        const me = newState.players[myId];
        if (me) {
          persistLocalBalance(me.balance);
        }
        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
    } else {
      const latestPlayer = gameStateRef.current.players[myId];
      const activeHand = latestPlayer?.hands[latestPlayer.activeHandIndex ?? 0];
      if (activeHand) {
        persistLocalBalance(balance + Math.floor(activeHand.bet / 2));
      }
      p2pRef.current?.send({
        type: 'player-action',
        payload: { playerId: myId, action: 'surrender' },
        senderId: myId,
      });
    }
  }, [balance, gameStateRef, isHostRef, myId, p2pRef, persistLocalBalance, setGameState]);

  const handleSplit = useCallback(() => {
    sounds.cardDeal();
    if (isHostRef.current) {
      setGameState((prev) => {
        const newState = playerSplit(prev, myId);
        const me = newState.players[myId];
        if (me) {
          persistLocalBalance(me.balance);
        }
        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
    } else {
      const latestPlayer = gameStateRef.current.players[myId];
      const activeHand = latestPlayer?.hands[latestPlayer.activeHandIndex ?? 0];
      if (activeHand) {
        persistLocalBalance(balance - activeHand.bet);
      }
      p2pRef.current?.send({
        type: 'player-action',
        payload: { playerId: myId, action: 'split' },
        senderId: myId,
      });
    }
  }, [balance, gameStateRef, isHostRef, myId, p2pRef, persistLocalBalance, setGameState]);

  const handleInsure = useCallback(() => {
    if (isHostRef.current) {
      setGameState((prev) => {
        const newState = playerInsure(prev, myId);
        const me = newState.players[myId];
        if (me) {
          persistLocalBalance(me.balance);
        }
        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
    } else {
      const firstHand = gameStateRef.current.players[myId]?.hands[0];
      if (firstHand) {
        persistLocalBalance(balance - Math.floor(firstHand.bet / 2));
      }
      p2pRef.current?.send({
        type: 'player-action',
        payload: { playerId: myId, action: 'insure' },
        senderId: myId,
      });
    }
    setDismissedInsuranceRound(gameStateRef.current.roundNumber);
  }, [balance, gameStateRef, isHostRef, myId, p2pRef, persistLocalBalance, setGameState]);

  const handleDeclineInsurance = useCallback(() => {
    setDismissedInsuranceRound(gameStateRef.current.roundNumber);
  }, [gameStateRef]);

  const handleNewRound = useCallback(() => {
    if (!isHostRef.current || gameStateRef.current.phase !== 'results') return;
    sounds.newRound();
    setGameState((prev) => {
      const newState = startNewRound(prev);
      if (p2pRef.current) {
        p2pRef.current.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
      }
      return newState;
    });
    setCurrentBet(0);
    setDismissedInsuranceRound(null);
  }, [gameStateRef, isHostRef, p2pRef, setGameState]);

  // ==================== Dealer Progression (host only) ====================
  useDealerProgression({
    gameState,
    gameStateRef,
    isHostRef,
    myId,
    setLocalBalance,
    syncGameState,
    onResultsTimeout: handleNewRound,
  });

  // ==================== Betting ====================

  const handleConfirmBet = useCallback(() => {
    if (currentBet <= 0 || currentBet > balance) return;
    if (gameStateRef.current.players[myId]?.ready) return;

    if (isHostRef.current) {
      // Host applies bet directly
      const newBalance = balance - currentBet;
      persistLocalBalance(newBalance);
      sounds.bet();
      setGameState((prev) => {
        const player = prev.players[myId];
        if (!player) return prev;
        const newState = {
          ...prev,
          tableMessage: undefined,
          players: {
            ...prev.players,
            [myId]: {
              ...player,
              hands: [{ ...player.hands[0], bet: currentBet }],
              balance: newBalance,
              ready: true,
            },
          },
        };
        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
    } else {
      // Non-host sends bet intent to host
      persistLocalBalance(balance - currentBet);
      sounds.bet();
      p2pRef.current?.send({
        type: 'player-bet',
        payload: { playerId: myId, bet: currentBet },
        senderId: myId,
      });
    }
  }, [balance, currentBet, gameStateRef, isHostRef, myId, p2pRef, persistLocalBalance, setGameState]);

  // Autoplay version: confirm bet with specific amount
  const handleConfirmBetWith = useCallback((bet: number) => {
    if (bet <= 0 || bet > balance) return;
    if (gameStateRef.current.players[myId]?.ready) return;

    if (isHostRef.current) {
      const newBal = balance - bet;
      persistLocalBalance(newBal);
      setCurrentBet(bet);
      sounds.bet();
      setGameState((prev) => {
        const player = prev.players[myId];
        if (!player || player.ready) return prev;
        const newState = {
          ...prev,
          tableMessage: undefined,
          players: {
            ...prev.players,
            [myId]: {
              ...player,
              hands: [{ ...player.hands[0], bet }],
              balance: newBal,
              ready: true,
            },
          },
        };
        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
    } else {
      sounds.bet();
      setCurrentBet(bet);
      persistLocalBalance(balance - bet);
      p2pRef.current?.send({
        type: 'player-bet',
        payload: { playerId: myId, bet },
        senderId: myId,
      });
    }
  }, [balance, gameStateRef, isHostRef, myId, p2pRef, persistLocalBalance, setGameState]);

  const handleAllIn = useCallback(() => setCurrentBet(balance), [balance]);

  // ==================== Autoplay ====================

  const { autoplayRoundActive } = useAutoplay({
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
  const { bettingSecondsLeft, bettingTimeExpired, bettingProgress, nextRoundProgress, nextRoundSecondsLeft, playerActionSecondsLeft, playerActionProgress } = useRoundCountdown(gameState);

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
      connectionStatus={connectionStatus}
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
