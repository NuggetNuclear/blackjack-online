// ========================
// P2P Networking Layer using PeerJS
// ========================

import Peer, { DataConnection } from 'peerjs';

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
  }

  async createRoom(): Promise<string> {
    this._isHost = true;
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    return new Promise((resolve, reject) => {
      this.peer = new Peer(`blackjack-${roomCode}`, {
        debug: 0,
      });

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

    return new Promise((resolve, reject) => {
      this.peer = new Peer({
        debug: 0,
      });

      this.peer.on('open', (id) => {
        this._peerId = id;
        const conn = this.peer!.connect(`blackjack-${roomCode.toUpperCase()}`);

        conn.on('open', () => {
          this.connections.set(conn.peer, conn);
          this.setupConnection(conn);
          resolve();
        });

        conn.on('error', (err) => {
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        reject(err);
      });

      setTimeout(() => {
        if (this.connections.size === 0) {
          reject(new Error('Connection timeout - room not found'));
        }
      }, 15000);
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
