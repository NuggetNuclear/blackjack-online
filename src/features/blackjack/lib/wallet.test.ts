// Wallet and history persistence tests. Run with: npm test
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_BALANCE,
  RESET_BALANCE,
  getBalance,
  setBalance,
  adjustBalance,
} from './wallet.ts';

import {
  getHistory,
  addRecord,
  clearHistory,
  type BetRecord,
} from './history.ts';

// Mock in-memory localStorage
const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
};

// Install mock window and localStorage for Node testing environment
(globalThis as unknown as { window: { localStorage: typeof mockLocalStorage } }).window = {
  localStorage: mockLocalStorage,
};

describe('Anti-Tamper Wallet', () => {
  beforeEach(() => {
    store.clear();
  });

  it('initializes with INITIAL_BALANCE when storage is empty', async () => {
    const balance = await getBalance();
    assert.equal(balance, INITIAL_BALANCE);
    // Should have saved atomic document
    const stored = store.get('bj_wallet');
    assert.ok(stored);
    const parsed = JSON.parse(stored);
    assert.ok(parsed.payload);
    assert.ok(parsed.sig);
  });

  it('updates and persists balance with setBalance', async () => {
    await setBalance(2500);
    const balance = await getBalance();
    assert.equal(balance, 2500);
  });

  it('adjusts balance with positive and negative deltas', async () => {
    await setBalance(1000);
    const afterWin = await adjustBalance(500);
    assert.equal(afterWin, 1500);

    const afterLoss = await adjustBalance(-700);
    assert.equal(afterLoss, 800);
  });

  it('floors balance to RESET_BALANCE when adjusted to 0 or below', async () => {
    await setBalance(100);
    const result = await adjustBalance(-200);
    assert.equal(result, RESET_BALANCE);
  });

  it('detects tampering and resets balance to RESET_BALANCE', async () => {
    await setBalance(5000);
    const stored = JSON.parse(store.get('bj_wallet')!);

    // Alter the payload without valid signature
    const fakePayload = JSON.stringify({ balance: 999999, timestamp: Date.now(), version: 2 });
    store.set('bj_wallet', JSON.stringify({ payload: fakePayload, sig: stored.sig }));

    const tamperedBalance = await getBalance();
    assert.equal(tamperedBalance, RESET_BALANCE);
  });

  it('migrates legacy two-key storage format to atomic document', async () => {
    // Write legacy style (payload in bj_wallet, sig in bj_wallet_sig)
    await setBalance(1234);
    const stored = JSON.parse(store.get('bj_wallet')!);
    store.set('bj_wallet', stored.payload);
    store.set('bj_wallet_sig', stored.sig);

    // Read back - should succeed and migrate
    const migratedBalance = await getBalance();
    assert.equal(migratedBalance, 1234);

    // Legacy sig key should be deleted
    assert.equal(store.has('bj_wallet_sig'), false);
    // bj_wallet should now be atomic JSON doc
    const updated = JSON.parse(store.get('bj_wallet')!);
    assert.ok(updated.payload);
    assert.ok(updated.sig);
  });

  it('handles rapid concurrent balance writes sequentially without race conditions', async () => {
    await setBalance(100);
    // Fire 5 concurrent adjustments
    await Promise.all([
      adjustBalance(10),
      adjustBalance(20),
      adjustBalance(30),
      adjustBalance(40),
      adjustBalance(50),
    ]);
    const finalBalance = await getBalance();
    assert.equal(finalBalance, 100 + 10 + 20 + 30 + 40 + 50);
  });
});

describe('Bet History Persistence', () => {
  beforeEach(() => {
    store.clear();
  });

  it('starts with empty history', async () => {
    const history = await getHistory();
    assert.deepEqual(history, []);
  });

  it('records bet history and verifies integrity', async () => {
    const record: BetRecord = {
      round: 1,
      bet: 50,
      result: 'win',
      payout: 100,
      balanceAfter: 1050,
      timestamp: Date.now(),
    };
    await addRecord(record);

    const history = await getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].round, 1);
    assert.equal(history[0].result, 'win');
  });

  it('clears tampered history', async () => {
    const record: BetRecord = {
      round: 1,
      bet: 50,
      result: 'win',
      payout: 100,
      balanceAfter: 1050,
      timestamp: Date.now(),
    };
    await addRecord(record);

    const storedDoc = JSON.parse(store.get('bj_history')!);
    // Tamper with data
    store.set('bj_history', JSON.stringify({ data: 'tampered-data', sig: storedDoc.sig }));

    const history = await getHistory();
    assert.deepEqual(history, []);
  });

  it('clears history on clearHistory()', async () => {
    await addRecord({
      round: 1,
      bet: 50,
      result: 'win',
      payout: 100,
      balanceAfter: 1050,
      timestamp: Date.now(),
    });
    await clearHistory();
    const history = await getHistory();
    assert.deepEqual(history, []);
  });
});
