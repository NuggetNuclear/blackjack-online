// ========================
// Blackjack Game Engine
// ========================

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export interface Hand {
  cards: Card[];
  bet: number;
  stood: boolean;
  busted: boolean;
  blackjack: boolean;
  doubled: boolean;
  surrendered: boolean;
  insuranceBet: number;
  result?: 'win' | 'lose' | 'push' | 'blackjack';
  payout?: number;
}

export type GamePhase = 'betting' | 'playing' | 'dealer-turn' | 'results';

export interface RoomSettings {
  insuranceEnabled: boolean;
  surrenderEnabled: boolean;
  splitEnabled: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  insuranceEnabled: false,
  surrenderEnabled: false,
  splitEnabled: true,
};

export const BETTING_TIMEOUT_MS = 20_000;
export const NEXT_ROUND_TIMEOUT_MS = 5_000;
export const PLAYER_ACTION_TIMEOUT_MS = 10_000;

export interface PlayerState {
  id: string;
  name: string;
  hands: Hand[];
  activeHandIndex: number;
  balance: number;
  ready: boolean; // true when bet is placed
  insurancePayout?: number;
}

export interface GameState {
  phase: GamePhase;
  phaseStartedAt: number;
  /** Timestamp when the current active player's turn started.
   *  Reset whenever a player acts or turn advances. Used for the
   *  10-second action timer. */
  turnStartedAt: number;
  deck: Card[];
  dealer: Hand;
  players: Record<string, PlayerState>;
  roundNumber: number;
  settings: RoomSettings;
  tableOpen: boolean;
  hostId: string;
  hostName: string;
  tableMessage?: { text: string; id: number };
}

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(numDecks: number = 6): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank, faceUp: true });
      }
    }
  }
  return shuffleDeck(deck);
}

/** Uniform random integer in [0, maxExclusive) from the platform CSPRNG,
 *  using rejection sampling to avoid modulo bias. */
function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % maxExclusive;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}


export function handValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === 'A') {
      aces++;
      total += 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      total += 10;
    } else {
      total += parseInt(card.rank);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

export function isSoft17(cards: Card[]): boolean {
  const total = handValue(cards);
  if (total !== 17) return false;
  // Check if there's an ace counted as 11
  let sum = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === 'A') {
      aces++;
      sum += 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      sum += 10;
    } else {
      sum += parseInt(card.rank);
    }
  }
  // Count how many aces we had to reduce
  let reduced = 0;
  while (sum > 21 && reduced < aces) {
    sum -= 10;
    reduced++;
  }
  // Soft 17 means at least one ace is still counted as 11
  return reduced < aces;
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

export function isBusted(cards: Card[]): boolean {
  return handValue(cards) > 21;
}

export function canDoubleDown(hand: Hand): boolean {
  return hand.cards.length === 2 && !hand.doubled && !hand.stood && !hand.busted;
}

export function createEmptyHand(): Hand {
  return {
    cards: [],
    bet: 0,
    stood: false,
    busted: false,
    blackjack: false,
    doubled: false,
    surrendered: false,
    insuranceBet: 0,
  };
}

/** When the shoe drops below this many cards at the start of a round, it is
 *  replaced with a fresh shuffled shoe BEFORE dealing. Keeping the swap at the
 *  round boundary means the emergency mid-round refill in dealCard (which can
 *  briefly duplicate cards already on the table) is practically unreachable. */
export const RESHUFFLE_THRESHOLD = 60;

export function dealCard(deck: Card[], faceUp: boolean = true): { card: Card; deck: Card[] } {
  if (deck.length < 20) {
    deck = createDeck(6);
  }
  const newDeck = [...deck];
  const card = { ...newDeck.pop()!, faceUp };
  return { card, deck: newDeck };
}

/** Placeholder substituted for any face-down card when replicating state to
 *  peers. The real rank/suit stays host-only until the card is flipped. */
const HIDDEN_CARD: Card = { suit: 'spades', rank: 'A', faceUp: false };

function maskFaceDownCards(hand: Hand): Hand {
  if (!hand.cards.some((c) => !c.faceUp)) return hand;
  return { ...hand, cards: hand.cards.map((c) => (c.faceUp ? c : { ...HIDDEN_CARD })) };
}

/** State that is safe to replicate to non-host clients: the deck is stripped
 *  and every face-down card (the dealer hole card) is masked, so peers can
 *  never read hidden card values out of the synced payload. */
export function sanitizeStateForBroadcast(state: GameState): GameState {
  let players = state.players;
  for (const [id, player] of Object.entries(state.players)) {
    const maskedHands = player.hands.map(maskFaceDownCards);
    if (maskedHands.some((hand, i) => hand !== player.hands[i])) {
      if (players === state.players) players = { ...players };
      players[id] = { ...player, hands: maskedHands };
    }
  }
  return { ...state, deck: [], dealer: maskFaceDownCards(state.dealer), players };
}

/** True while the dealer holds an unrevealed natural blackjack: the hole card
 *  is still face down but the two dealer cards already total 21. Host-only
 *  knowledge — the sanitized broadcast masks the hole card, so peers cannot
 *  compute this themselves. */
export function isDealerBlackjackPending(state: GameState): boolean {
  return state.dealer.cards.some((c) => !c.faceUp) && isBlackjack(state.dealer.cards);
}

export function createInitialGameState(settings: RoomSettings = DEFAULT_ROOM_SETTINGS): GameState {
  return {
    phase: 'betting',
    phaseStartedAt: Date.now(),
    turnStartedAt: Date.now(),
    deck: createDeck(6),
    dealer: createEmptyHand(),
    players: {},
    roundNumber: 0,
    settings,
    tableOpen: false,
    hostId: '',
    hostName: '',
  };
}

/** First hand index at or after `fromIndex` that can still be played, skipping
 *  hands that are already resolved (e.g. split hands that auto-stood on 21).
 *  Returns hands.length when no playable hand remains. */
export function nextPlayableHandIndex(hands: Hand[], fromIndex: number): number {
  let index = Math.max(0, fromIndex);
  while (index < hands.length) {
    const hand = hands[index];
    if (!hand.stood && !hand.busted && !hand.blackjack && !hand.surrendered) break;
    index++;
  }
  return index;
}

export function dealInitialCards(state: GameState): GameState {
  // Swap in a fresh shoe at the round boundary, before any card is committed.
  let deck = state.deck.length < RESHUFFLE_THRESHOLD ? createDeck(6) : [...state.deck];
  const newPlayers = { ...state.players };
  const activePlayerIds = Object.keys(state.players).filter((id) => {
    const player = state.players[id];
    const hand = player?.hands[0];
    return !!player && player.ready && !!hand && hand.bet > 0;
  });

  // Deal 2 cards to each player
  for (const id of activePlayerIds) {
    const cards: Card[] = [];
    for (let i = 0; i < 2; i++) {
      const result = dealCard(deck);
      cards.push(result.card);
      deck = result.deck;
    }
    const hand = newPlayers[id].hands[0]; // players always start round with 1 hand
    newPlayers[id] = {
      ...newPlayers[id],
      hands: [{
        ...hand,
        cards,
        blackjack: isBlackjack(cards),
        stood: isBlackjack(cards),
      }],
      activeHandIndex: 0,
    };
  }

  for (const [id, player] of Object.entries(newPlayers)) {
    if (activePlayerIds.includes(id)) continue;
    newPlayers[id] = {
      ...player,
      hands: [{ ...createEmptyHand(), stood: true }],
      activeHandIndex: 0,
    };
  }

  // Deal 2 cards to dealer (second card face down)
  const dealerCards: Card[] = [];
  let result = dealCard(deck, true);
  dealerCards.push(result.card);
  deck = result.deck;
  result = dealCard(deck, false);
  dealerCards.push(result.card);
  deck = result.deck;

  return {
    ...state,
    tableMessage: undefined,
    deck,
    phase: 'playing',
    phaseStartedAt: Date.now(),
    turnStartedAt: Date.now(),
    dealer: {
      ...state.dealer,
      cards: dealerCards,
      // NOTE: Do NOT set blackjack here — the hole card is face-down, so
      // setting the flag would leak its value to all clients via state sync.
      // BJ detection happens in flipDealerHoleCard / finalizeDealerHand.
    },
    players: newPlayers,
    roundNumber: state.roundNumber + 1,
  };
}

export function playerHit(state: GameState, playerId: string): GameState {
  if (state.phase !== 'playing') return state;
  const player = state.players[playerId];
  if (!player) return state;
  if (player.activeHandIndex >= player.hands.length) return state;
  const hand = player.hands[player.activeHandIndex];
  if (!hand || hand.cards.length < 2 || hand.stood || hand.busted) return state;

  const { card, deck } = dealCard(state.deck);
  const newCards = [...hand.cards, card];
  const busted = isBusted(newCards);
  const stood = busted || handValue(newCards) === 21;

  const newHands = [...player.hands];
  newHands[player.activeHandIndex] = { ...hand, cards: newCards, busted, stood };

  return {
    ...state,
    deck,
    turnStartedAt: Date.now(),
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        hands: newHands,
        activeHandIndex: stood
          ? nextPlayableHandIndex(newHands, player.activeHandIndex + 1)
          : player.activeHandIndex,
      },
    },
  };
}

export function playerStand(state: GameState, playerId: string): GameState {
  if (state.phase !== 'playing') return state;
  const player = state.players[playerId];
  if (!player) return state;
  if (player.activeHandIndex >= player.hands.length) return state;
  const hand = player.hands[player.activeHandIndex];
  if (!hand || hand.cards.length < 2 || hand.stood || hand.busted) return state;

  const newHands = [...player.hands];
  newHands[player.activeHandIndex] = { ...hand, stood: true };

  return {
    ...state,
    turnStartedAt: Date.now(),
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        hands: newHands,
        activeHandIndex: nextPlayableHandIndex(newHands, player.activeHandIndex + 1),
      },
    },
  };
}

export function playerDoubleDown(state: GameState, playerId: string): GameState {
  if (state.phase !== 'playing') return state;
  const player = state.players[playerId];
  if (!player) return state;
  const hand = player.hands[player.activeHandIndex];
  if (!hand || !canDoubleDown(hand)) return state;
  if (player.balance < hand.bet) return state;

  const { card, deck } = dealCard(state.deck);
  const newCards = [...hand.cards, card];
  const busted = isBusted(newCards);

  const newHands = [...player.hands];
  newHands[player.activeHandIndex] = {
    ...hand,
    cards: newCards,
    bet: hand.bet * 2,
    doubled: true,
    stood: true,
    busted,
  };

  return {
    ...state,
    deck,
    turnStartedAt: Date.now(),
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        balance: player.balance - hand.bet,
        hands: newHands,
        activeHandIndex: nextPlayableHandIndex(newHands, player.activeHandIndex + 1),
      },
    },
  };
}

// ===== Splitting =====

export function canSplit(hand: Hand, balance: number, settings: RoomSettings, handsCount: number): boolean {
  if (!settings.splitEnabled || handsCount >= 4) return false;
  if (hand.cards.length !== 2 || hand.stood || hand.busted || hand.doubled || hand.surrendered) return false;
  if (balance < hand.bet) return false;
  
  const c1 = hand.cards[0];
  const c2 = hand.cards[1];
  
  // Can split if ranks match OR if both are 10-value cards (10, J, Q, K are interchangeable)
  const v1 = ['J', 'Q', 'K'].includes(c1.rank) ? '10' : c1.rank;
  const v2 = ['J', 'Q', 'K'].includes(c2.rank) ? '10' : c2.rank;
  
  return v1 === v2;
}

export function playerSplit(state: GameState, playerId: string): GameState {
  if (state.phase !== 'playing') return state;
  const player = state.players[playerId];
  if (!player) return state;
  const handIndex = player.activeHandIndex;
  const hand = player.hands[handIndex];
  
  if (!hand || !canSplit(hand, player.balance, state.settings, player.hands.length)) return state;

  let deck = [...state.deck];
  const card1 = hand.cards[0];
  const card2 = hand.cards[1];

  // Draw two new cards for the two hands
  const result1 = dealCard(deck);
  const newCard1 = result1.card;
  deck = result1.deck;

  const result2 = dealCard(deck);
  const newCard2 = result2.card;
  deck = result2.deck;
  const hand1HasTwentyOne = handValue([card1, newCard1]) === 21;
  const hand2HasTwentyOne = handValue([card2, newCard2]) === 21;

  const hand1: Hand = {
    ...hand,
    cards: [card1, newCard1],
    blackjack: false,
    stood: hand1HasTwentyOne, // Split hands auto-stand on 21, but are not natural blackjacks
  };

  const hand2: Hand = {
    ...hand,
    cards: [card2, newCard2],
    blackjack: false,
    stood: hand2HasTwentyOne,
  };

  const newHands = [...player.hands];
  newHands.splice(handIndex, 1, hand1, hand2);

  // Advance to the first hand that is still playable — both split hands may
  // have auto-stood on 21, and earlier splits can leave playable hands further
  // down the array.
  const nextActiveIndex = nextPlayableHandIndex(newHands, handIndex);

  return {
    ...state,
    deck,
    turnStartedAt: Date.now(),
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        balance: player.balance - hand.bet,
        hands: newHands,
        activeHandIndex: nextActiveIndex,
      },
    },
  };
}

export function allPlayersFinished(state: GameState): boolean {
  return Object.values(state.players).every(
    (p) => p.hands.every((h) => h.stood || h.busted || h.blackjack || h.surrendered)
  );
}

// ===== Surrender =====

export function canSurrender(hand: Hand, surrenderEnabled: boolean): boolean {
  return surrenderEnabled && hand.cards.length === 2 && !hand.stood && !hand.busted && !hand.doubled && !hand.surrendered && !hand.blackjack;
}

export function playerSurrender(state: GameState, playerId: string): GameState {
  if (state.phase !== 'playing') return state;
  const player = state.players[playerId];
  if (!player) return state;
  const hand = player.hands[player.activeHandIndex];
  if (!hand || !canSurrender(hand, state.settings.surrenderEnabled)) return state;

  const halfBet = Math.floor(hand.bet / 2);
  const newHands = [...player.hands];
  newHands[player.activeHandIndex] = {
    ...hand,
    surrendered: true,
    stood: true,
  };

  return {
    ...state,
    turnStartedAt: Date.now(),
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        balance: player.balance + halfBet,
        hands: newHands,
        activeHandIndex: nextPlayableHandIndex(newHands, player.activeHandIndex + 1),
      },
    },
  };
}

// ===== Insurance =====

export function dealerShowsAce(state: GameState): boolean {
  if (state.dealer.cards.length < 1) return false;
  const upCard = state.dealer.cards.find((c) => c.faceUp);
  return upCard?.rank === 'A';
}

export function playerInsure(state: GameState, playerId: string): GameState {
  if (state.phase !== 'playing') return state;
  if (!state.settings.insuranceEnabled) return state;
  if (!dealerShowsAce(state)) return state;

  const player = state.players[playerId];
  if (!player) return state;
  // Standard rule: insurance is only offered on the un-acted initial hand —
  // exactly 2 cards, no split yet, no prior insurance.
  if (player.hands.length !== 1) return state;
  const hand = player.hands[0];
  if (!hand || hand.bet <= 0 || hand.cards.length !== 2) return state;
  if (hand.stood || hand.busted || hand.surrendered || hand.blackjack) return state;
  if (hand.insuranceBet > 0) return state;
  const insuranceCost = Math.floor(hand.bet / 2);
  if (insuranceCost <= 0) return state;
  if (insuranceCost > player.balance) return state;

  const newHands = [...player.hands];
  newHands[0] = { ...hand, insuranceBet: insuranceCost };

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        balance: player.balance - insuranceCost,
        hands: newHands,
      },
    },
  };
}

export function playerDeclineInsurance(state: GameState): GameState {
  // No-op on state, but useful for tracking — insurance bet stays 0
  return state;
}

/** @deprecated Use the step-by-step animated path (flipDealerHoleCard → dealerHitOne → finalizeDealerHand) instead. */
export function playDealerHand(state: GameState): GameState {
  let deck = [...state.deck];
  const dealerCards = state.dealer.cards.map((c) => ({ ...c, faceUp: true }));

  // Check if all players busted
  const allBusted = Object.values(state.players).every((p) => p.hands.every(h => h.busted));
  if (allBusted) {
    return {
      ...state,
      deck,
      phase: 'results',
      phaseStartedAt: Date.now(),
      dealer: {
        ...state.dealer,
        cards: dealerCards,
        stood: true,
      },
    };
  }

  // Dealer hits on 16 and below, stands on hard 17+
  // Dealer stands on soft 17 (per user rules)
  while (handValue(dealerCards) < 17) {
    const result = dealCard(deck);
    dealerCards.push(result.card);
    deck = result.deck;
  }

  const busted = isBusted(dealerCards);

  return {
    ...state,
    deck,
    phase: 'results',
    phaseStartedAt: Date.now(),
    dealer: {
      ...state.dealer,
      cards: dealerCards,
      busted,
      stood: true,
      blackjack: isBlackjack(dealerCards),
    },
  };
}

// ===== Step-by-step dealer functions for animated play =====

/** Flip the dealer's hole card face-up and transition to dealer-turn phase */
export function flipDealerHoleCard(state: GameState): GameState {
  const dealerCards = state.dealer.cards.map((c) => ({ ...c, faceUp: true }));
  return {
    ...state,
    phase: 'dealer-turn',
    phaseStartedAt: Date.now(),
    dealer: {
      ...state.dealer,
      cards: dealerCards,
    },
  };
}

/** Check if the dealer should draw another card (hits on <17) */
export function shouldDealerHit(state: GameState): boolean {
  const allBusted = Object.values(state.players).every((p) => p.hands.every(h => h.busted));
  if (allBusted) return false;
  return handValue(state.dealer.cards) < 17;
}

/** Draw exactly one card for the dealer. Returns updated state. */
export function dealerHitOne(state: GameState): GameState {
  const { card, deck } = dealCard(state.deck);
  const newCards = [...state.dealer.cards, card];
  const busted = isBusted(newCards);

  return {
    ...state,
    deck,
    dealer: {
      ...state.dealer,
      cards: newCards,
      busted,
      stood: busted || handValue(newCards) >= 17,
    },
  };
}

/** Finalize the dealer's hand and move to results phase */
export function finalizeDealerHand(state: GameState): GameState {
  return {
    ...state,
    phase: 'results',
    phaseStartedAt: Date.now(),
    dealer: {
      ...state.dealer,
      stood: true,
      blackjack: isBlackjack(state.dealer.cards),
      busted: isBusted(state.dealer.cards),
    },
  };
}

export function resolveResults(state: GameState): GameState {
  const dealerValue = handValue(state.dealer.cards);
  const dealerBJ = state.dealer.blackjack;
  const newPlayers = { ...state.players };

  for (const [id, player] of Object.entries(newPlayers)) {
    let totalPayout = 0;
    
    // Evaluate each hand independently
    const resolvedHands = player.hands.map((hand) => {
      if (hand.bet <= 0 || hand.cards.length === 0) {
        return { ...hand, result: undefined, payout: undefined };
      }

      const playerValue = handValue(hand.cards);
      const playerBJ = hand.blackjack;
      let result: Hand['result'];
      let payout = 0;

      // Handle surrender — player already got half back in playerSurrender
      if (hand.surrendered) {
        result = 'lose';
        payout = 0;
      } else if (hand.busted) {
        result = 'lose';
        payout = 0;
      } else if (playerBJ && dealerBJ) {
        result = 'push';
        payout = hand.bet;
      } else if (playerBJ) {
        result = 'blackjack';
        payout = hand.bet + Math.floor(hand.bet * 1.5);
      } else if (dealerBJ) {
        result = 'lose';
        payout = 0;
      } else if (state.dealer.busted) {
        result = 'win';
        payout = hand.bet * 2;
      } else if (playerValue > dealerValue) {
        result = 'win';
        payout = hand.bet * 2;
      } else if (playerValue === dealerValue) {
        result = 'push';
        payout = hand.bet;
      } else {
        result = 'lose';
        payout = 0;
      }

      totalPayout += payout;
      return { ...hand, result, payout };
    });

    // Insurance payout is only on the first hand
    let insurancePayout = 0;
    const firstHand = resolvedHands[0];
    if (firstHand && firstHand.insuranceBet > 0) {
      if (dealerBJ) {
        insurancePayout = firstHand.insuranceBet * 3; // original bet back + 2:1 winnings
      }
      // If dealer doesn't have BJ, insurance is lost (already deducted)
    }

    newPlayers[id] = {
      ...player,
      hands: resolvedHands,
      insurancePayout: insurancePayout > 0 ? insurancePayout : undefined,
      balance: player.balance + totalPayout + insurancePayout,
    };
  }

  return {
    ...state,
    players: newPlayers,
  };
}

export function startNewRound(state: GameState): GameState {
  const newPlayers: Record<string, PlayerState> = {};

  for (const [id, player] of Object.entries(state.players)) {
    let balance = player.balance;
    // If player is broke, give them $100
    if (balance <= 0) {
      balance = 100;
    }
    newPlayers[id] = {
      ...player,
      balance,
      hands: [{ cards: [], bet: 0, stood: false, busted: false, blackjack: false, doubled: false, surrendered: false, insuranceBet: 0 }],
      activeHandIndex: 0,
      ready: false,
      insurancePayout: undefined,
    };
  }

  return {
    ...state,
    tableMessage: undefined,
    phase: 'betting',
    phaseStartedAt: Date.now(),
    turnStartedAt: Date.now(),
    dealer: createEmptyHand(),
    players: newPlayers,
  };
}

export function hasActiveBets(state: GameState): boolean {
  return Object.values(state.players).some((player) => player.hands.some((hand) => hand.bet > 0));
}

export function restartPhaseTimer(state: GameState): GameState {
  return {
    ...state,
    phaseStartedAt: Date.now(),
  };
}

export function addTableMessage(state: GameState, text: string): GameState {
  return {
    ...state,
    tableMessage: { text, id: Date.now() },
  };
}

export function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    case 'spades': return '♠';
  }
}

export function suitColor(suit: Suit): string {
  return suit === 'hearts' || suit === 'diamonds' ? '#ef4444' : '#1e293b';
}
