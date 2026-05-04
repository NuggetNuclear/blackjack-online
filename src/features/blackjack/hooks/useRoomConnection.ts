'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  GameState,
  PlayerState,
  RoomSettings,
  DEFAULT_ROOM_SETTINGS,
  createInitialGameState,
  createEmptyHand,
  playerHit,
  playerStand,
  playerDoubleDown,
  playerSurrender,
  playerSplit,
  playerInsure,
  startNewRound,
} from '@/features/blackjack/lib/blackjack';
import { P2PConnection, GameMessage, PlayerActionKind } from '@/features/blackjack/lib/p2p';
import { getBalance, setBalance } from '@/features/blackjack/lib/wallet';

export type Screen = 'lobby' | 'waiting' | 'game';

const PLAYER_NAME_STORAGE_KEY = 'bj_player_name';

interface UseRoomConnectionReturn {
  screen: Screen;
  setScreen: (s: Screen) => void;
  playerName: string;
  setPlayerName: (n: string) => void;
  inputRoomCode: string;
  setInputRoomCode: (c: string) => void;
  roomCode: string;
  error: string;
  connectionStatus: string;
  localToast: string;
  myId: string;
  isSpectator: boolean;
  isHost: boolean;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  balance: number;
  setLocalBalance: (b: number) => void;
  roomSettings: RoomSettings;
  setRoomSettings: React.Dispatch<React.SetStateAction<RoomSettings>>;
  copied: boolean;
  gameStateRef: React.RefObject<GameState>;
  p2pRef: React.RefObject<P2PConnection | null>;
  isHostRef: React.RefObject<boolean>;

  handleCreateRoom: () => Promise<void>;
  handleJoinRoom: (spectator?: boolean) => Promise<void>;
  handlePlaySolo: () => Promise<void>;
  handleStartGame: () => void;
  handleExitRoom: () => void;
  handleCopyLink: () => void;
  handleSwitchToSpectator: () => void;
  handleJoinFromSpectator: () => Promise<void>;
  syncGameState: (state: GameState) => void;
  sendAction: (action: PlayerActionKind) => void;
  sendBet: (bet: number) => void;
  sendNewRound: () => void;
}

export function useRoomConnection(): UseRoomConnectionReturn {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [playerName, setPlayerName] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? '';
  });
  const [roomCode, setRoomCode] = useState('');
  // Read room code from URL
  const [initialRoomCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    return code ? code.toUpperCase() : '';
  });
  const [inputRoomCode, setInputRoomCode] = useState(initialRoomCode);
  const [error, setError] = useState('');
  const [balance, setLocalBalance] = useState(1000);
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());
  const [connectionStatus, setConnectionStatus] = useState('');
  const [localToast, setLocalToast] = useState('');
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setLocalToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setLocalToast(''), 3000);
  }, []);

  const [myId, setMyId] = useState('');
  const [isSpectator, setIsSpectator] = useState(false);
  const [copied, setCopied] = useState(false);
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);

  const p2pRef = useRef<P2PConnection | null>(null);
  const isHostRef = useRef(false);
  const [isHost, setIsHost] = useState(false);
  const gameStateRef = useRef(gameState);
  const myIdRef = useRef(myId);
  const lastSyncedBalanceRef = useRef<number | null>(null);
  // BUG-FIX: Track when a non-host spectator has requested to join as a player.
  // This defers the `isSpectator = false` flip until the host confirms the join
  // via a `game-state-sync` that includes the player. Without this, the UI
  // showed player controls immediately but the game state didn't have the player yet.
  const pendingJoinRef = useRef(false);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const trimmedName = playerName.trim();
    if (trimmedName) {
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
      return;
    }

    window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
  }, [playerName]);
  useEffect(() => {
    if (connectionStatus !== 'Rejoining for next round...') return;
    if (!myId || isSpectator) return;
    if (gameState.phase !== 'betting') return;
    if (!gameState.players[myId]) return;

    const timeout = window.setTimeout(() => {
      setConnectionStatus((current) => (current === 'Rejoining for next round...' ? '' : current));
      showToast('Connected!');
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [connectionStatus, gameState.phase, gameState.players, isSpectator, myId, showToast]);

  const createPlayerState = useCallback(
    (id: string, name: string, playerBalance: number, waitingForNextRound = false): PlayerState => ({
      id,
      name,
      balance: playerBalance,
      hands: [waitingForNextRound ? { ...createEmptyHand(), stood: true } : createEmptyHand()],
      activeHandIndex: 0,
      ready: waitingForNextRound,
    }),
    []
  );

  const resetRoomState = useCallback((nextError = '') => {
    const activeP2P = p2pRef.current;
    p2pRef.current = null;
    activeP2P?.disconnect();
    setScreen('lobby');
    setRoomCode('');
    setInputRoomCode('');
    myIdRef.current = '';
    setMyId('');
    setIsSpectator(false);
    setGameState(createInitialGameState());
    setConnectionStatus('');
    setLocalToast('');
    setCopied(false);
    isHostRef.current = false;
    setIsHost(false);
    setError(nextError);
    lastSyncedBalanceRef.current = null;
  }, []);

  // Load balance on mount
  useEffect(() => {
    getBalance().then(setLocalBalance);
  }, []);

  // Sync game state to peers (host only)
  const syncGameState = useCallback((state: GameState) => {
    setGameState(state);
    if (p2pRef.current && isHostRef.current) {
      // Strip deck from broadcasts to prevent card data leaking to non-host peers
      const stateToSync = { ...state, deck: [] };
      p2pRef.current.send({
        type: 'game-state-sync',
        payload: stateToSync,
        senderId: 'host',
      });
    }
  }, []);

  // Host-authoritative: apply a player action on the host side
  const applyActionOnHost = useCallback((playerId: string, action: PlayerActionKind) => {
    setGameState((prev) => {
      let newState: GameState;
      switch (action) {
        case 'hit':
          newState = playerHit(prev, playerId);
          break;
        case 'stand':
          newState = playerStand(prev, playerId);
          break;
        case 'double':
          newState = playerDoubleDown(prev, playerId);
          break;
        case 'split':
          newState = playerSplit(prev, playerId);
          break;
        case 'surrender':
          newState = playerSurrender(prev, playerId);
          break;
        case 'insure':
          newState = playerInsure(prev, playerId);
          break;
        case 'decline-insurance':
          // No-op on game state, just dismiss prompt on client
          newState = prev;
          break;
        default:
          newState = prev;
      }
      // Broadcast the canonical state (strip deck to prevent card leak)
      if (p2pRef.current) {
        p2pRef.current.send({
          type: 'game-state-sync',
          payload: { ...newState, deck: [] },
          senderId: 'host',
        });
      }
      return newState;
    });
  }, []);

  // Handle P2P messages
  const handleMessage = useCallback(
    (msg: GameMessage) => {
      switch (msg.type) {
        case 'player-join': {
            const { name, balance: pBalance } = msg.payload as {
              name: string; balance: number; peerId: string;
          };
            const peerId = msg.senderId;
          setGameState((prev) => {
            const joiningMidRound = prev.tableOpen && prev.phase !== 'betting';
            const newState = {
              ...prev,
              players: {
                ...prev.players,
                [peerId]: createPlayerState(peerId, name, pBalance, joiningMidRound),
              },
            };
            if (isHostRef.current) {
              // BUG-FIX: Use sendTo for targeted initial sync instead of
              // broadcasting to ALL peers. Also strip the deck from the synced
              // state to avoid leaking card data to non-host clients.
              setTimeout(() => {
                const stateToSync = { ...gameStateRef.current, deck: [] };
                p2pRef.current?.send({ type: 'game-state-sync', payload: stateToSync, senderId: 'host' });
                p2pRef.current?.sendTo(peerId, { type: 'room-settings-sync', payload: newState.settings, senderId: 'host' });
              }, 500);
            }
            return newState;
          });
          showToast(
            gameStateRef.current.tableOpen && gameStateRef.current.phase !== 'betting'
              ? `${name} will join next round`
              : `${name} joined!`
          );
          break;
        }
        case 'spectator-join': {
          const { name } = msg.payload as { name: string };
          showToast(`${name} is spectating`);
          // BUG-FIX: Send targeted initial game state to the spectator so they
          // see the current table. We strip the deck to avoid leaking card info.
          if (isHostRef.current && p2pRef.current) {
            const stateForSpectator = { ...gameStateRef.current, deck: [] };
            p2pRef.current.sendTo(msg.senderId, {
              type: 'game-state-sync',
              payload: stateForSpectator,
              senderId: 'host',
            });
          }
          break;
        }
        case 'player-bet': {
          if (!isHostRef.current) break; // Only host processes bets
          const { playerId, bet } = msg.payload as { playerId: string; bet: number };
          setGameState((prev) => {
            if (playerId !== msg.senderId) return prev;
            if (prev.phase !== 'betting') return prev;
            const player = prev.players[playerId];
            if (!player) return prev;
            if (player.ready) return prev;
            if (bet <= 0 || bet > player.balance) return prev; // Validate bet
            const newState = {
              ...prev,
              tableMessage: undefined,
              players: {
                ...prev.players,
                [playerId]: {
                  ...player,
                  hands: [{ ...player.hands[0], bet }],
                  balance: player.balance - bet,
                  ready: true,
                },
              },
            };
            // Broadcast canonical state (deck stripped for security)
            p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
            return newState;
          });
          break;
        }
        case 'player-action': {
          if (!isHostRef.current) break; // Only host processes actions
          const { playerId, action } = msg.payload as { playerId: string; action: PlayerActionKind };
          if (playerId !== msg.senderId) break;
          if (gameStateRef.current.phase !== 'playing') break;
          applyActionOnHost(playerId, action);
          break;
        }
        case 'game-state-sync': {
          // Non-host receives canonical state from host
          if (!isHostRef.current) {
            const nextState = msg.payload as GameState;
            setGameState(nextState);
            // Clear connection banners (e.g. "Waiting for leader...") when the
            // table opens for the first time.
            if (nextState.tableOpen) {
              setConnectionStatus((s) =>
                s === 'Waiting for leader...' || s === 'Connecting...' ? '' : s
              );
            }
            const currentMyId = myIdRef.current;
            const me = currentMyId ? nextState.players[currentMyId] : undefined;
            if (me) {
              const nextBalance = me.balance <= 0 ? 100 : me.balance;
              if (lastSyncedBalanceRef.current !== nextBalance) {
                lastSyncedBalanceRef.current = nextBalance;
                setLocalBalance(nextBalance);
                void setBalance(nextBalance);
              }
              // BUG-FIX: Only flip `isSpectator` to false when the join was
              // explicitly requested via `handleJoinFromSpectator`. Previously,
              // this line ran on EVERY sync, so a spectator whose peerId
              // happened to exist in `players` (e.g., from a stale entry after
              // leaving and rejoining as spectator) would be incorrectly
              // flipped back to player mode.
              if (pendingJoinRef.current) {
                pendingJoinRef.current = false;
                setIsSpectator(false);
              }
            }
          }
          break;
        }
        case 'room-settings-sync': {
          if (!isHostRef.current) {
            const settings = msg.payload as RoomSettings;
            setRoomSettings(settings);
            setGameState((prev) => ({ ...prev, settings }));
          }
          break;
        }
        case 'new-round': {
          if (!isHostRef.current) {
            if (msg.senderId !== gameStateRef.current.hostId) break;
            setGameState((prev) => (prev.phase === 'results' ? startNewRound(prev) : prev));
          }
          break;
        }
        case 'player-leave': {
          const { playerId, name } = msg.payload as { playerId: string; name: string };
          setGameState((prev) => {
            const newPlayers = { ...prev.players };
            delete newPlayers[playerId];
            return { ...prev, players: newPlayers };
          });
          showToast(`${name} left`);
          break;
        }
        case 'player-spectate': {
          const { playerId, name } = msg.payload as { playerId: string; name: string };
          setGameState((prev) => {
            const newPlayers = { ...prev.players };
            delete newPlayers[playerId];
            return { ...prev, players: newPlayers };
          });
          showToast(`${name} is now spectating`);
          break;
        }
      }
    },
    [applyActionOnHost, createPlayerState, showToast]
  );

  const attachPeerListeners = useCallback((p2p: P2PConnection) => {
    p2p.onMessage(handleMessage);
    p2p.onPeerDisconnect(() => {
      if (p2pRef.current !== p2p) return;
      if (!isHostRef.current && p2p.connectedPeers.length === 0) {
        resetRoomState('The leader left. The room has been closed.');
      }
    });
  }, [handleMessage, resetRoomState]);

  // Send an action intent (non-host sends to host; host applies directly)
  const sendAction = useCallback((action: PlayerActionKind) => {
    if (isHostRef.current) {
      applyActionOnHost(myId, action);
    } else {
      p2pRef.current?.send({
        type: 'player-action',
        payload: { playerId: myId, action },
        senderId: myId,
      });
    }
  }, [applyActionOnHost, myId]);

  // Send a bet (non-host sends to host; host applies directly)
  const sendBet = useCallback((bet: number) => {
    if (isHostRef.current) {
      setGameState((prev) => {
        const player = prev.players[myId];
        if (!player || bet <= 0 || bet > player.balance) return prev;

        const newState = {
          ...prev,
          tableMessage: undefined,
          players: {
            ...prev.players,
            [myId]: {
              ...player,
              hands: [{ ...player.hands[0], bet }],
              balance: player.balance - bet,
              ready: true,
            },
          },
        };

        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
      return;
    }

    p2pRef.current?.send({
      type: 'player-bet',
      payload: { playerId: myId, bet },
      senderId: myId,
    });
  }, [myId]);

  const sendNewRound = useCallback(() => {
    if (p2pRef.current) {
      p2pRef.current.send({ type: 'new-round', payload: {}, senderId: myId });
    }
  }, [myId]);

  // ==================== Room Management ====================

  const handleCreateRoom = useCallback(async () => {
    if (!playerName.trim()) { setError('Enter your name!'); return; }
    setError('');
    try {
      const p2p = new P2PConnection();
      p2pRef.current = p2p;
      const code = await p2p.createRoom();
      setRoomCode(code);
      const peerId = p2p.peerId;
      myIdRef.current = peerId;
      setMyId(peerId);
      isHostRef.current = true;
      setIsHost(true);
      attachPeerListeners(p2p);
      const bal = await getBalance();
      setLocalBalance(bal);
      lastSyncedBalanceRef.current = bal;
      setGameState({
        ...createInitialGameState(roomSettings),
        hostId: peerId,
        hostName: playerName,
        players: {
          [peerId]: createPlayerState(peerId, playerName, bal),
        },
      });
      setScreen('waiting');
      setConnectionStatus('Waiting for players...');
    } catch (err) {
      setError(`Failed to create room: ${err}`);
    }
  }, [attachPeerListeners, createPlayerState, playerName, roomSettings]);

  const handleJoinRoom = useCallback(async (spectator = false) => {
    if (!playerName.trim()) { setError('Enter your name!'); return; }
    if (!inputRoomCode.trim()) { setError('Enter room code!'); return; }
    setError('');
    setConnectionStatus('Connecting...');
    try {
      const p2p = new P2PConnection();
      p2pRef.current = p2p;
      attachPeerListeners(p2p);
      await p2p.joinRoom(inputRoomCode.trim(), spectator);
      const peerId = p2p.peerId;
      myIdRef.current = peerId;
      setMyId(peerId);
      isHostRef.current = false;
      setIsHost(false);
      setRoomCode(inputRoomCode.trim().toUpperCase());
      setIsSpectator(spectator);
      if (spectator) {
        p2p.send({ type: 'spectator-join', payload: { name: playerName }, senderId: peerId });
      } else {
        const bal = await getBalance();
        setLocalBalance(bal);
        lastSyncedBalanceRef.current = bal;
        p2p.send({ type: 'player-join', payload: { name: playerName, balance: bal, peerId }, senderId: peerId });
      }
      setScreen('waiting');
      setConnectionStatus(spectator ? 'Spectating' : 'Waiting for leader...');
    } catch (err) {
      setError(`Failed to join: ${err}`);
      setConnectionStatus('');
    }
  }, [attachPeerListeners, inputRoomCode, playerName]);

  const handlePlaySolo = useCallback(async () => {
    if (!playerName.trim()) { setError('Enter your name!'); return; }
    setError('');
    myIdRef.current = 'solo-player';
    setMyId('solo-player');
    isHostRef.current = true;
    setIsHost(true);
    const bal = await getBalance();
    setLocalBalance(bal);
    lastSyncedBalanceRef.current = bal;
    setGameState({
      ...createInitialGameState(roomSettings),
      tableOpen: true,
      hostId: 'solo-player',
      hostName: playerName,
      players: {
        'solo-player': createPlayerState('solo-player', playerName, bal),
      },
    });
    setScreen('game');
  }, [createPlayerState, playerName, roomSettings]);

  const handleStartGame = useCallback(() => {
    if (!isHostRef.current) return;

    setGameState((prev) => {
      if (prev.tableOpen) return prev;

      const newState = {
        ...prev,
        tableOpen: true,
      };

      p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
      return newState;
    });

    setScreen('game');
    setConnectionStatus('');
    showToast('Table open');
  }, [showToast]);

  const handleExitRoom = useCallback(() => {
    // When a player leaves mid-game, their active bet is forfeited.
    // The bet was already deducted from `balance` at bet-time, so we simply
    // remove them from state. The money is gone — this prevents "rage-quit
    // to preserve money" cheating. If their balance is $0 after losing,
    // the $100 floor kicks in at round-resolution time, not here.
    if (p2pRef.current) {
      p2pRef.current.send({ type: 'player-leave', payload: { playerId: myId, name: playerName }, senderId: myId });
    }

    // If host is leaving, also clean themselves from game state
    if (isHostRef.current) {
      setGameState((prev) => {
        const newPlayers = { ...prev.players };
        delete newPlayers[myId];
        const newState = { ...prev, players: newPlayers };
        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
    }

    resetRoomState();
  }, [myId, playerName, resetRoomState]);

  const handleSwitchToSpectator = useCallback(() => {
    if (isSpectator) return;

    if (isHostRef.current) {
      setGameState((prev) => {
        const newPlayers = { ...prev.players };
        delete newPlayers[myId];
        const newState = { ...prev, players: newPlayers };
        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
    } else if (p2pRef.current) {
      p2pRef.current.send({ type: 'player-spectate', payload: { playerId: myId, name: playerName }, senderId: myId });
      setGameState((prev) => {
        const newPlayers = { ...prev.players };
        delete newPlayers[myId];
        return { ...prev, players: newPlayers };
      });
    }

    setIsSpectator(true);
    setConnectionStatus('Spectating');
  }, [myId, playerName, isSpectator]);

  const handleJoinFromSpectator = useCallback(async () => {
    if (!isSpectator) return;
    const bal = await getBalance();
    setLocalBalance(bal);
    lastSyncedBalanceRef.current = bal;

    const waitingForNextRound = gameStateRef.current.tableOpen && gameStateRef.current.phase !== 'betting';

    if (isHostRef.current) {
      setGameState((prev) => {
        const newState = {
          ...prev,
          players: {
            ...prev.players,
            [myId]: createPlayerState(myId, playerName, bal, waitingForNextRound),
          },
        };

        p2pRef.current?.send({ type: 'game-state-sync', payload: { ...newState, deck: [] }, senderId: 'host' });
        return newState;
      });
      // Host has authoritative state — safe to flip immediately
      setIsSpectator(false);
    } else if (p2pRef.current) {
      // BUG-FIX: Instead of immediately setting isSpectator(false), mark a
      // pending join. The actual flip happens in the `game-state-sync` handler
      // once the host confirms the player was added. This prevents a brief
      // window where the UI shows player controls but the game state has no
      // player entry — causing broken rendering (no hands, no bet panel).
      pendingJoinRef.current = true;
      p2pRef.current.send({ type: 'player-join', payload: { name: playerName, balance: bal, peerId: myId }, senderId: myId });
    }

    if (waitingForNextRound) {
      setConnectionStatus('Rejoining for next round...');
    } else {
      setConnectionStatus('');
      showToast('Connected!');
    }
  }, [createPlayerState, isSpectator, myId, playerName, showToast]);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomCode]);

  const resolvedScreen = screen === 'lobby' ? 'lobby' : gameState.tableOpen ? 'game' : 'waiting';

  return {
    screen: resolvedScreen, setScreen,
    playerName, setPlayerName,
    inputRoomCode, setInputRoomCode,
    roomCode, error, connectionStatus, localToast,
    myId, isSpectator,
    isHost,
    gameState, setGameState,
    balance, setLocalBalance,
    roomSettings, setRoomSettings,
    copied,
    gameStateRef, p2pRef, isHostRef,
    handleCreateRoom, handleJoinRoom, handlePlaySolo,
    handleStartGame, handleExitRoom,
    handleCopyLink,
    handleSwitchToSpectator, handleJoinFromSpectator,
    syncGameState, sendAction, sendBet, sendNewRound,
  };
}
