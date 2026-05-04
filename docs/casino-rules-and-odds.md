# Casino Rules, Odds, And Algorithms

This document explains the blackjack rules and math implemented by the current codebase. Where behavior differs from a standard casino table, that difference is called out explicitly.

## 1. Rule Summary

| Category | Current implementation |
| --- | --- |
| Shoe size | 6 decks |
| Shuffle method | Fisher-Yates using `Math.random()` |
| Blackjack | 2-card `21`, pays `3:2` |
| Dealer rule | Stands on all `17`s, including soft `17` |
| Insurance | Optional room rule, off by default, offered only when dealer's upcard is Ace |
| Insurance payout | `2:1` winnings plus stake returned |
| Surrender | Optional room rule, off by default, half-bet returned immediately |
| Split | Enabled by default |
| Max split hands | 4 hands total |
| Split tens | Allowed for any `10/J/Q/K` pairing |
| Split aces | Allowed and played like normal split hands |
| Double down | Allowed on any 2-card active hand, including after split |
| Double result | Exactly one extra card, then forced stand |
| Natural blackjack after split | Not treated as blackjack; it is just a `21` |
| Minimum bankroll | Players are reset to `$100` when broke |

## 2. Payout Rules

The settlement code resolves each hand independently, then adds all hand payouts and any insurance payout back into player balance.

### Standard hand outcomes

| Outcome | Result label | Payout logic |
| --- | --- | --- |
| Player blackjack vs non-blackjack dealer | `blackjack` | `bet + floor(bet * 1.5)` |
| Win by higher total or dealer bust | `win` | `bet * 2` |
| Push | `push` | `bet` |
| Loss | `lose` | `0` |
| Surrender | `lose` | `0` during settlement because half the bet was already refunded earlier |

### Insurance

Insurance cost:

```text
floor(originalBet / 2)
```

Insurance settlement if dealer has blackjack:

```text
insuranceBet * 3
```

That `* 3` means:

- original insurance stake returned
- plus `2:1` winnings

If the dealer does not have blackjack, the insurance stake is already gone.

## 3. Bankroll Rules

The wallet logic is intentionally arcade-like rather than casino-realistic:

- first-time bankroll starts at `$1000`
- if a bankroll is corrupted or tampered with, it is reset to `$100`
- if a player reaches `0`, the next sync/new round also restores them to `$100`

This avoids hard dead-ends where a player can no longer play.

## 4. Odds And Probabilities

These values are based on a fresh six-deck shoe, which matches the game's default shoe size.

### Fresh-shoe probabilities

| Event | Formula | Approx. probability |
| --- | --- | --- |
| Player natural blackjack | `2 * (24/312) * (96/311)` | `4.749%` |
| Dealer natural blackjack | same as above | `4.749%` |
| Dealer upcard is Ace | `24/312` | `7.692%` |
| Dealer blackjack given Ace upcard | `96/311` | `30.868%` |
| Dealer blackjack given 10-value upcard | `24/311` | `7.717%` |

Why the counts above:

- 6 decks = `312` cards
- aces = `24`
- ten-valued cards (`10/J/Q/K`) = `96`

### Insurance expected value

Insurance is a negative-expectation side bet in this ruleset, as it is in standard blackjack.

On a fresh shoe with an Ace upcard:

```text
P(dealer blackjack | Ace up) = 96 / 311 = 0.30868
```

Expected net return of a 1-unit insurance bet:

```text
(0.30868 * 2) + (0.69132 * -1) = -0.07396
```

That is about `-7.396%` expected value on the insurance stake.

### House-edge note

There is no single fixed house-edge number that can honestly be claimed for this app without also fixing a player strategy model.

Reasons:

- players choose their own actions
- autoplay is not basic strategy
- optional surrender changes expectation
- the implementation allows some player-friendly rules that many casinos do not

Inference from the implemented rules:

- dealer standing on soft `17`
- double after split
- split-ten support
- replayable split aces
- up to four hands

all tend to be more player-friendly than a stricter six-deck online table. Actual results still depend heavily on player decision quality.

## 5. Card And Shoe Algorithm

The core card logic lives in `src/features/blackjack/lib/blackjack.ts`.

### Deck creation

`createDeck(6)` builds:

- 6 copies of each suit
- 13 ranks per suit
- `312` total cards

Each card is stored as:

```ts
{
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades',
  rank: 'A' | '2' | ... | 'K',
  faceUp: boolean
}
```

### Shuffle algorithm

`shuffleDeck()` uses Fisher-Yates:

1. copy the deck
2. iterate from the last index down to `1`
3. swap the current card with a random earlier index

Important implementation note:

- randomness comes from `Math.random()`
- that is fine for casual browser play
- it is not cryptographically secure or independently auditable

### Shoe replacement

Every draw goes through `dealCard()`.

If the remaining deck is below `20` cards, `dealCard()` immediately replaces it with a fresh shuffled 6-deck shoe before drawing.

That means:

- there is no discard tray model
- there is no cut-card penetration model
- long-session card-counting assumptions do not map cleanly to this implementation
- the shuffle can happen in the middle of a round if the remaining shoe drops below `20`

## 6. Hand Valuation Algorithm

### Numeric cards

- `2` through `10` count at face value

### Face cards

- `J`, `Q`, and `K` count as `10`

### Aces

The engine first counts every Ace as `11`, then repeatedly subtracts `10` while the hand is over `21`.

That produces the best non-busting total automatically.

Examples:

- `A + 6 = 17`
- `A + 9 + 9 = 19`
- `A + A + 9 = 21`

### Soft 17

`isSoft17()` exists and correctly detects a soft `17`, but the current dealer logic stands on all `17`s anyway because `shouldDealerHit()` only hits when total is below `17`.

## 7. Initial Deal Algorithm

`dealInitialCards()` applies the following sequence:

1. copy the current deck
2. collect all players who are both `ready` and have a positive initial bet
3. deal two face-up cards to each active player
4. mark natural blackjacks immediately
5. give non-participating seated players an empty stood hand so they sit out cleanly
6. deal dealer upcard face up
7. deal dealer hole card face down
8. move the phase to `playing`
9. increment `roundNumber`

Important detail:

- the host does **not** write `dealer.blackjack` into the canonical state during the deal. Setting it would leak the hole card to peers through `game-state-sync`. Instead, the host detects dealer blackjack locally via `isBlackjack(state.dealer.cards)` in `useDealerProgression`, and the canonical flag is finally written by `finalizeDealerHand()` once the hole card has been flipped face up.

## 8. Player Action Algorithms

### Hit

`playerHit()`:

- draws one card
- busts if total exceeds `21`
- auto-stands if the new total is exactly `21`
- advances `turnStartedAt`

### Stand

`playerStand()`:

- marks the current hand as stood
- increments `activeHandIndex`
- advances `turnStartedAt`

### Double down

`playerDoubleDown()`:

- requires a 2-card active hand
- requires enough balance to match the bet
- deducts one extra bet immediately
- draws exactly one more card
- forces stand
- advances to the next hand

### Split

`playerSplit()`:

- requires a 2-card active hand
- requires enough balance to duplicate the bet
- allows matching ranks or matching 10-value ranks
- draws one replacement card for each split hand
- supports up to 4 total hands

Important details:

- split hands are never marked as blackjack, even if they become `21`
- if a split hand becomes `21` immediately, it auto-stands
- split aces are not restricted to one card in this implementation
- double after split remains allowed because the new hands are normal 2-card hands

### Surrender

`playerSurrender()`:

- requires surrender to be enabled
- requires a 2-card active hand
- refunds `floor(bet / 2)` immediately
- marks the hand as surrendered and stood
- advances to the next hand

### Insurance

`playerInsure()`:

- requires insurance to be enabled
- requires the phase to be `playing`
- requires the dealer upcard to be Ace
- applies only to the first hand
- deducts `floor(bet / 2)` immediately

There is also a `playerDeclineInsurance()` helper, but it is a no-op on state. The UI mainly uses local dismissal state for declining the prompt.

## 9. Dealer Algorithm

The current runtime dealer flow is animated and split into stages.

### Stage 1: Hole-card flip

`flipDealerHoleCard()`:

- turns both dealer cards face up
- moves the phase to `dealer-turn`

### Stage 2: Repeated dealer hits

`shouldDealerHit()` returns true only when:

- not all players are already busted
- dealer total is less than `17`

`dealerHitOne()`:

- draws one card
- updates `busted`
- marks `stood` when busted or total is at least `17`

### Stage 3: Finalization

`finalizeDealerHand()`:

- moves the phase to `results`
- computes final `blackjack` and `busted` flags (this is the **first** time `dealer.blackjack` is committed to canonical state — see Section 7 for why)

`playDealerHand()` is marked `@deprecated` in the engine. It performs dealer play in one shot but is no longer wired up; the live runtime always uses the staged animated path above.

## 10. Result Resolution Algorithm

`resolveResults()` compares each player hand against the dealer hand in this order:

1. surrendered hand
2. busted hand
3. player blackjack + dealer blackjack
4. player blackjack only
5. dealer blackjack only
6. dealer busted
7. player higher total
8. equal total
9. dealer higher total

The function:

- computes a `result` per hand
- computes a `payout` per hand
- sums hand payouts into `totalPayout`
- separately resolves insurance on the first hand
- writes the new total back into `player.balance`

## 11. Timeout And Automation Behavior

### Betting timeout: 20 seconds

The host starts the round in `betting` with `phaseStartedAt = Date.now()`.

When the timer reaches zero:

- if at least one active bet exists, the host deals
- if nobody bet, the host restarts the timer and shows a banner message

### Action timeout: 10 seconds

The host updates `turnStartedAt` every time a player action changes turn state.

If `10` seconds pass during `playing`, the host:

1. scans players in object iteration order
2. finds the first actionable hand
3. applies `playerStand()` to that hand

This is not the same as a hard casino seat-order turn queue.

### Dealer pacing

Visual pacing is implemented with timed host effects:

- `600ms` delay before dealing once all bets are in
- `800ms` before flipping the hole card when all players are done
- `1800ms` before revealing an already-known dealer blackjack
- `800ms` between dealer hits
- `600ms` before final settlement after the dealer stops drawing

### Results timeout: 5 seconds

After settlement:

- players see the results screen
- sounds and signed history writes happen
- the host automatically starts the next round after `5000ms`

## 12. Implementation Differences From Standard Casino Blackjack

These are the main differences between the current code and a stricter physical or regulated online blackjack table:

- There is no dedicated peek/insurance-resolution subphase before normal player actions begin.
- The host can see the hole card locally and therefore knows whether the dealer has blackjack as soon as the initial deal is generated, but it does not commit that knowledge to canonical `GameState` until the hole card flips, so peers cannot infer it from `game-state-sync`.
- Because `playing` starts immediately after the initial deal, players may briefly be able to act before a dealer-blackjack reveal animation completes.
- The `playing` phase is not serialized by seat order; players can act based on whether their own active hand is actionable.
- Split aces can be hit, doubled, and otherwise played like normal split hands.
- Ten-valued cards can be split across rank boundaries, such as `K + Q`.
- The shoe is replaced whenever fewer than `20` cards remain instead of using a realistic cut-card/discard flow.
- Randomness is browser `Math.random`, not a certified casino RNG.

## 13. Practical Reading Of The Game's Math

If you want to reason about the game as implemented:

- blackjack pays correctly at `3:2`
- insurance is still a bad side bet on average
- some rule choices are friendlier to the player than many real-money six-deck tables
- autoplay should be treated as a convenience feature, not a strategy engine

For architecture and host/peer state ownership details, see [`architecture-and-state.md`](architecture-and-state.md).
