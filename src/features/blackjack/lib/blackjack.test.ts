// Engine unit tests. Run with: npm test
// (Node's built-in test runner + type stripping — no test dependencies.)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Card, Rank, Suit, Hand, GameState } from './blackjack.ts';
import {
  DEFAULT_ROOM_SETTINGS,
  RESHUFFLE_THRESHOLD,
  createDeck,
  createEmptyHand,
  handValue,
  isSoft17,
  isBlackjack,
  canSplit,
  nextPlayableHandIndex,
  dealInitialCards,
  playerHit,
  playerStand,
  playerDoubleDown,
  playerSplit,
  playerSurrender,
  playerInsure,
  shouldDealerHit,
  resolveResults,
  sanitizeStateForBroadcast,
  isDealerBlackjackPending,
} from './blackjack.ts';

function c(rank: Rank, suit: Suit = 'spades', faceUp = true): Card {
  return { rank, suit, faceUp };
}

function hand(cards: Card[], overrides: Partial<Hand> = {}): Hand {
  return { ...createEmptyHand(), cards, bet: 10, ...overrides };
}

/** Filler deck large enough that dealCard never triggers the emergency
 *  refill. Cards passed in `top` are drawn first (dealCard pops the end). */
function deckWithTop(top: Card[]): Card[] {
  const filler: Card[] = Array.from({ length: 80 }, () => c('2', 'clubs'));
  return [...filler, ...top.slice().reverse()];
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing',
    phaseStartedAt: Date.now(),
    turnStartedAt: Date.now(),
    deck: deckWithTop([]),
    dealer: createEmptyHand(),
    players: {},
    roundNumber: 1,
    settings: { ...DEFAULT_ROOM_SETTINGS, insuranceEnabled: true, surrenderEnabled: true },
    tableOpen: true,
    hostId: 'host',
    hostName: 'Host',
    ...overrides,
  };
}

function statePlayer(state: GameState, id = 'p1') {
  const player = state.players[id];
  assert.ok(player, `player ${id} missing`);
  return player;
}

describe('hand valuation', () => {
  it('counts aces as 11 then downgrades to avoid busting', () => {
    assert.equal(handValue([c('A'), c('9')]), 20);
    assert.equal(handValue([c('A'), c('9'), c('5')]), 15);
    assert.equal(handValue([c('A'), c('A'), c('9')]), 21);
    assert.equal(handValue([c('A'), c('A'), c('A'), c('K')]), 13);
  });

  it('counts face cards as 10', () => {
    assert.equal(handValue([c('J'), c('Q')]), 20);
    assert.equal(handValue([c('K'), c('5'), c('6')]), 21);
  });

  it('detects soft 17 vs hard 17', () => {
    assert.equal(isSoft17([c('A'), c('6')]), true);
    assert.equal(isSoft17([c('10'), c('7')]), false);
    assert.equal(isSoft17([c('A'), c('6'), c('10')]), false); // ace downgraded → hard 17
  });

  it('detects natural blackjack only on two cards', () => {
    assert.equal(isBlackjack([c('A'), c('K')]), true);
    assert.equal(isBlackjack([c('7'), c('7'), c('7')]), false);
  });
});

describe('dealer rules', () => {
  it('dealer stands on soft 17', () => {
    const state = baseState({
      phase: 'dealer-turn',
      dealer: hand([c('A'), c('6')], { bet: 0 }),
      players: { p1: { id: 'p1', name: 'P', hands: [hand([c('10'), c('9')], { stood: true })], activeHandIndex: 1, balance: 100, ready: true } },
    });
    assert.equal(shouldDealerHit(state), false);
  });

  it('dealer hits 16 and does not draw when every player busted', () => {
    const dealer = hand([c('10'), c('6')], { bet: 0 });
    const active = baseState({
      phase: 'dealer-turn',
      dealer,
      players: { p1: { id: 'p1', name: 'P', hands: [hand([c('10'), c('9')], { stood: true })], activeHandIndex: 1, balance: 100, ready: true } },
    });
    assert.equal(shouldDealerHit(active), true);

    const allBusted = baseState({
      phase: 'dealer-turn',
      dealer,
      players: { p1: { id: 'p1', name: 'P', hands: [hand([c('10'), c('9'), c('5')], { busted: true })], activeHandIndex: 1, balance: 100, ready: true } },
    });
    assert.equal(shouldDealerHit(allBusted), false);
  });
});

describe('nextPlayableHandIndex', () => {
  it('skips resolved hands and stops at a playable one', () => {
    const hands = [
      hand([c('10'), c('A')], { stood: true }),
      hand([c('10'), c('A')], { stood: true }),
      hand([c('9'), c('9')]),
    ];
    assert.equal(nextPlayableHandIndex(hands, 0), 2);
    assert.equal(nextPlayableHandIndex(hands, 1), 2);
  });

  it('returns hands.length when nothing is playable', () => {
    const hands = [hand([c('10'), c('9')], { stood: true })];
    assert.equal(nextPlayableHandIndex(hands, 0), 1);
  });
});

describe('splitting', () => {
  it('allows mixed ten-value splits and enforces limits', () => {
    const settings = DEFAULT_ROOM_SETTINGS;
    assert.equal(canSplit(hand([c('10'), c('J')]), 100, settings, 1), true);
    assert.equal(canSplit(hand([c('9'), c('10')]), 100, settings, 1), false);
    assert.equal(canSplit(hand([c('8'), c('8')]), 100, settings, 4), false); // max 4 hands
    assert.equal(canSplit(hand([c('8'), c('8')]), 5, settings, 1), false); // cannot afford
    assert.equal(canSplit(hand([c('8'), c('8')]), 100, { ...settings, splitEnabled: false }, 1), false);
  });

  it('advances past split hands that both auto-stand on 21 (stuck-hand regression)', () => {
    // Player has a pair of tens (active) plus a later playable hand from an
    // earlier split. Both split hands will draw an ace → auto-stand on 21.
    // The active index must skip to the remaining playable hand.
    const state = baseState({
      deck: deckWithTop([c('A', 'hearts'), c('A', 'diamonds')]),
      players: {
        p1: {
          id: 'p1',
          name: 'P',
          hands: [hand([c('10', 'spades'), c('10', 'hearts')]), hand([c('6'), c('9')])],
          activeHandIndex: 0,
          balance: 100,
          ready: true,
        },
      },
    });

    const next = playerSplit(state, 'p1');
    const player = statePlayer(next);
    assert.equal(player.hands.length, 3);
    assert.equal(handValue(player.hands[0].cards), 21);
    assert.equal(handValue(player.hands[1].cards), 21);
    assert.equal(player.hands[0].stood, true);
    assert.equal(player.hands[1].stood, true);
    assert.equal(player.hands[0].blackjack, false); // split 21 is not a natural
    assert.equal(player.activeHandIndex, 2); // skipped both stood hands
    assert.equal(player.balance, 90); // second bet deducted
  });

  it('hitting to 21 skips a following auto-stood hand', () => {
    const state = baseState({
      deck: deckWithTop([c('5', 'hearts')]),
      players: {
        p1: {
          id: 'p1',
          name: 'P',
          hands: [
            hand([c('10'), c('6')]),
            hand([c('10', 'hearts'), c('A', 'hearts')], { stood: true }), // auto-stood split 21
            hand([c('7'), c('7')]),
          ],
          activeHandIndex: 0,
          balance: 100,
          ready: true,
        },
      },
    });

    const next = playerHit(state, 'p1');
    const player = statePlayer(next);
    assert.equal(handValue(player.hands[0].cards), 21);
    assert.equal(player.hands[0].stood, true);
    assert.equal(player.activeHandIndex, 2);
  });
});

describe('phase guards', () => {
  it('rejects actions outside the playing phase', () => {
    const players = {
      p1: { id: 'p1', name: 'P', hands: [hand([c('10'), c('6')])], activeHandIndex: 0, balance: 100, ready: true },
    };
    for (const phase of ['betting', 'dealer-turn', 'results'] as const) {
      const state = baseState({ phase, players });
      assert.equal(playerHit(state, 'p1'), state);
      assert.equal(playerStand(state, 'p1'), state);
      assert.equal(playerDoubleDown(state, 'p1'), state);
      assert.equal(playerSplit(state, 'p1'), state);
      assert.equal(playerSurrender(state, 'p1'), state);
    }
  });
});

describe('double down and surrender', () => {
  it('doubles the bet, draws exactly one card, and stands', () => {
    const state = baseState({
      deck: deckWithTop([c('5', 'hearts')]),
      players: { p1: { id: 'p1', name: 'P', hands: [hand([c('6'), c('5')])], activeHandIndex: 0, balance: 100, ready: true } },
    });
    const next = playerDoubleDown(state, 'p1');
    const player = statePlayer(next);
    assert.equal(player.hands[0].bet, 20);
    assert.equal(player.hands[0].cards.length, 3);
    assert.equal(player.hands[0].stood, true);
    assert.equal(player.balance, 90);
  });

  it('refunds half the bet on surrender', () => {
    const state = baseState({
      players: { p1: { id: 'p1', name: 'P', hands: [hand([c('10'), c('6')])], activeHandIndex: 0, balance: 100, ready: true } },
    });
    const next = playerSurrender(state, 'p1');
    const player = statePlayer(next);
    assert.equal(player.hands[0].surrendered, true);
    assert.equal(player.balance, 105);
  });
});

describe('insurance', () => {
  const dealerAce = () => hand([c('A', 'hearts'), c('K', 'clubs', false)], { bet: 0 });

  it('costs half the bet and is deducted from balance', () => {
    const state = baseState({
      dealer: dealerAce(),
      players: { p1: { id: 'p1', name: 'P', hands: [hand([c('10'), c('6')])], activeHandIndex: 0, balance: 100, ready: true } },
    });
    const next = playerInsure(state, 'p1');
    const player = statePlayer(next);
    assert.equal(player.hands[0].insuranceBet, 5);
    assert.equal(player.balance, 95);
  });

  it('is rejected after the player has acted (3+ cards) or split', () => {
    const acted = baseState({
      dealer: dealerAce(),
      players: { p1: { id: 'p1', name: 'P', hands: [hand([c('2'), c('3'), c('5')])], activeHandIndex: 0, balance: 100, ready: true } },
    });
    assert.equal(playerInsure(acted, 'p1'), acted);

    const split = baseState({
      dealer: dealerAce(),
      players: {
        p1: { id: 'p1', name: 'P', hands: [hand([c('8'), c('5')]), hand([c('8'), c('7')])], activeHandIndex: 0, balance: 100, ready: true },
      },
    });
    assert.equal(playerInsure(split, 'p1'), split);
  });

  it('is rejected when the dealer does not show an ace or the rule is off', () => {
    const noAce = baseState({
      dealer: hand([c('9', 'hearts'), c('K', 'clubs', false)], { bet: 0 }),
      players: { p1: { id: 'p1', name: 'P', hands: [hand([c('10'), c('6')])], activeHandIndex: 0, balance: 100, ready: true } },
    });
    assert.equal(playerInsure(noAce, 'p1'), noAce);

    const ruleOff = baseState({
      dealer: dealerAce(),
      settings: { ...DEFAULT_ROOM_SETTINGS, insuranceEnabled: false },
      players: { p1: { id: 'p1', name: 'P', hands: [hand([c('10'), c('6')])], activeHandIndex: 0, balance: 100, ready: true } },
    });
    assert.equal(playerInsure(ruleOff, 'p1'), ruleOff);
  });
});

describe('settlement', () => {
  function settle(playerHands: Hand[], dealerCards: Card[], dealerFlags: Partial<Hand> = {}) {
    const state = baseState({
      phase: 'results',
      dealer: hand(dealerCards, { bet: 0, stood: true, ...dealerFlags }),
      players: { p1: { id: 'p1', name: 'P', hands: playerHands, activeHandIndex: playerHands.length, balance: 100, ready: true } },
    });
    return statePlayer(resolveResults(state));
  }

  it('pays 3:2 on natural blackjack', () => {
    const player = settle([hand([c('A'), c('K')], { blackjack: true, stood: true })], [c('10', 'hearts'), c('9', 'hearts')]);
    assert.equal(player.hands[0].result, 'blackjack');
    assert.equal(player.hands[0].payout, 25); // 10 + floor(10 * 1.5)
    assert.equal(player.balance, 125);
  });

  it('pays 1:1 on a win and pushes ties', () => {
    const win = settle([hand([c('10'), c('9')], { stood: true })], [c('10', 'hearts'), c('8', 'hearts')]);
    assert.equal(win.hands[0].result, 'win');
    assert.equal(win.balance, 120);

    const push = settle([hand([c('10'), c('9')], { stood: true })], [c('10', 'hearts'), c('9', 'hearts')]);
    assert.equal(push.hands[0].result, 'push');
    assert.equal(push.balance, 110);
  });

  it('player blackjack pushes against dealer blackjack', () => {
    const player = settle(
      [hand([c('A'), c('K')], { blackjack: true, stood: true })],
      [c('A', 'hearts'), c('Q', 'hearts')],
      { blackjack: true }
    );
    assert.equal(player.hands[0].result, 'push');
    assert.equal(player.balance, 110);
  });

  it('busted hand loses even when the dealer busts', () => {
    const player = settle(
      [hand([c('10'), c('9'), c('5')], { busted: true })],
      [c('10', 'hearts'), c('9', 'hearts'), c('5', 'hearts')],
      { busted: true }
    );
    assert.equal(player.hands[0].result, 'lose');
    assert.equal(player.balance, 100);
  });

  it('surrendered hand gets no payout at settlement (half was refunded earlier)', () => {
    const player = settle([hand([c('10'), c('6')], { surrendered: true, stood: true })], [c('10', 'hearts'), c('9', 'hearts')]);
    assert.equal(player.hands[0].result, 'lose');
    assert.equal(player.balance, 100);
  });

  it('pays insurance 2:1 plus stake when dealer has blackjack, loses it otherwise', () => {
    const insured = settle(
      [hand([c('10'), c('9')], { stood: true, insuranceBet: 5 })],
      [c('A', 'hearts'), c('K', 'hearts')],
      { blackjack: true }
    );
    assert.equal(insured.insurancePayout, 15);
    assert.equal(insured.balance, 115); // hand loses, insurance pays 15

    const wasted = settle(
      [hand([c('10'), c('9')], { stood: true, insuranceBet: 5 })],
      [c('10', 'hearts'), c('8', 'hearts')]
    );
    assert.equal(wasted.insurancePayout, undefined);
    assert.equal(wasted.balance, 120); // hand wins, insurance stake already gone
  });
});

describe('shoe management', () => {
  it('swaps in a fresh shoe at the round boundary when below the threshold', () => {
    const shortDeck = Array.from({ length: RESHUFFLE_THRESHOLD - 1 }, () => c('2', 'clubs'));
    const state = baseState({
      phase: 'betting',
      deck: shortDeck,
      players: { p1: { id: 'p1', name: 'P', hands: [hand([])], activeHandIndex: 0, balance: 100, ready: true } },
    });
    const next = dealInitialCards(state);
    // 2 player cards + 2 dealer cards drawn from a fresh 312-card shoe
    assert.equal(next.deck.length, 312 - 4);
  });

  it('keeps the current shoe when above the threshold', () => {
    const deck = createDeck(6).slice(0, RESHUFFLE_THRESHOLD + 20);
    const state = baseState({
      phase: 'betting',
      deck,
      players: { p1: { id: 'p1', name: 'P', hands: [hand([])], activeHandIndex: 0, balance: 100, ready: true } },
    });
    const next = dealInitialCards(state);
    assert.equal(next.deck.length, deck.length - 4);
  });
});

describe('broadcast sanitization', () => {
  it('strips the deck and masks the dealer hole card', () => {
    const holeCard = c('7', 'diamonds', false);
    const state = baseState({
      dealer: hand([c('A', 'hearts'), holeCard], { bet: 0 }),
      players: { p1: { id: 'p1', name: 'P', hands: [hand([c('10'), c('6')])], activeHandIndex: 0, balance: 100, ready: true } },
    });

    const sanitized = sanitizeStateForBroadcast(state);
    assert.equal(sanitized.deck.length, 0);
    assert.equal(sanitized.dealer.cards.length, 2);
    assert.equal(sanitized.dealer.cards[0].rank, 'A'); // up-card intact
    const maskedHole = sanitized.dealer.cards[1];
    assert.equal(maskedHole.faceUp, false);
    assert.notEqual(`${maskedHole.rank}-${maskedHole.suit}`, '7-diamonds'); // real card not leaked
    // Original state untouched
    assert.equal(state.dealer.cards[1].rank, '7');
    // Face-up player hands are passed through unchanged
    assert.equal(sanitized.players.p1, state.players.p1);
  });

  it('leaves fully face-up dealers unchanged', () => {
    const state = baseState({
      phase: 'dealer-turn',
      dealer: hand([c('A', 'hearts'), c('K', 'clubs')], { bet: 0 }),
    });
    const sanitized = sanitizeStateForBroadcast(state);
    assert.deepEqual(sanitized.dealer.cards, state.dealer.cards);
  });
});

describe('isDealerBlackjackPending', () => {
  it('is true only while a natural 21 has a face-down hole card', () => {
    const pending = baseState({ dealer: hand([c('A', 'hearts'), c('K', 'clubs', false)], { bet: 0 }) });
    assert.equal(isDealerBlackjackPending(pending), true);

    const revealed = baseState({ dealer: hand([c('A', 'hearts'), c('K', 'clubs')], { bet: 0 }) });
    assert.equal(isDealerBlackjackPending(revealed), false);

    const noBJ = baseState({ dealer: hand([c('A', 'hearts'), c('9', 'clubs', false)], { bet: 0 }) });
    assert.equal(isDealerBlackjackPending(noBJ), false);
  });
});
