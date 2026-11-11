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
  playerDeclineInsurance,
  startNewRound,
  sanitizeStateForBroadcast,
  isDealerBlackjackPending,
} from '@/features/blackjack/lib/blackjack';
import {
  isRecord,
  isValidBet,
  isValidPlayerAction,
  isValidGameStateSync,
  sanitizeClientId,
  sanitizeJoinBalance,
  sanitizePlayerName,
  sanitizeRoomSettings,
  MAX_TABLE_SEATS,
  ROOM_CODE_PATTERN,
} from '@/features/blackjack/lib/validation';
import { P2PConnection, GameMessage, PlayerActionKind } from '@/features/blackjack/lib/p2p';
import { getBalance, setBalance } from '@/features/blackjack/lib/wallet';
import { readStorage, writeStorage, removeStorage } from '@/shared/lib/storage';
import { EntryGate } from '@/features/blackjack/lib/entry';
import type { EntryAction, RoomError, ConnectionStatus } from '@/features/blackjack/lib/entry';
import { isBettingOpen } from '@/features/blackjack/lib/clock';
import { useLanguage } from '@/shared/i18n/useLanguage';

export type Screen = 'lobby' | 'waiting' | 'game';

const PLAYER_NAME_STORAGE_KEY = 'bj_player_name';
const CLIENT_ID_STORAGE_KEY = 'bj_client_id';

function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return 'server-client';
  const stored = sanitizeClientId(readStorage(CLIENT_ID_STORAGE_KEY));
  if (stored) return stored;
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const generated = `cid_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  writeStorage(CLIENT_ID_STORAGE_KEY, generated);
  return generated;
}

interface UseRoomConnectionReturn {
  screen: Screen;
  setScreen: (s: Screen) => void;
  playerName: string;
  setPlayerName: (n: string) => void;
  inputRoomCode: string;
  setInputRoomCode: (c: string) => void;
  roomCode: string;
  error: RoomError | null;
  clearError: () => void;
  pendingAction: EntryAction | null;
  handleCancelEntry: () => void;
  sessionKey: number;
  clockOffsetMs: number | null;
  connectionStatus: ConnectionStatus;
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
  const { t } = useLanguage();
  const [screen, setScreen] = useState<Screen>('lobby');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [entryHydrated, setEntryHydrated] = useState(false);
  const [error, setError] = useState<RoomError | null>(null);
  const [pendingAction, setPendingAction] = useState<EntryAction | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const sessionRef = useRef(0);
  const [clockOffsetMs, setClockOffsetMs] = useState<number | null>(null);
  const entryGate = useRef(new EntryGate());
  const expectedHostRef = useRef('');
  const [balance, setLocalBalance] = useState(1000);
  const [gameState, setGameState] = useState<GameState>(() => createInitialGameState());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('');
  const [localToast, setLocalToast] = useState('');
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const hostPlayerBalancesRef = useRef<Map<string, number>>(new Map());
  const peerClientMapRef = useRef<Map<string, string>>(new Map());
  const recordHostPlayerBalance = useCallback((peerId: string, bal: number) => {
    hostPlayerBalancesRef.current.set(peerId, bal);
    const cid = peerClientMapRef.current.get(peerId);
    if (cid) {
      hostPlayerBalancesRef.current.set(`cid:${cid}`, bal);
    }
  }, []);
  // BUG-FIX: Track when a non-host spectator has requested to join as a player.
  // This defers the `isSpectator = false` flip until the host confirms the join
  // via a `game-state-sync` that includes the player. Without this, the UI
  // showed player controls immediately but the game state didn't have the player yet.
  const pendingJoinRef = useRef(false);
  const seatJoinRef = useRef(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPlayerName(sanitizePlayerName(readStorage(PLAYER_NAME_STORAGE_KEY)) ?? '');
      const code = new URLSearchParams(window.location.search).get('room') ?? '';
      setInputRoomCode(code.replace(/\s+/g, '').toUpperCase());
      setEntryHydrated(true);
    });
    const gate = entryGate.current;
    return () => {
      active = false;
      gate.cancel();
      const connection = p2pRef.current;
      p2pRef.current = null;
      connection?.disconnect();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);
  useEffect(() => {
    gameStateRef.current = gameState;
    if (isHostRef.current) {
      for (const [pid, p] of Object.entries(gameState.players)) {
        recordHostPlayerBalance(pid, p.balance);
      }
    }
  }, [gameState, recordHostPlayerBalance]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  useEffect(() => {
    if (!entryHydrated) return;

    const trimmedName = playerName.trim();
    if (trimmedName) {
      writeStorage(PLAYER_NAME_STORAGE_KEY, playerName);
      return;
    }

    removeStorage(PLAYER_NAME_STORAGE_KEY);
  }, [entryHydrated, playerName]);
  useEffect(() => {
    if (connectionStatus !== 'joiningNextRound') return;
    if (!myId || isSpectator) return;
    if (gameState.phase !== 'betting') return;
    if (!gameState.players[myId]) return;

    const timeout = window.setTimeout(() => {
      setConnectionStatus((current) => (current === 'joiningNextRound' ? '' : current));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [connectionStatus, gameState.phase, gameState.players, isSpectator, myId]);

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

  const resetRoomState = useCallback((nextError: RoomError | null = null) => {
    entryGate.current.cancel();
    setPendingAction(null);
    setClockOffsetMs(null);
    expectedHostRef.current = '';
    pendingJoinRef.current = false;
    seatJoinRef.current = false;
    sessionRef.current += 1;
    setSessionKey(sessionRef.current);
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
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    isHostRef.current = false;
    setIsHost(false);
    setError(nextError);
    lastSyncedBalanceRef.current = null;
    hostPlayerBalancesRef.current.clear();
    peerClientMapRef.current.clear();
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
          return playerDeclineInsurance(prev, playerId);
        default:
          return prev;
      }
    });
  }, []);

  // Handle P2P messages
  const handleMessage = useCallback(
    (msg: GameMessage) => {
      if (!isRecord(msg)) return;

      switch (msg.type) {
        case 'player-join': {
          if (!isHostRef.current) break; // Only the host seats players
          const peerId = msg.senderId;
          if (!isRecord(msg.payload)) break;
          const payload = msg.payload as { name?: unknown; balance?: unknown; clientId?: unknown };
          const name = sanitizePlayerName(payload?.name);
          if (!name) break; // Malformed join — ignore

          const clientId = sanitizeClientId(payload?.clientId);
          if (clientId) {
            peerClientMapRef.current.set(peerId, clientId);
          }
          const recordedByClient = clientId ? hostPlayerBalancesRef.current.get(`cid:${clientId}`) : undefined;
          const recordedByPeer = hostPlayerBalancesRef.current.get(peerId);
          const recordedBalance = recordedByClient ?? recordedByPeer;
          const rawBalance = recordedBalance !== undefined ? recordedBalance : sanitizeJoinBalance(payload?.balance);
          const pBalance = rawBalance <= 0 && recordedBalance !== undefined ? 100 : rawBalance;
          recordHostPlayerBalance(peerId, pBalance);

          // A re-sent join must not reset a live seat (it would refund a bet
          // the host already applied and restore a client-declared balance).
          if (gameStateRef.current.players[peerId]) break;
          if (Object.keys(gameStateRef.current.players).length >= MAX_TABLE_SEATS) {
            p2pRef.current?.sendTo(peerId, {
              type: 'game-state-sync',
              payload: sanitizeStateForBroadcast(gameStateRef.current),
              senderId: 'host',
            });
            p2pRef.current?.sendTo(peerId, {
              type: 'room-settings-sync',
              payload: gameStateRef.current.settings,
              senderId: 'host',
            });
            break;
          }
          setGameState((prev) => {
            if (prev.players[peerId] || Object.keys(prev.players).length >= MAX_TABLE_SEATS) return prev;
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
          if (!isRecord(msg.payload)) break;
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
          if (!isRecord(msg.payload)) break;
          const { playerId, bet } = msg.payload as { playerId?: unknown; bet?: unknown };
          if (typeof playerId !== 'string' || playerId !== msg.senderId) break;
          setGameState((prev) => {
            if (!isBettingOpen(prev)) return prev;
            const player = prev.players[msg.senderId];
            if (!player) return prev;
            if (player.ready) return prev;
            if (!isValidBet(bet, player.balance)) return prev;
            const remainingBalance = player.balance - (bet as number);
            recordHostPlayerBalance(msg.senderId, remainingBalance);
            return {
              ...prev,
              tableMessage: undefined,
              players: {
                ...prev.players,
                [msg.senderId]: {
                  ...player,
                  hands: [{ ...player.hands[0], bet: bet as number }],
                  balance: remainingBalance,
                  ready: true,
                },
              },
            };
          });
          break;
        }
        case 'player-action': {
          if (!isHostRef.current) break; // Only host processes actions
          if (!isRecord(msg.payload)) break;
          const { playerId, action } = msg.payload as { playerId?: unknown; action?: unknown };
          if (typeof playerId !== 'string' || playerId !== msg.senderId) break;
          if (!isValidPlayerAction(action)) break;
          if (gameStateRef.current.phase !== 'playing') break;
          applyActionOnHost(playerId, action);
          break;
        }
        case 'game-state-sync': {
          // Non-host receives canonical state from host
          if (!isHostRef.current) {
            const expectedHostId = expectedHostRef.current;
            if (expectedHostId && msg.senderId !== expectedHostId) break;
            if (!isValidGameStateSync(msg.payload)) break;
            const nextState = msg.payload;
            setGameState(nextState);
            // Clear connection banners (e.g. "Waiting for leader...") when the
            // table opens for the first time.
            if (nextState.tableOpen) {
              setConnectionStatus((s) =>
                s === 'waitingForHost' || s === 'connecting' ? '' : s
              );
            }
            const currentMyId = myIdRef.current;
            const me = currentMyId ? nextState.players[currentMyId] : undefined;
            if (me) {
              const nextBalance = nextState.phase === 'results' && me.balance <= 0 ? 100 : me.balance;
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
            const expectedHostId = expectedHostRef.current;
            if (expectedHostId && msg.senderId !== expectedHostId) break;
            const settings = sanitizeRoomSettings(msg.payload);
            if (!settings) break;
            setRoomSettings(settings);
            setGameState((prev) => ({ ...prev, settings }));
          }
          break;
        }
        case 'new-round': {
          if (!isHostRef.current) {
            const expectedHostId = expectedHostRef.current;
            if (expectedHostId && msg.senderId !== expectedHostId) break;
            setGameState((prev) => (prev.phase === 'results' ? startNewRound(prev) : prev));
          }
          break;
        }
        case 'player-leave': {
          if (!isHostRef.current) break;
          // A peer may only remove itself; the seat name comes from our own
          // state, never from the untrusted payload.
          if (!isRecord(msg.payload)) break;
          const { playerId } = msg.payload as { playerId?: unknown };
          if (typeof playerId !== 'string' || playerId !== msg.senderId) break;
          const existing = gameStateRef.current.players[msg.senderId];
          if (existing) {
            recordHostPlayerBalance(msg.senderId, existing.balance);
          }
          const name = existing?.name;
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
          if (!isHostRef.current) break;
          if (!isRecord(msg.payload)) break;
          const { playerId } = msg.payload as { playerId?: unknown };
          if (typeof playerId !== 'string' || playerId !== msg.senderId) break;
          const existing = gameStateRef.current.players[msg.senderId];
          if (existing) {
            recordHostPlayerBalance(msg.senderId, existing.balance);
          }
          const name = existing?.name;
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
    [applyActionOnHost, createPlayerState, recordHostPlayerBalance, showToast]
  );

  const attachPeerListeners = useCallback((p2p: P2PConnection) => {
    p2p.onMessage((message) => { if (p2pRef.current === p2p) handleMessage(message); });
    p2p.onClockSync((offset) => { if (p2pRef.current === p2p && !isHostRef.current) setClockOffsetMs(offset); });
    p2p.onPeerDisconnect((peerId) => {
      if (p2pRef.current !== p2p) return;

      if (isHostRef.current) {
        // A peer's connection dropped (closed tab, crash, lost network) without
        // ever sending a graceful `player-leave`. Remove them ourselves —
        // otherwise they sit at the table forever as a ghost seat nobody can
        // act for, blocking the round. The state broadcast is handled
        // automatically by the game-state-sync effect once this commits.
        const leaving = gameStateRef.current.players[peerId];
        if (leaving) {
          recordHostPlayerBalance(peerId, leaving.balance);
        }
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
        resetRoomState({ field: 'connection', code: 'hostLeft' });
      }
    });
  }, [handleMessage, recordHostPlayerBalance, resetRoomState, showToast]);

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
        if (!isBettingOpen(prev)) return prev;
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

  const clearError = useCallback(() => setError(null), []);

  const handleCancelEntry = useCallback(() => {
    entryGate.current.cancel();
    const connection = p2pRef.current;
    p2pRef.current = null;
    connection?.disconnect();
    expectedHostRef.current = '';
    isHostRef.current = false;
    setIsHost(false);
    setPendingAction(null);
    setConnectionStatus('');
    setClockOffsetMs(null);
    setError(null);
  }, []);

  const enterRoom = useCallback(async (action: EntryAction, spectator = false) => {
    const attempt = entryGate.current.begin();
    if (attempt === null) return;
    let connection: P2PConnection | null = null;
    setPendingAction(action);
    setError(null);
    try {
      const name = sanitizePlayerName(playerName);
      if (!name) { setError({ field: 'name', code: 'nameRequired' }); return; }
      const code = inputRoomCode.trim().toUpperCase();
      if (action === 'join' && !ROOM_CODE_PATTERN.test(code)) {
        setError({ field: 'roomCode', code: 'invalidRoomCode' }); return;
      }
      const bal = await getBalance();
      if (!entryGate.current.isCurrent(attempt)) return;
      if (action !== 'solo') {
        connection = new P2PConnection();
        p2pRef.current = connection;
        expectedHostRef.current = action === 'join' ? `blackjack-${code}` : '';
        attachPeerListeners(connection);
        setConnectionStatus('connecting');
      }
      const createdCode = action === 'create' ? await connection!.createRoom() : '';
      if (action === 'join') await connection!.joinRoom(code, spectator);
      if (!entryGate.current.isCurrent(attempt)) { connection?.disconnect(); return; }

      const peerId = connection?.peerId ?? 'solo-player';
      myIdRef.current = peerId;
      setMyId(peerId);
      const host = action !== 'join';
      isHostRef.current = host;
      setIsHost(host);
      setClockOffsetMs(host ? 0 : connection!.clockOffsetMs);
      setPlayerName(name);
      setLocalBalance(bal);
      lastSyncedBalanceRef.current = bal;
      sessionRef.current += 1;
      setSessionKey(sessionRef.current);
      setIsSpectator(action === 'join' && spectator);
      setRoomCode(action === 'create' ? createdCode : action === 'join' ? code : '');
      if (host) {
        recordHostPlayerBalance(peerId, bal);
        const initial = {
          ...createInitialGameState(roomSettings),
          tableOpen: action === 'solo', hostId: peerId, hostName: name,
          players: { [peerId]: createPlayerState(peerId, name, bal) },
        };
        gameStateRef.current = initial;
        setGameState(initial);
      } else {
        const clientId = getOrCreateClientId();
        connection!.send({
          type: spectator ? 'spectator-join' : 'player-join',
          payload: spectator ? { name, clientId } : { name, balance: bal, peerId, clientId }, senderId: peerId,
        });
      }
      setScreen(action === 'solo' ? 'game' : 'waiting');
      setConnectionStatus(action === 'solo' ? '' : action === 'create' ? 'waitingForPlayers' : spectator ? 'spectating' : 'waitingForHost');
    } catch (cause) {
      if (!entryGate.current.isCurrent(attempt)) return;
      if (p2pRef.current === connection) p2pRef.current = null;
      connection?.disconnect();
      setConnectionStatus('');
      setError({ field: 'connection', code: action === 'create' ? 'createFailed'
        : cause instanceof Error && /timeout|peer-unavailable|room not found/i.test(cause.message) ? 'roomNotFound' : 'joinFailed' });
    } finally {
      if (entryGate.current.finish(attempt)) setPendingAction(null);
    }
  }, [attachPeerListeners, createPlayerState, inputRoomCode, playerName, recordHostPlayerBalance, roomSettings]);

  const handleCreateRoom = useCallback(() => enterRoom('create'), [enterRoom]);
  const handleJoinRoom = useCallback((spectator = false) => enterRoom('join', spectator), [enterRoom]);
  const handlePlaySolo = useCallback(() => enterRoom('solo'), [enterRoom]);

  const handleStartGame = useCallback(() => {
    if (!isHostRef.current) return;

    setGameState((prev) => (prev.tableOpen ? prev : { ...prev, tableOpen: true, phaseStartedAt: Date.now(), turnStartedAt: Date.now() }));

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
      const existing = gameStateRef.current.players[myId];
      if (existing) {
        recordHostPlayerBalance(myId, existing.balance);
      }
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
    setConnectionStatus('spectating');
  }, [myId, playerName, isSpectator, recordHostPlayerBalance]);

  const handleJoinFromSpectator = useCallback(async () => {
    if (!isSpectator || pendingJoinRef.current || seatJoinRef.current) return;
    const session = sessionRef.current;
    seatJoinRef.current = true;
    const walletBal = await getBalance();
    if (session !== sessionRef.current) return;
    seatJoinRef.current = false;

    const recordedHostBal = isHostRef.current ? hostPlayerBalancesRef.current.get(myId) : undefined;
    const rawBal = recordedHostBal !== undefined ? recordedHostBal : walletBal;
    const bal = rawBal <= 0 ? 100 : rawBal;
    setLocalBalance(bal);
    lastSyncedBalanceRef.current = bal;

    const waitingForNextRound = gameStateRef.current.tableOpen && gameStateRef.current.phase !== 'betting';

    if (isHostRef.current) {
      recordHostPlayerBalance(myId, bal);
      setGameState((prev) => ({
        ...prev,
        players: {
          ...prev.players,
          [myId]: createPlayerState(myId, playerName, bal, waitingForNextRound),
        },
      }));
      // Host has authoritative state — safe to flip immediately
      setIsSpectator(false);
      pendingJoinRef.current = false;
    } else if (p2pRef.current) {
      // BUG-FIX: Instead of immediately setting isSpectator(false), mark a
      // pending join. The actual flip happens in the `game-state-sync` handler
      // once the host confirms the player was added. This prevents a brief
      // window where the UI shows player controls but the game state has no
      // player entry — causing broken rendering (no hands, no bet panel).
      pendingJoinRef.current = true;
      const clientId = getOrCreateClientId();
      p2pRef.current.send({ type: 'player-join', payload: { name: playerName, balance: bal, peerId: myId, clientId }, senderId: myId });
    }

    if (waitingForNextRound) {
      setConnectionStatus('joiningNextRound');
    } else {
      setConnectionStatus('');
    }
  }, [createPlayerState, isSpectator, myId, playerName, recordHostPlayerBalance]);

  const handleCopyLink = useCallback(() => {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set('room', roomCode);
    const copy = async () => {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url.href);
    };
    void copy().then(() => {
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => showToast(t.entry.copyFailed));
  }, [roomCode, showToast, t.entry.copyFailed]);

  const resolvedScreen = screen === 'lobby' ? 'lobby' : gameState.tableOpen ? 'game' : 'waiting';

  return {
    screen: resolvedScreen, setScreen,
    playerName, setPlayerName,
    inputRoomCode, setInputRoomCode,
    roomCode, error, clearError, pendingAction, handleCancelEntry, sessionKey, clockOffsetMs, connectionStatus, localToast,
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
