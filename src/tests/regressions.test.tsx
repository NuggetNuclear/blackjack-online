import './dom';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { act, StrictMode, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { LanguageProvider } from '@/shared/i18n/useLanguage';
import LobbyScreen, { type LobbyScreenProps } from '@/features/blackjack/screens/LobbyScreen';
import GameRoom from '@/features/blackjack/screens/GameRoom';
import ConfirmModal from '@/features/blackjack/components/ConfirmModal';
import WaitingRoomScreen from '@/features/blackjack/screens/WaitingRoomScreen';
import { useRoomConnection } from '@/features/blackjack/hooks/useRoomConnection';
import { useDealerProgression } from '@/features/blackjack/hooks/useDealerProgression';
import { useResultsEffects } from '@/features/blackjack/hooks/useResultsEffects';
import { useAutoplay } from '@/features/blackjack/hooks/useAutoplay';
import { P2PConnection, type GameMessage } from '@/features/blackjack/lib/p2p';
import { createInitialGameState, createEmptyHand, DEFAULT_ROOM_SETTINGS, type GameState } from '@/features/blackjack/lib/blackjack';
import { getBalance, setBalance } from '@/features/blackjack/lib/wallet';
import { clearHistory, getHistory } from '@/features/blackjack/lib/history';
import { sounds } from '@/features/blackjack/lib/sounds';
import { readStorage, writeStorage, removeStorage } from '@/shared/lib/storage';

const roots: Root[] = [];
const wrap = (node: ReactNode) => <LanguageProvider>{node}</LanguageProvider>;
async function mount(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => { root.render(wrap(node)); });
  return { container, root, render: async (next: ReactNode) => { await act(async () => root.render(wrap(next))); } };
}
async function settle() { await act(async () => { await getBalance(); await new Promise((resolve) => setTimeout(resolve, 25)); }); }
async function click(container: HTMLElement, text: string) {
  const element = [...container.querySelectorAll('button')].find((button) => button.textContent === text);
  assert.ok(element, `Button ${text} exists`);
  await act(async () => { element.click(); });
}
async function submit(container: HTMLElement) {
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function lobbyProps(overrides: Partial<LobbyScreenProps> = {}): LobbyScreenProps {
  return { playerName: 'Gabriel', setPlayerName() {}, inputRoomCode: '', setInputRoomCode() {}, error: null,
    clearError() {}, pendingAction: null, onCancelEntry() {}, balance: 1000, roomSettings: DEFAULT_ROOM_SETTINGS,
    setRoomSettings() {}, onCreateRoom: async () => {}, onJoinRoom: async () => {}, onPlaySolo: async () => {}, ...overrides };
}

beforeEach(() => { window.localStorage.clear(); window.history.replaceState(null, '', '/'); sounds.setEnabled(false); });
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
});

describe('entry user flow', () => {
  it('submits solo by default and does not mount invisible join fields', async () => {
    let solo = 0;
    const { container } = await mount(<LobbyScreen {...lobbyProps({ onPlaySolo: async () => { solo++; } })} />);
    assert.equal(container.querySelector('#entry-code'), null);
    assert.match(container.textContent!, /Blackjack Online/);
    assert.doesNotMatch(container.textContent!, /Toma asiento|próxima mano|Sin registro|Sin dinero/);
    await submit(container);
    assert.equal(solo, 1);
  });
  it('submits an invitation to its room and preserves the spectator role', async () => {
    let solo = 0;
    const roles: boolean[] = [];
    const { container } = await mount(<LobbyScreen {...lobbyProps({ inputRoomCode: 'ABC123',
      onPlaySolo: async () => { solo++; }, onJoinRoom: async (spectator) => { roles.push(Boolean(spectator)); } })} />);
    assert.ok(container.querySelector('#entry-code'));
    await act(async () => { (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click(); });
    await submit(container);
    assert.deepEqual(roles, [true]);
    assert.equal(solo, 0);
  });
  it('blocks duplicate submissions and exposes pending and field errors accessibly', async () => {
    const operation = deferred<void>();
    let calls = 0;
    const props = lobbyProps({ onCreateRoom: () => { calls++; return operation.promise; } });
    const view = await mount(<LobbyScreen {...props} />);
    await click(view.container, 'Con amigos');
    await submit(view.container);
    await submit(view.container);
    assert.equal(calls, 1);
    await view.render(<LobbyScreen {...props} pendingAction="create" />);
    assert.equal(view.container.querySelector('form')!.getAttribute('aria-busy'), 'true');
    assert.equal(view.container.querySelector('fieldset')!.disabled, true);
    await act(async () => operation.resolve());
    await view.render(<LobbyScreen {...lobbyProps({ playerName: '' })} />);
    await submit(view.container);
    const name = view.container.querySelector('#entry-name')!;
    assert.equal(name.getAttribute('aria-invalid'), 'true');
    assert.equal(name.getAttribute('aria-describedby'), 'entry-name-error');
    assert.equal(document.activeElement, name);
  });
  it('hydrates a saved name and URL invitation without replacing server HTML', async () => {
    window.localStorage.setItem('bj_player_name', 'Gabriel');
    window.history.replaceState(null, '', '/?room=abc123');
    const container = document.createElement('div');
    container.innerHTML = renderToString(wrap(<GameRoom />));
    document.body.append(container);
    const recoveries: unknown[] = [];
    await act(async () => { roots.push(hydrateRoot(container, wrap(<GameRoom />), { onRecoverableError: (error) => recoveries.push(error) })); });
    await settle();
    assert.equal((container.querySelector('#entry-name') as HTMLInputElement).value, 'Gabriel');
    assert.equal((container.querySelector('#entry-code') as HTMLInputElement).value, 'ABC123');
    assert.deepEqual(recoveries, []);
  });
  it('keeps a selectable invitation when clipboard access fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
    const { container } = await mount(<WaitingRoomScreen roomCode="ABC123" gameState={createInitialGameState()}
      isHost={false} isSpectator onStartGame={() => {}} onExitRoom={() => {}} />);
    await click(container, 'Copiar enlace');
    assert.match(container.textContent!, /No se pudo copiar/);
    assert.equal((container.querySelector('input[readonly]') as HTMLInputElement).value, 'http://localhost/?room=ABC123');
    assert.match(container.textContent!, /Observando/);
    assert.equal([...container.querySelectorAll('button')].some((b) => b.textContent === 'Abrir mesa'), false);
  });
});

describe('room lifecycle', () => {
  async function roomHarness() {
    let room!: ReturnType<typeof useRoomConnection>;
    function Harness() { const value = useRoomConnection(); useLayoutEffect(() => { room = value; }); return null; }
    const view = await mount(<Harness />);
    await settle();
    await act(async () => room.setPlayerName('Gabriel'));
    return { ...view, get room() { return room; } };
  }
  it('excludes competing network entries and ignores a cancelled late completion', async (context) => {
    const waiting = deferred<string>();
    let calls = 0;
    context.mock.method(P2PConnection.prototype, 'createRoom', function () { calls++; return waiting.promise; });
    const view = await roomHarness();
    let first!: Promise<void>;
    await act(async () => {
      first = view.room.handleCreateRoom();
      void view.room.handleCreateRoom();
      void view.room.handlePlaySolo();
    });
    await settle();
    assert.equal(calls, 1);
    assert.equal(view.room.pendingAction, 'create');
    await act(async () => view.room.handleCancelEntry());
    await act(async () => { waiting.resolve('ABC123'); await first; });
    assert.equal(view.room.screen, 'lobby');
    assert.equal(view.room.roomCode, '');
    assert.equal(view.room.pendingAction, null);
    await act(async () => { await view.room.handlePlaySolo(); });
    assert.equal(view.room.screen, 'game');
  });
  it('releases a failed connection and permits retry with the entered values', async (context) => {
    context.mock.method(P2PConnection.prototype, 'joinRoom', async () => { throw new Error('room not found'); });
    const view = await roomHarness();
    await act(async () => view.room.setInputRoomCode('ABC123'));
    await act(async () => { await view.room.handleJoinRoom(); });
    assert.equal(view.room.error?.code, 'roomNotFound');
    assert.equal(view.room.p2pRef.current, null);
    assert.equal(view.room.pendingAction, null);
    assert.equal(view.room.playerName, 'Gabriel');
    assert.equal(view.room.inputRoomCode, 'ABC123');
  });
  it('does not rejoin a seat after the spectator leaves during wallet loading', async (context) => {
    context.mock.method(P2PConnection.prototype, 'joinRoom', async function (this: P2PConnection) {
      Object.defineProperty(this, 'peerId', { value: 'guest' });
    });
    const messages: string[] = [];
    context.mock.method(P2PConnection.prototype, 'send', (message: Omit<GameMessage, 'timestamp'>) => { messages.push(message.type); });
    const view = await roomHarness();
    await act(async () => view.room.setInputRoomCode('ABC123'));
    await act(async () => { await view.room.handleJoinRoom(true); });
    await act(async () => {
      const joining = view.room.handleJoinFromSpectator();
      view.room.handleExitRoom();
      await joining;
    });
    assert.equal(view.room.screen, 'lobby');
    assert.equal(messages.includes('player-join'), false);
    assert.deepEqual(view.room.gameState.players, {});
  });
  it('starts the first betting deadline when the host opens the table', async (context) => {
    context.mock.method(P2PConnection.prototype, 'createRoom', async function (this: P2PConnection) {
      Object.defineProperty(this, 'peerId', { value: 'blackjack-ABC123' }); return 'ABC123';
    });
    const view = await roomHarness();
    await act(async () => { await view.room.handleCreateRoom(); });
    const createdAt = view.room.gameState.phaseStartedAt;
    const clock = context.mock.method(Date, 'now', () => createdAt + 18000);
    await act(async () => view.room.handleStartGame());
    assert.equal(view.room.gameState.phaseStartedAt, createdAt + 18000);
    assert.equal(view.room.gameState.tableOpen, true);
    clock.mock.restore();
  });
  it('rejects a late bet even before the betting phase changes', async (context) => {
    const view = await roomHarness();
    await act(async () => { await view.room.handlePlaySolo(); });
    context.mock.method(Date, 'now', () => view.room.gameState.phaseStartedAt + 20000);
    await act(async () => view.room.sendBet(25));
    assert.equal(view.room.gameState.phase, 'betting');
    assert.equal(view.room.gameState.players['solo-player'].ready, false);
    assert.equal(view.room.gameState.players['solo-player'].balance, 1000);
  });
  it('shows zero available chips after an all-in canonical sync, and rejects foreign hosts', async (context) => {
    context.mock.method(P2PConnection.prototype, 'joinRoom', async function (this: P2PConnection) {
      Object.defineProperty(this, 'peerId', { value: 'guest' });
    });
    const view = await roomHarness();
    await act(async () => view.room.setInputRoomCode('ABC123'));
    await act(async () => { await view.room.handleJoinRoom(); });
    const state: GameState = { ...createInitialGameState(), tableOpen: true, hostId: 'blackjack-ABC123',
      players: { guest: { id: 'guest', name: 'Gabriel', balance: 0, hands: [{ ...createEmptyHand(), bet: 1000 }], activeHandIndex: 0, ready: true } } };
    const connection = view.room.p2pRef.current as unknown as { messageHandlers: Set<(message: GameMessage) => void> };
    await act(async () => { connection.messageHandlers.forEach((handler) => handler({ type: 'game-state-sync', payload: state, senderId: 'blackjack-ABC123', timestamp: Date.now() })); });
    assert.equal(view.room.balance, 0);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
    const wallet = JSON.parse(window.localStorage.getItem('bj_wallet')!);
    assert.equal(JSON.parse(wallet.payload).balance, 0);
    await act(async () => { connection.messageHandlers.forEach((handler) => handler({ type: 'game-state-sync', payload: { ...state, phase: 'results' }, senderId: 'foreign-host', timestamp: Date.now() })); });
    assert.equal(view.room.gameState.phase, 'betting');
    assert.equal(view.room.balance, 0);
  });
  it('does not run a betting timer in the waiting room', async (context) => {
    const callbacks: (() => void)[] = [];
    context.mock.method(globalThis, 'setTimeout', ((callback: () => void) => { callbacks.push(callback); return 1; }) as typeof setTimeout);
    const state = createInitialGameState();
    const gameStateRef = { current: state };
    const isHostRef = { current: true };
    let syncs = 0;
    function Harness() { useDealerProgression({ gameState: state, gameStateRef, isHostRef, syncGameState: () => { syncs++; }, onResultsTimeout() {} }); return null; }
    await mount(<Harness />);
    for (const callback of callbacks) callback();
    assert.equal(syncs, 0);
    assert.equal(callbacks.length, 0);
  });
  it('queues an automatic bet only after the guest clock is synchronized', async (context) => {
    const callbacks: (() => void)[] = [];
    context.mock.method(globalThis, 'setTimeout', ((callback: () => void) => { callbacks.push(callback); return 1; }) as typeof setTimeout);
    context.mock.method(globalThis, 'clearTimeout', () => {});
    const state: GameState = { ...createInitialGameState(), tableOpen: true,
      players: { p: { id: 'p', name: 'Gabriel', balance: 1000, hands: [createEmptyHand()], activeHandIndex: 0, ready: false } } };
    let bets = 0;
    function Harness({ ready }: { ready: boolean }) {
      useAutoplay({ gameState: state, gameStateRef: { current: state }, myId: 'p', isSpectator: false, isHostRef: { current: false },
        bettingSynchronized: ready, autoplay: { enabled: true, autoBet: 25, standOn: 17 }, balance: 1000, currentBet: 0,
        handleConfirmBetWith: () => { bets++; }, handleHit() {}, handleStand() {}, handleNewRound() {} });
      return null;
    }
    const view = await mount(<Harness ready={false} />);
    assert.equal(callbacks.length, 0);
    await view.render(<Harness ready />);
    assert.equal(callbacks.length, 1);
    await act(async () => callbacks[0]());
    assert.equal(bets, 1);
  });
});

describe('transport clock and connection identity', () => {
  class Connection extends EventEmitter {
    peer = 'blackjack-ABC123';
    open = true;
    sent: GameMessage[] = [];
    send(message: GameMessage) { this.sent.push(message); }
    close() { this.open = false; this.emit('close'); }
  }
  function transport() {
    const p2p = new P2PConnection();
    const internals = p2p as unknown as { connections: Map<string, Connection>; setupConnection: (connection: Connection) => void };
    return { p2p, attach(connection: Connection) { internals.connections.set(connection.peer, connection); internals.setupConnection(connection); } };
  }
  it('uses only a matching ping response to synchronize the host clock', (context) => {
    let now = 157000;
    context.mock.method(Date, 'now', () => now);
    const { p2p, attach } = transport();
    try {
      const connection = new Connection();
      const samples: number[] = [];
      p2p.onClockSync((offset) => samples.push(offset));
      attach(connection);
      assert.equal(connection.sent[0].type, 'ping');
      now = 157200;
      connection.emit('data', { type: 'pong', timestamp: 117100, payload: { sentAt: 157000 } });
      assert.equal(p2p.clockOffsetMs, -39900);
      connection.emit('data', { type: 'pong', timestamp: 999999, payload: { sentAt: 1 } });
      assert.deepEqual(samples, [-39900]);
    } finally { p2p.disconnect(); }
  });
  it('ignores a stale connection closing after its replacement is installed', () => {
    const { p2p, attach } = transport();
    try {
      const stale = new Connection();
      const active = new Connection();
      attach(stale);
      attach(active);
      stale.close();
      assert.deepEqual(p2p.connectedPeers, ['blackjack-ABC123']);
      let identity = '';
      p2p.onMessage((message) => { identity = message.senderId; });
      active.emit('data', { type: 'game-state-sync', senderId: 'forged-host', payload: {} });
      assert.equal(identity, 'blackjack-ABC123');
    } finally { p2p.disconnect(); }
  });
});

describe('session results, dialog, and unavailable storage', () => {
  it('records the same round number in two separate sessions under StrictMode', async () => {
    await clearHistory();
    const state: GameState = { ...createInitialGameState(), phase: 'results', roundNumber: 1, tableOpen: true,
      players: { p: { id: 'p', name: 'Gabriel', balance: 1200, activeHandIndex: 0, ready: true,
        hands: [{ ...createEmptyHand(), bet: 100, payout: 200, result: 'win' }] } } };
    function Harness({ session }: { session: number }) { useResultsEffects({ gameState: state, myId: 'p', isSpectator: false, sessionKey: session }); return null; }
    const view = await mount(<StrictMode><Harness session={1} /></StrictMode>);
    await act(async () => { await getHistory(); });
    await view.render(<StrictMode><Harness session={2} /></StrictMode>);
    await act(async () => { await getHistory(); });
    assert.equal((await getHistory()).length, 2);
  });
  it('cancels a native dialog and restores focus to its trigger', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Salir</button>{open && <ConfirmModal title="Salir" message="Confirmar salida" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)} />}</>;
    }
    const { container } = await mount(<Harness />);
    const trigger = container.querySelector('button')!;
    trigger.focus();
    await click(container, 'Salir');
    const dialog = container.querySelector('dialog')!;
    assert.ok(dialog.open);
    assert.equal(document.activeElement?.textContent, 'Cancelar');
    await act(async () => { dialog.dispatchEvent(new Event('cancel', { cancelable: true })); });
    assert.equal(container.querySelector('dialog'), null);
    assert.equal(document.activeElement, trigger);
  });
  it('keeps preferences and wallet usable when localStorage is blocked', async (context) => {
    context.mock.method(window.Storage.prototype, 'getItem', () => { throw new Error('blocked'); });
    context.mock.method(window.Storage.prototype, 'setItem', () => { throw new Error('blocked'); });
    context.mock.method(window.Storage.prototype, 'removeItem', () => { throw new Error('blocked'); });
    assert.throws(() => window.localStorage.getItem('test-preference'), /blocked/);
    writeStorage('test-preference', 'es');
    assert.equal(readStorage('test-preference'), 'es');
    removeStorage('test-preference');
    assert.equal(readStorage('test-preference'), null);
    await setBalance(725);
    assert.equal(await getBalance(), 725);
    const { container } = await mount(<GameRoom />);
    await settle();
    assert.ok(container.querySelector('#entry-name'));
  });
});
