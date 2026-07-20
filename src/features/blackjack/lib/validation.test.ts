// Payload validation tests. Run with: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INITIAL_BALANCE } from './wallet.ts';
import {
  isValidBet,
  sanitizePlayerName,
  sanitizeJoinBalance,
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
  it('accepts normal 6-char codes and rejects malformed input', () => {
    assert.equal(ROOM_CODE_PATTERN.test('ABC123'), true);
    assert.equal(ROOM_CODE_PATTERN.test('abc123'), false); // must be uppercased first
    assert.equal(ROOM_CODE_PATTERN.test('AB C12'), false);
    assert.equal(ROOM_CODE_PATTERN.test('AB'), false);
    assert.equal(ROOM_CODE_PATTERN.test('A'.repeat(9)), false);
    assert.equal(ROOM_CODE_PATTERN.test('ABC-12'), false);
  });
});
