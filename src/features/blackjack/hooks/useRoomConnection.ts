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
  sanitizeStateForBroadcast,
  isDealerBlackjackPending,
} from '@/features/blackjack/lib/blackjack';
import { isValidBet, sanitizeJoinBalance, sanitizePlayerName } from '@/features/blackjack/lib/validation';
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

  // Host-authoritative broadcast: whenever canonical state commits, replicate
  // the sanitized version (no deck, hole card masked) to all peers. Keeping the
  // send OUT of setState updaters keeps the updaters pure — React may invoke an
  // updater more than once (StrictMode, interrupted renders), and a send inside
  // one can broadcast a transient state that never actually commits.
  useEffect(() => {
    if (!isHostRef.current || !p2pRef.current) return;
    p2pRef.current.send({
      type: 'game-state-sync',
      payload: sanitizeStateForBroadcast(gameState),
      senderId: 'host',
    });
  }, [gameState]);

  // Host wallet persistence: mirror of the peer-side `game-state-sync` handler.
  // Whenever authoritative state changes the host's own balance, persist it.
  useEffect(() => {
    if (!isHostRef.current) return;
    const me = myId ? gameState.players[myId] : undefined;
    if (!me) return;
    const nextBalance = gameState.phase === 'results' && me.balance <= 0 ? 100 : me.balance;
    if (lastSyncedBalanceRef.current !== nextBalance) {
      lastSyncedBalanceRef.current = nextBalance;
      setLocalBalance(nextBalance);
      void setBalance(nextBalance);
    }
  }, [gameState, myId]);

  // Set canonical state on the host; replication happens in the effect above.
  const syncGameState = useCallback((state: GameState) => {
    setGameState(state);
  }, []);

  // Host-authoritative: apply a player action on the host side
  const applyActionOnHost = useCallback((playerId: string, action: PlayerActionKind) => {
    setGameState((prev) => {
      // While the dealer holds a still-hidden blackjack the round is already
      // decided; only insurance decisions are accepted until the reveal.
      if (
        prev.phase === 'playing' &&
        action !== 'insure' &&
        action !== 'decline-insurance' &&
        isDealerBlackjackPending(prev)
      ) {
        return prev;
      }
      // Invalid actions are rejected silently (state identity unchanged → no
      // broadcast): a peer's optimistic balance is walked back by the next
      // authoritative sync, and invalid message spam cannot amplify into
      // broadcasts or timer reschedules.
      switch (action) {
        case 'hit':
          return playerHit(prev, playerId);
        case 'stand':
          return playerStand(prev, playerId);
        case 'double':
          return playerDoubleDown(prev, playerId);
        case 'split':
          return playerSplit(prev, playerId);
        case 'surrender':
          return playerSurrender(prev, playerId);
        case 'insure':
          return playerInsure(prev, playerId);
        case 'decline-insurance':
          // No-op on game state, just dismiss prompt on client
          return prev;
        default:
          return prev;
      }
    });
  }, []);

  // Handle P2P messages
  const handleMessage = useCallback(
    (msg: GameMessage) => {
      switch (msg.type) {
        case 'player-join': {
          if (!isHostRef.current) break; // Only the host seats players
          const peerId = msg.senderId;
          const payload = msg.payload as { name?: unknown; balance?: unknown };
          const name = sanitizePlayerName(payload?.name);
          const pBalance = sanitizeJoinBalance(payload?.balance);
          if (!name) break; // Malformed join — ignore
          // A re-sent join must not reset a live seat (it would refund a bet
          // the host already applied and restore a client-declared balance).
          if (gameStateRef.current.players[peerId]) break;
          setGameState((prev) => {
            if (prev.players[peerId]) return prev;
            const joiningMidRound = prev.tableOpen && prev.phase !== 'betting';
            return {
              ...prev,
              players: {
                ...prev.players,
                [peerId]: createPlayerState(peerId, name, pBalance, joiningMidRound),
              },
            };
          });
          // The full state broadcast (including this joiner's first sync) is
          // handled automatically by the game-state-sync effect once the
          // state above commits. Only the targeted room-settings-sync needs
          // to be sent explicitly here, since that message type is never
          // part of the regular broadcast.
          p2pRef.current?.sendTo(peerId, {
            type: 'room-settings-sync',
            payload: gameStateRef.current.settings,
            senderId: 'host',
          });
          showToast(
            gameStateRef.current.tableOpen && gameStateRef.current.phase !== 'betting'
              ? `${name} will join next round`
              : `${name} joined!`
          );
          break;
        }
        case 'spectator-join': {
          const name = sanitizePlayerName((msg.payload as { name?: unknown })?.name);
          if (name) showToast(`${name} is spectating`);
          // Send targeted initial game state to the spectator so they see the
          // current table (sanitized: no deck, hole card masked).
          if (isHostRef.current && p2pRef.current) {
            p2pRef.current.sendTo(msg.senderId, {
              type: 'game-state-sync',
              payload: sanitizeStateForBroadcast(gameStateRef.current),
              senderId: 'host',
            });
          }
          break;
        }
        case 'player-bet': {
          if (!isHostRef.current) break; // Only host processes bets
          const { playerId, bet } = msg.payload as { playerId?: unknown; bet?: unknown };
          if (playerId !== msg.senderId) break;
          setGameState((prev) => {
            if (prev.phase !== 'betting') return prev;
            const player = prev.players[msg.senderId];
            if (!player) return prev;
            if (player.ready) return prev;
            if (!isValidBet(bet, player.balance)) return prev;
            return {
              ...prev,
              tableMessage: undefined,
              players: {
                ...prev.players,
                [msg.senderId]: {
                  ...player,
                  hands: [{ ...player.hands[0], bet }],
                  balance: player.balance - bet,
                  ready: true,
                },
              },
            };
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
              // Always reconcile the displayed balance with the canonical value,
              // even if it matches what we last persisted — an optimistic local
              // update (e.g. a double/split the host ends up rejecting) can drift
              // the UI away from that same canonical number, and the drift would
              // otherwise never get corrected. Only gate the (async, signed)
              // localStorage write on an actual change, since that runs on every
              // sync otherwise.
              if (lastSyncedBalanceRef.current !== nextBalance) {
                lastSyncedBalanceRef.current = nextBalance;
                void setBalance(nextBalance);
              }
              setLocalBalance(nextBalance);
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
          // A peer may only remove itself; the seat name comes from our own
          // state, never from the untrusted payload.
          const { playerId } = msg.payload as { playerId?: unknown };
          if (playerId !== msg.senderId) break;
          const name = gameStateRef.current.players[msg.senderId]?.name;
          setGameState((prev) => {
            if (!prev.players[msg.senderId]) return prev;
            const newPlayers = { ...prev.players };
            delete newPlayers[msg.senderId];
            return { ...prev, players: newPlayers };
          });
          if (name) showToast(`${name} left`);
          break;
        }
        case 'player-spectate': {
          const { playerId } = msg.payload as { playerId?: unknown };
          if (playerId !== msg.senderId) break;
          const name = gameStateRef.current.players[msg.senderId]?.name;
          setGameState((prev) => {
            if (!prev.players[msg.senderId]) return prev;
            const newPlayers = { ...prev.players };
            delete newPlayers[msg.senderId];
            return { ...prev, players: newPlayers };
          });
          if (name) showToast(`${name} is now spectating`);
          break;
        }
      }
    },
    [applyActionOnHost, createPlayerState, showToast]
  );

  const attachPeerListeners = useCallback((p2p: P2PConnection) => {
    p2p.onMessage(handleMessage);
    p2p.onPeerDisconnect((peerId) => {
      if (p2pRef.current !== p2p) return;

      if (isHostRef.current) {
        // A peer's connection dropped (closed tab, crash, lost network) without
        // ever sending a graceful `player-leave`. Remove them ourselves —
        // otherwise they sit at the table forever as a ghost seat nobody can
        // act for, blocking the round. The state broadcast is handled
        // automatically by the game-state-sync effect once this commits.
        const leaving = gameStateRef.current.players[peerId];
        setGameState((prev) => {
          if (!prev.players[peerId]) return prev;
          const newPlayers = { ...prev.players };
          delete newPlayers[peerId];
          return { ...prev, players: newPlayers };
        });
        if (leaving) showToast(`${leaving.name} disconnected`);
        return;
      }

      if (p2p.connectedPeers.length === 0) {
        resetRoomState('The leader left. The room has been closed.');
      }
    });
  }, [handleMessage, resetRoomState, showToast]);

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
        if (prev.phase !== 'betting') return prev;
        const player = prev.players[myId];
        if (!player || player.ready) return prev;
        if (!isValidBet(bet, player.balance)) return prev;

        return {
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

    setGameState((prev) => (prev.tableOpen ? prev : { ...prev, tableOpen: true }));

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

    // The host leaving destroys the room; peers detect the transport close
    // and reset themselves, so no final state broadcast is needed.
    resetRoomState();
  }, [myId, playerName, resetRoomState]);

  const handleSwitchToSpectator = useCallback(() => {
    if (isSpectator) return;

    if (isHostRef.current) {
      setGameState((prev) => {
        const newPlayers = { ...prev.players };
        delete newPlayers[myId];
        return { ...prev, players: newPlayers };
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
      setGameState((prev) => ({
        ...prev,
        players: {
          ...prev.players,
          [myId]: createPlayerState(myId, playerName, bal, waitingForNextRound),
        },
      }));
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
