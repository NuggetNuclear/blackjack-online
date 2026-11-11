// ========================
// P2P Networking Layer using PeerJS
// ========================

import Peer, { DataConnection } from 'peerjs';
import { ROOM_CODE_PATTERN, MAX_ROOM_CONNECTIONS } from '@/features/blackjack/lib/validation';
import { hostClockOffset } from '@/features/blackjack/lib/clock';

const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_CODE_LENGTH = 6;

function generateRoomCode(): string {
  // Math.random().toString(36) can occasionally yield fewer than 6 characters;
  // draw from the CSPRNG and always produce a full-length code.
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}

type PeerOptions = NonNullable<ConstructorParameters<typeof Peer>[1]>;

/** PeerJS server options. Defaults to the public PeerJS cloud; a self-hosted
 *  signaling server can be configured with NEXT_PUBLIC_PEERJS_HOST (plus
 *  optional PORT / PATH / KEY, and SECURE=false for plain ws://). */
function peerServerOptions(): PeerOptions {
  const options: PeerOptions = { debug: 0 };
  const host = process.env.NEXT_PUBLIC_PEERJS_HOST;
  if (host) {
    options.host = host;
    options.path = process.env.NEXT_PUBLIC_PEERJS_PATH ?? '/';
    options.secure = process.env.NEXT_PUBLIC_PEERJS_SECURE !== 'false';
    const port = Number(process.env.NEXT_PUBLIC_PEERJS_PORT);
    if (Number.isFinite(port)) options.port = port;
    const key = process.env.NEXT_PUBLIC_PEERJS_KEY;
    if (key) options.key = key;
  }
  return options;
}

export type MessageType =
  | 'player-join'
  | 'spectator-join'
  | 'player-bet'
  | 'player-action'
  | 'game-state-sync'
  | 'new-round'
  | 'player-leave'
  | 'player-spectate'
  | 'room-settings-sync'
  | 'chat'
  | 'ping'
  | 'pong';

export type PlayerActionKind = 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insure' | 'decline-insurance';

export interface GameMessage {
  type: MessageType;
  payload: unknown;
  senderId: string;
  timestamp: number;
}

type MessageHandler = (msg: GameMessage) => void;
type DisconnectHandler = (peerId: string) => void;
type ClockHandler = (offsetMs: number) => void;

const HEARTBEAT_INTERVAL_MS = 3000;
const HEARTBEAT_TIMEOUT_MS = 7000;
const RATE_LIMIT_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_WINDOW = 30;

export class P2PConnection {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private lastSeenMap: Map<string, number> = new Map();
  private rateLimitMap: Map<string, { count: number; windowStart: number }> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private disconnectHandlers: Set<DisconnectHandler> = new Set();
  private clockHandlers: Set<ClockHandler> = new Set();
  private clockRequests = new Map<string, number>();
  private pendingCancel: (() => void) | null = null;
  private _clockOffsetMs: number | null = null;
  private _peerId: string = '';
  private _isHost: boolean = false;
  private _isSpectator: boolean = false;

  get peerId(): string {
    return this._peerId;
  }

  get isHost(): boolean {
    return this._isHost;
  }

  get isSpectator(): boolean {
    return this._isSpectator;
  }

  get connectedPeers(): string[] {
    return Array.from(this.connections.keys());
  }

  get clockOffsetMs(): number | null { return this._clockOffsetMs; }

  onClockSync(handler: ClockHandler): () => void {
    this.clockHandlers.add(handler);
    return () => this.clockHandlers.delete(handler);
  }

  private ping(conn: DataConnection): void {
    if (!conn.open) return;
    const now = Date.now();
    this.clockRequests.set(conn.peer, now);
    conn.send({ type: 'ping', payload: null, senderId: this._peerId, timestamp: now });
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPeerDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  private handleMessage(msg: GameMessage): void {
    this.messageHandlers.forEach((handler) => handler(msg));
  }

  private handlePeerDisconnect(peerId: string): void {
    this.disconnectHandlers.forEach((handler) => handler(peerId));
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      this.connections.forEach((conn, peerId) => {
        const lastSeen = this.lastSeenMap.get(peerId) ?? now;
        if (now - lastSeen > HEARTBEAT_TIMEOUT_MS) {
          // Connection timed out without heartbeat response
          this.connections.delete(peerId);
          this.lastSeenMap.delete(peerId);
          try {
            conn.close();
          } catch {
            // Already closed
          }
          this.handlePeerDisconnect(peerId);
        } else if (conn.open) {
          this.ping(conn);
        }
      });
      if (this.connections.size === 0) {
        this.stopHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setupConnection(conn: DataConnection): void {
    let closed = false;
    const finalizeDisconnect = () => {
      if (closed) return;
      closed = true;
      if (this.connections.get(conn.peer) !== conn) return;
      this.connections.delete(conn.peer);
      this.lastSeenMap.delete(conn.peer);
      this.rateLimitMap.delete(conn.peer);
      this.clockRequests.delete(conn.peer);
      if (this.connections.size === 0) {
        this.stopHeartbeat();
      }
      try {
        conn.close();
      } catch {
        // Connection may already be torn down.
      }
      this.handlePeerDisconnect(conn.peer);
    };

    this.lastSeenMap.set(conn.peer, Date.now());
    this.startHeartbeat();

    conn.on('data', (data) => {
      const now = Date.now();
      this.lastSeenMap.set(conn.peer, now);
      const incoming = data as GameMessage;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return;

      // Per-peer sliding window rate limit to prevent message-flood DoS
      const bucket = this.rateLimitMap.get(conn.peer);
      if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
        this.rateLimitMap.set(conn.peer, { count: 1, windowStart: now });
      } else {
        bucket.count += 1;
        if (bucket.count > MAX_MESSAGES_PER_WINDOW) {
          return;
        }
      }

      if (incoming.type === 'ping') {
        if (conn.open) {
          conn.send({
            type: 'pong',
            payload: { sentAt: incoming.timestamp },
            senderId: this._peerId,
            timestamp: Date.now(),
          });
        }
        return;
      }

      if (incoming.type === 'pong') {
        const payload = incoming.payload as { sentAt?: unknown } | null;
        const sentAt = this.clockRequests.get(conn.peer);
        if (!this._isHost && typeof sentAt === 'number' && payload?.sentAt === sentAt) {
          const offset = hostClockOffset(sentAt, incoming.timestamp, Date.now());
          if (offset !== null) {
            this._clockOffsetMs = offset;
            this.clockRequests.delete(conn.peer);
            this.clockHandlers.forEach((handler) => handler(offset));
          }
        }
        return;
      }

      // Never trust senderId coming from payload; bind identity to the transport peer.
      this.handleMessage({
        ...incoming,
        senderId: conn.peer,
        timestamp: typeof incoming?.timestamp === 'number' ? incoming.timestamp : Date.now(),
      });
    });
    conn.on('close', finalizeDisconnect);
    conn.on('error', (err) => {
      console.error('Connection error:', err);
      finalizeDisconnect();
    });

    // PeerJS does not emit 'close' when the remote peer dies abruptly (tab
    // kill, network drop) — only on graceful closes. Watch the underlying
    // RTCPeerConnection: 'failed' is the browser's terminal verdict after ICE
    // consent checks stop succeeding (~15-30s). 'disconnected' is excluded
    // because it can recover on its own.
    const pc = conn.peerConnection;
    pc?.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        finalizeDisconnect();
      }
    });
    this.ping(conn);
  }

  async createRoom(maxRetries: number = 3): Promise<string> {
    this._isHost = true;
    this._clockOffsetMs = 0;
    for (let attempt = 0; ; attempt++) {
      const roomCode = generateRoomCode();
      try {
        return await new Promise<string>((resolve, reject) => {
          let settled = false;
          const peer = new Peer(`blackjack-${roomCode}`, peerServerOptions());
          this.peer = peer;
          const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            this.pendingCancel = null;
            if (error) {
              peer.destroy();
              if (this.peer === peer) this.peer = null;
              reject(error);
            } else resolve(roomCode);
          };
          const timeout = setTimeout(() => finish(new Error('Connection timeout')), 15000);
          this.pendingCancel = () => finish(new Error('Connection cancelled'));
          peer.on('open', (id) => {
            if (settled) return;
            this._peerId = id;
            finish();
          });
          peer.on('connection', (conn) => {
            conn.on('open', () => {
              if (this.peer !== peer) { conn.close(); return; }
              const existing = this.connections.get(conn.peer);
              if (!existing && this.connections.size >= MAX_ROOM_CONNECTIONS) {
                conn.close();
                return;
              }
              this.connections.set(conn.peer, conn);
              existing?.close();
              this.setupConnection(conn);
            });
          });
          peer.on('error', (error) => finish(error));
        });
      } catch (error) {
        if ((error as { type?: string }).type === 'unavailable-id' && attempt < maxRetries) continue;
        throw error;
      }
    }
  }

  async joinRoom(roomCode: string, asSpectator: boolean = false): Promise<void> {
    this._isHost = false;
    this._isSpectator = asSpectator;
    this._clockOffsetMs = null;

    const code = roomCode.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(code)) {
      throw new Error('Invalid room code');
    }

    return new Promise((resolve, reject) => {
      // Settle exactly once: a late 'open' after the timeout already rejected
      // must not resolve, and a failed attempt must not leave a live Peer
      // behind (it would keep reconnecting to the signaling server).
      let settled = false;
      const succeed = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.pendingCancel = null;
        resolve();
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.pendingCancel = null;
        this.peer?.destroy();
        this.peer = null;
        reject(err);
      };
      const timeout = setTimeout(() => {
        if (this.connections.size === 0) {
          fail(new Error('Connection timeout - room not found'));
        }
      }, 15000);

      this.pendingCancel = () => fail(new Error('Connection cancelled'));
      this.peer = new Peer(peerServerOptions());

      this.peer.on('open', (id) => {
        if (settled) return;
        this._peerId = id;
        const conn = this.peer!.connect(`blackjack-${code}`);

        conn.on('open', () => {
          if (settled) return;
          this.connections.set(conn.peer, conn);
          this.setupConnection(conn);
          succeed();
        });

        conn.on('error', (err) => {
          fail(err instanceof Error ? err : new Error(String(err)));
        });
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        fail(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  send(msg: Omit<GameMessage, 'timestamp'>): void {
    const fullMsg: GameMessage = {
      ...msg,
      timestamp: Date.now(),
    };
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(fullMsg);
      }
    });
  }

  /** Send a message to a specific peer instead of broadcasting.
   *  Used for targeted initial sync when a player/spectator joins,
   *  so we don't broadcast redundant state updates to everyone. */
  sendTo(peerId: string, msg: Omit<GameMessage, 'timestamp'>): void {
    const conn = this.connections.get(peerId);
    if (conn?.open) {
      conn.send({
        ...msg,
        timestamp: Date.now(),
      });
    }
  }

  disconnect(): void {
    this.messageHandlers.clear();
    this.disconnectHandlers.clear();
    this.clockHandlers.clear();
    const cancel = this.pendingCancel;
    this.pendingCancel = null;
    cancel?.();
    this.stopHeartbeat();
    this.clockRequests.clear();
    this.lastSeenMap.clear();
    this.rateLimitMap.clear();
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}
