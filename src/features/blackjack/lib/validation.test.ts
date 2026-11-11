// Payload validation tests. Run with: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INITIAL_BALANCE } from './wallet.ts';
import {
  isRecord,
  isValidPlayerAction,
  isValidBet,
  sanitizePlayerName,
  sanitizeJoinBalance,
  sanitizeClientId,
  sanitizeRoomSettings,
  isValidGameStateSync,
  MAX_PLAYER_NAME_LENGTH,
  MAX_JOIN_BALANCE,
  ROOM_CODE_PATTERN,
} from './validation.ts';

describe('isValidBet', () => {
  it('accepts positive integers up to the balance', () => {
    assert.equal(isValidBet(1, 100), true);
    assert.equal(isValidBet(100, 100), true);
  });

  it('rejects NaN, Infinity, fractions, non-numbers, and out-of-range values', () => {
    assert.equal(isValidBet(NaN, 100), false);
    assert.equal(isValidBet(Infinity, 100), false);
    assert.equal(isValidBet(-Infinity, 100), false);
    assert.equal(isValidBet(10.5, 100), false);
    assert.equal(isValidBet(0, 100), false);
    assert.equal(isValidBet(-5, 100), false);
    assert.equal(isValidBet(101, 100), false);
    assert.equal(isValidBet('50', 100), false);
    assert.equal(isValidBet(null, 100), false);
    assert.equal(isValidBet(undefined, 100), false);
  });
});

describe('sanitizePlayerName', () => {
  it('trims and caps at the max length', () => {
    assert.equal(sanitizePlayerName('  Alice  '), 'Alice');
    assert.equal(sanitizePlayerName('x'.repeat(50)), 'x'.repeat(MAX_PLAYER_NAME_LENGTH));
  });

  it('rejects non-strings and effectively empty names', () => {
    assert.equal(sanitizePlayerName(42), null);
    assert.equal(sanitizePlayerName(null), null);
    assert.equal(sanitizePlayerName({}), null);
    assert.equal(sanitizePlayerName('   '), null);
    assert.equal(sanitizePlayerName(''), null);
  });

  it('strips invisible zero-width and BiDi control characters', () => {
    assert.equal(sanitizePlayerName('Alice\u200B'), 'Alice');
    assert.equal(sanitizePlayerName('\u202EBob'), 'Bob');
    assert.equal(sanitizePlayerName('\u200B\u200C\u200D'), null); // becomes empty -> null
    assert.equal(sanitizePlayerName('Charlie\u0000\u001F'), 'Charlie');
  });
});

describe('isRecord', () => {
  it('accepts non-null plain objects and records', () => {
    assert.equal(isRecord({}), true);
    assert.equal(isRecord({ a: 1 }), true);
  });

  it('rejects primitives, null, undefined, and arrays', () => {
    assert.equal(isRecord(null), false);
    assert.equal(isRecord(undefined), false);
    assert.equal(isRecord('string'), false);
    assert.equal(isRecord(123), false);
    assert.equal(isRecord(true), false);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord([1, 2]), false);
  });
});

describe('isValidPlayerAction', () => {
  it('accepts valid player action kinds', () => {
    assert.equal(isValidPlayerAction('hit'), true);
    assert.equal(isValidPlayerAction('stand'), true);
    assert.equal(isValidPlayerAction('double'), true);
    assert.equal(isValidPlayerAction('split'), true);
    assert.equal(isValidPlayerAction('surrender'), true);
    assert.equal(isValidPlayerAction('insure'), true);
    assert.equal(isValidPlayerAction('decline-insurance'), true);
  });

  it('rejects invalid actions, primitives, and malicious strings', () => {
    assert.equal(isValidPlayerAction('cheat'), false);
    assert.equal(isValidPlayerAction('__proto__'), false);
    assert.equal(isValidPlayerAction(''), false);
    assert.equal(isValidPlayerAction(null), false);
    assert.equal(isValidPlayerAction(undefined), false);
    assert.equal(isValidPlayerAction(123), false);
    assert.equal(isValidPlayerAction({}), false);
  });
});
describe('sanitizeJoinBalance', () => {
  it('floors fractional balances and caps huge ones', () => {
    assert.equal(sanitizeJoinBalance(500.9), 500);
    assert.equal(sanitizeJoinBalance(0), 0);
    assert.equal(sanitizeJoinBalance(1e15), MAX_JOIN_BALANCE);
  });

  it('falls back to INITIAL_BALANCE on NaN, Infinity, negatives, and non-numbers', () => {
    assert.equal(sanitizeJoinBalance(NaN), INITIAL_BALANCE);
    assert.equal(sanitizeJoinBalance(Infinity), INITIAL_BALANCE);
    assert.equal(sanitizeJoinBalance(-1), INITIAL_BALANCE);
    assert.equal(sanitizeJoinBalance('1000'), INITIAL_BALANCE);
    assert.equal(sanitizeJoinBalance(undefined), INITIAL_BALANCE);
  });
});

describe('ROOM_CODE_PATTERN', () => {
  it('uses the same six-character contract as the room generator and entry form', () => {
    assert.equal(ROOM_CODE_PATTERN.test('ABCD'), false);
    assert.equal(ROOM_CODE_PATTERN.test('ABCD1234'), false);
    assert.equal(ROOM_CODE_PATTERN.test('AB12CD'), true);
  });
  it('accepts normal 6-char codes and rejects malformed input', () => {
    assert.equal(ROOM_CODE_PATTERN.test('ABC123'), true);
    assert.equal(ROOM_CODE_PATTERN.test('abc123'), false); // must be uppercased first
    assert.equal(ROOM_CODE_PATTERN.test('AB C12'), false);
    assert.equal(ROOM_CODE_PATTERN.test('AB'), false);
    assert.equal(ROOM_CODE_PATTERN.test('A'.repeat(9)), false);
    assert.equal(ROOM_CODE_PATTERN.test('ABC-12'), false);
  });
});

describe('sanitizeClientId, sanitizeRoomSettings, and isValidGameStateSync', () => {
  it('validates client IDs strictly', () => {
    assert.equal(sanitizeClientId('client-1234567890'), 'client-1234567890');
    assert.equal(sanitizeClientId('short'), null);
    assert.equal(sanitizeClientId('bad chars!@#$'), null);
    assert.equal(sanitizeClientId(1234567890), null);
  });

  it('sanitizes room settings to strictly boolean flags', () => {
    assert.deepEqual(sanitizeRoomSettings({ splitEnabled: false, insuranceEnabled: false, surrenderEnabled: true }), {
      splitEnabled: false,
      insuranceEnabled: false,
      surrenderEnabled: true,
    });
    assert.equal(sanitizeRoomSettings('invalid'), null);
    assert.equal(sanitizeRoomSettings({ insuranceEnabled: 'yes', surrenderEnabled: true }), null);
  });

  it('validates incoming game-state-sync structures and rejects malformed payloads', () => {
    const valid = {
      phase: 'betting',
      phaseStartedAt: 1000,
      turnStartedAt: 1000,
      roundNumber: 1,
      tableOpen: true,
      hostId: 'blackjack-ABC123',
      hostName: 'Host',
      dealer: { cards: [] },
      players: {
        p1: {
          id: 'p1',
          name: 'Alice',
          balance: 1000,
          activeHandIndex: 0,
          hands: [{ cards: [], bet: 0, stood: false, busted: false, blackjack: false, doubled: false, surrendered: false, insuranceBet: 0 }],
        },
      },
      settings: { splitEnabled: true, insuranceEnabled: true, surrenderEnabled: false },
    };
    assert.equal(isValidGameStateSync(valid), true);
    assert.equal(isValidGameStateSync({ ...valid, phase: 'hacked' }), false);
    assert.equal(isValidGameStateSync({ ...valid, players: { p1: { balance: Infinity, hands: [] } } }), false);
    assert.equal(isValidGameStateSync(null), false);
  });
});
