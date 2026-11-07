// ========================
// P2P Networking Layer using PeerJS
// ========================

import Peer, { DataConnection } from 'peerjs';
import { ROOM_CODE_PATTERN } from '@/features/blackjack/lib/validation';

// No 0/O, 1/I/L: codes are read aloud and typed on phones. Old codes using
// those characters still validate (ROOM_CODE_PATTERN accepts A-Z0-9).
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
// Largest multiple of the alphabet size that fits in a byte; bytes at or above
// it are rejected so every character is equally likely (no modulo bias).
const UNBIASED_LIMIT = 256 - (256 % ROOM_CODE_ALPHABET.length);

export function generateRoomCode(): string {
  let code = '';
  const bytes = new Uint8Array(ROOM_CODE_LENGTH * 2);
  while (code.length < ROOM_CODE_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= UNBIASED_LIMIT) continue;
      code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
      if (code.length === ROOM_CODE_LENGTH) break;
    }
  }
  return code;
}

/** Peer IDs are used as keys of `players` records. An ID equal to an
 *  Object.prototype member (`toString`, `constructor`, ...) would read an
 *  inherited value and crash the host, so such peers are refused. */
export function isSafePeerId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && !(id in Object.prototype);
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
  | 'chat';

export type PlayerActionKind = 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insure' | 'decline-insurance';

export interface GameMessage {
  type: MessageType;
  payload: unknown;
  senderId: string;
  timestamp: number;
}

type MessageHandler = (msg: GameMessage) => void;
type DisconnectHandler = (peerId: string) => void;

export class P2PConnection {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private messageHandlers: Set<MessageHandler> = new Set();
  private disconnectHandlers: Set<DisconnectHandler> = new Set();
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

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPeerDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  private handleMessage(msg: GameMessage): void {
    this.messageHandlers.forEach((handler) => {
      // A malformed message from one peer must not take down the handler
      // chain (or the host's whole session).
      try {
        handler(msg);
      } catch (err) {
        console.error('Dropped message that failed to process:', msg.type, err);
      }
    });
  }

  private handlePeerDisconnect(peerId: string): void {
    this.disconnectHandlers.forEach((handler) => handler(peerId));
  }

  private setupConnection(conn: DataConnection): void {
    let closed = false;
    const finalizeDisconnect = () => {
      if (closed) return;
      closed = true;
      // Only the connection currently registered for this peer counts. When a
      // peer reconnects, closing its stale connection must not evict the new
      // one or report the (still connected) player as gone.
      const isCurrent = this.connections.get(conn.peer) === conn;
      if (isCurrent) this.connections.delete(conn.peer);
      try {
        conn.close();
      } catch {
        // Connection may already be torn down.
      }
      if (isCurrent) this.handlePeerDisconnect(conn.peer);
    };

    conn.on('data', (data) => {
      // Never trust senderId coming from payload; bind identity to the transport peer.
      if (!data || typeof data !== 'object' || typeof (data as GameMessage).type !== 'string') return;
      const incoming = data as GameMessage;
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
  }

  async createRoom(): Promise<string> {
    this._isHost = true;
    const roomCode = generateRoomCode();

    return new Promise((resolve, reject) => {
      this.peer = new Peer(`blackjack-${roomCode}`, peerServerOptions());

      this.peer.on('open', (id) => {
        this._peerId = id;
        resolve(roomCode);
      });

      this.peer.on('connection', (conn) => {
        if (!isSafePeerId(conn.peer)) {
          conn.close();
          return;
        }
        conn.on('open', () => {
          const previous = this.connections.get(conn.peer);
          this.connections.set(conn.peer, conn);
          this.setupConnection(conn);
          // Same peer opened a second channel (double click, retry): keep the
          // newest one and drop the stale one without a disconnect event.
          if (previous && previous !== conn) previous.close();
        });
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        // Don't leave a half-open Peer reconnecting to the signaling server.
        this.peer?.destroy();
        this.peer = null;
        reject(err);
      });
    });
  }

  async joinRoom(roomCode: string, asSpectator: boolean = false): Promise<void> {
    this._isHost = false;
    this._isSpectator = asSpectator;

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
        resolve();
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.peer?.destroy();
        this.peer = null;
        reject(err);
      };
      const timeout = setTimeout(() => {
        if (this.connections.size === 0) {
          fail(new Error('Connection timeout - room not found'));
        }
      }, 15000);

      this.peer = new Peer(peerServerOptions());

      this.peer.on('open', (id) => {
        if (settled) return;
        this._peerId = id;
        // reliable: true gives an ordered, reliable SCTP channel. PeerJS's
        // default is unordered, so a stale game-state snapshot could arrive
        // after a newer one and roll the table back.
        const conn = this.peer!.connect(`blackjack-${code}`, { reliable: true });

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
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}
