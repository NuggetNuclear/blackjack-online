import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState, BETTING_TIMEOUT_MS } from './blackjack.ts';
import { hostClockOffset, isBettingOpen, roundCountdown } from './clock.ts';

describe('authoritative room clock', () => {
  it('keeps elapsed time when a player joins late, including a different local clock', () => {
    const state = { ...createInitialGameState(), tableOpen: true, phaseStartedAt: 100_000 };
    // Client clock is 40 seconds ahead; request sent with 3 seconds left.
    const offset = hostClockOffset(157_000, 117_100, 157_200);
    assert.equal(offset, -39_900);
    const countdown = roundCountdown(state, 157_200, offset);
    assert.equal(countdown.bettingRemainingMs, 2700);
    assert.equal(countdown.bettingSecondsLeft, 3);
  });
  it('does not reopen the deadline on repeated syncs or action clock updates', () => {
    const state = { ...createInitialGameState(), tableOpen: true, phaseStartedAt: 1000 };
    assert.equal(roundCountdown(state, 20_000, 0).bettingRemainingMs, 1000);
    assert.equal(roundCountdown({ ...state, turnStartedAt: 20_200 }, 20_500, 0).bettingRemainingMs, 500);
    assert.equal(roundCountdown(state, 21_000, 0).bettingTimeExpired, true);
  });
  it('disables betting before clock synchronization and while the room is closed', () => {
    const state = { ...createInitialGameState(), phaseStartedAt: 1000, tableOpen: true };
    assert.equal(roundCountdown(state, 2000, null).bettingTimeExpired, true);
    assert.equal(roundCountdown({ ...state, tableOpen: false }, 2000, 0).bettingSecondsLeft, 0);
    assert.equal(isBettingOpen({ ...state, tableOpen: false }, 2000), false);
  });
  it('rejects a bet at the host deadline even if the phase has not advanced yet', () => {
    const state = { ...createInitialGameState(), tableOpen: true, phaseStartedAt: 1000 };
    assert.equal(isBettingOpen(state, 1000 + BETTING_TIMEOUT_MS - 1), true);
    assert.equal(isBettingOpen(state, 1000 + BETTING_TIMEOUT_MS), false);
  });
  it('rejects malformed clock samples', () => {
    assert.equal(hostClockOffset(NaN, 1, 2), null);
    assert.equal(hostClockOffset(3, 1, 2), null);
    assert.equal(hostClockOffset(1, Infinity, 2), null);
  });
});
