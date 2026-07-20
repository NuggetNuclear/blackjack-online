// ========================
// P2P Networking Layer using PeerJS
// ========================

import Peer, { DataConnection } from 'peerjs';
import { ROOM_CODE_PATTERN } from '@/features/blackjack/lib/validation';

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
    this.messageHandlers.forEach((handler) => handler(msg));
  }

  private handlePeerDisconnect(peerId: string): void {
    this.disconnectHandlers.forEach((handler) => handler(peerId));
  }

  private setupConnection(conn: DataConnection): void {
    let closed = false;
    const finalizeDisconnect = () => {
      if (closed) return;
      closed = true;
      this.connections.delete(conn.peer);
      try {
        conn.close();
      } catch {
        // Connection may already be torn down.
      }
      this.handlePeerDisconnect(conn.peer);
    };

    conn.on('data', (data) => {
      // Never trust senderId coming from payload; bind identity to the transport peer.
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
        conn.on('open', () => {
          this.connections.set(conn.peer, conn);
          this.setupConnection(conn);
        });
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
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
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}
