import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EntryGate } from './entry.ts';

describe('room entry exclusion', () => {
  it('blocks competing actions before the next render', () => {
    const gate = new EntryGate();
    const first = gate.begin();
    assert.notEqual(first, null);
    assert.equal(gate.begin(), null);
    assert.equal(gate.finish(first!), true);
    assert.notEqual(gate.begin(), null);
  });
  it('a cancelled attempt cannot finish or replace a newer attempt', () => {
    const gate = new EntryGate();
    const first = gate.begin()!;
    gate.cancel();
    const next = gate.begin()!;
    assert.equal(gate.isCurrent(first), false);
    assert.equal(gate.finish(first), false);
    assert.equal(gate.isCurrent(next), true);
    assert.equal(gate.finish(next), true);
  });
});
