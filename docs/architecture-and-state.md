# Architecture And State

This document explains how the app works internally today. It describes the implementation that exists in the repository, not an idealized future architecture.

## 1. Runtime Model

The project is a fully client-side blackjack app:

- There is no backend API and no database.
- One browser becomes the room host.
- The host owns the canonical `GameState`.
- Every other browser mirrors host state and sends intents back to the host.

That makes the multiplayer model simple:

```text
Host browser
  owns GameState
  applies bets and actions
  runs timers
  broadcasts game-state-sync

Peer browser
  renders mirrored GameState
  sends player-bet / player-action intents
  never becomes authoritative
```

The main consequence is operational rather than technical: if the host disconnects, the room is effectively destroyed.

## 2. Entry Points And Major Modules

### App entry

- `src/app/page.tsx`: renders the game room screen.
- `src/app/layout.tsx`: wraps the app with shared providers.
- `src/app/globals.css`: visual system, tokens, animations, and table styling.

### Blackjack feature

| File or folder | Responsibility |
| --- | --- |
| `src/features/blackjack/screens/GameRoom.tsx` | Top-level orchestration of hooks, local UI state, and action handlers |
| `src/features/blackjack/screens/LobbyScreen.tsx` | Name entry, room creation, room join, solo start, house rule toggles |
| `src/features/blackjack/screens/WaitingRoomScreen.tsx` | Pre-game room state before the host opens the table |
| `src/features/blackjack/hooks/useRoomConnection.ts` | Session lifecycle, P2P connection, message handling, host/peer sync |
| `src/features/blackjack/hooks/useDealerProgression.ts` | Host-only automation for dealing, dealer progression, and phase timeouts |
| `src/features/blackjack/hooks/useRoundCountdown.ts` | Countdown values derived from host timestamps |
| `src/features/blackjack/hooks/useAutoplay.ts` | Auto-bet, simple hit/stand automation, and host auto-next-round |
| `src/features/blackjack/hooks/useResultsEffects.ts` | Sounds, signed history writes, and win/loss overlays |
| `src/features/blackjack/lib/blackjack.ts` | Core state transforms and blackjack rules |
| `src/features/blackjack/lib/p2p.ts` | PeerJS wrapper |
| `src/features/blackjack/lib/wallet.ts` | Signed bankroll persistence |
| `src/features/blackjack/lib/history.ts` | Signed result history persistence |

## 3. Screen And Session Lifecycle

The user flow is:

```text
lobby -> waiting room -> game table
```

### Lobby

The lobby allows:

- solo play
- room creation
- room join
- spectator join
- local room rule toggles for insurance and surrender

The split rule is present in state but currently defaults to enabled and is not exposed as a lobby toggle.

### Waiting room

The waiting room exists until the host sets `tableOpen = true`.

- Hosts can open the table.
- Guests wait for the host to open it.
- Spectators can join and watch before the table opens.

### Game room

Once `tableOpen` is true, `GameRoom.tsx` renders the actual table and wires together:

- room/session state from `useRoomConnection`
- host automation from `useDealerProgression`
- timer derivation from `useRoundCountdown`
- autoplay from `useAutoplay`
- visual and history effects from `useResultsEffects`

## 4. Canonical State Shape

The canonical state lives in `src/features/blackjack/lib/blackjack.ts`.

### `GameState`

| Field | Meaning |
| --- | --- |
| `phase` | One of `betting`, `playing`, `dealer-turn`, `results` |
| `phaseStartedAt` | Host timestamp for the current phase |
| `turnStartedAt` | Host timestamp for the current action window |
| `deck` | Remaining shoe cards; only the host keeps the full deck during multiplayer |
| `dealer` | Dealer hand state |
| `players` | Player map keyed by peer ID |
| `roundNumber` | Increments when cards are initially dealt |
| `settings` | Room rules such as insurance/surrender/split |
| `tableOpen` | Whether the game has moved out of the waiting room |
| `hostId` / `hostName` | Current room authority |
| `tableMessage` | Optional transient banner text |

### `PlayerState`

| Field | Meaning |
| --- | --- |
| `id` / `name` | Peer identity and display name |
| `hands` | One or more blackjack hands |
| `activeHandIndex` | Which hand the UI and engine consider active |
| `balance` | Current bankroll |
| `ready` | Whether the player has locked a bet for the current round |
| `insurancePayout` | Optional resolved insurance amount shown after settlement |

### `Hand`

Each hand stores:

- `cards`
- `bet`
- `stood`
- `busted`
- `blackjack`
- `doubled`
- `surrendered`
- `insuranceBet`
- optional `result`
- optional `payout`

The engine resolves each hand independently, then sums payouts back into the player balance.

## 5. Networking Model

The transport wrapper lives in `src/features/blackjack/lib/p2p.ts`.

### Message types

| Message | Direction | Purpose |
| --- | --- | --- |
| `player-join` | peer -> host | Add a player to `players` |
| `spectator-join` | peer -> host | Register a spectator without a player seat |
| `player-bet` | peer -> host | Submit a bet intent |
| `player-action` | peer -> host | Submit `hit`, `stand`, `double`, `split`, `surrender`, `insure`, or `decline-insurance` |
| `game-state-sync` | host -> peers | Broadcast the canonical state |
| `room-settings-sync` | host -> a joiner | Send current room settings |
| `new-round` | host -> peers | Legacy round-reset signal; current flow mostly relies on `game-state-sync` |
| `player-leave` | any -> room | Remove a player |
| `player-spectate` | player -> host | Move a player seat into spectator mode |
| `chat` | reserved | Not implemented in the UI |

### Identity handling

`P2PConnection` overwrites `senderId` using the transport-level peer ID before dispatching messages to handlers. That is an important integrity measure:

- payloads are not trusted to identify the sender
- room actions are bound to the actual connection that delivered them

### Deck visibility

When the host syncs state to a newly joined player or spectator, the host sends a copy of state with `deck: []`.

That means:

- peers cannot inspect future cards from replicated state
- the host still retains the full deck locally
- the host remains the only runtime authority able to resolve future draws

## 6. Host-Authoritative State Flow

`useRoomConnection.ts` is the central session hook.

### Host behavior

The host:

- creates the room
- initializes `GameState`
- owns `syncGameState`
- applies actions immediately in memory
- broadcasts updated state to all peers

### Peer behavior

Peers:

- connect to the host room
- send action or betting intents
- replace their local state on `game-state-sync`
- update their local bankroll from authoritative sync when necessary

### Optimistic balance updates

Non-host players optimistically update local wallet balance before the host confirms some actions:

- bet
- double
- split
- surrender
- insurance

The host later sends the canonical state, which corrects the balance if the local optimistic assumption diverged.

## 7. Phase State Machine

The game loop is:

```text
betting -> playing -> dealer-turn -> results -> betting
```

### Betting

During `betting`:

- players place a single initial bet
- `ready = true` means the bet is locked
- if every current player is ready, the host deals after `600ms`
- if the betting timer expires and at least one bet exists, the host deals immediately
- if the timer expires and nobody bet, the host restarts the betting timer and shows a table message

### Playing

During `playing`:

- players act on their active hand
- the dealer hole card stays face down visually
- if `dealer.blackjack` is already true, the host flips the hole card after `1800ms`
- otherwise the host waits until `allPlayersFinished()`, then flips the hole card after `800ms`

### Dealer turn

During `dealer-turn`:

- the hole card is already face up
- the host checks `shouldDealerHit()`
- the dealer draws one card every `800ms` until the hand should stand
- the host then finalizes the dealer hand and resolves results

`dealer.blackjack` is **not** written into `GameState` until `finalizeDealerHand()` runs. While the hole card is face down, the host detects dealer blackjack on its own copy by calling `isBlackjack(state.dealer.cards)` directly — see section 14 for why.

### Results

During `results`:

- payouts are already resolved into balances
- result overlays and history recording run
- after `5000ms`, the host starts a new round unless the host triggers it manually first

## 8. Timers And Countdown Model

The constants are defined in `src/features/blackjack/lib/blackjack.ts`:

- `BETTING_TIMEOUT_MS = 20000`
- `PLAYER_ACTION_TIMEOUT_MS = 10000`
- `NEXT_ROUND_TIMEOUT_MS = 5000`

`useRoundCountdown.ts` does not own the timers. It only derives display values from:

- `phaseStartedAt`
- `turnStartedAt`
- `Date.now()`

That design matters because the UI countdown is a projection of canonical host timestamps, not an independent local timer system.

### Betting timeout

If the betting deadline hits:

- with active bets: the host deals
- without active bets: the host restarts the phase timer and displays a temporary message

The UI exposes `bettingTimeExpired` to hard-disable chips and bet buttons exactly when the countdown reaches zero, preventing late client-side interactions from racing the host timeout.

### Action timeout

The action timer is currently global to the first actionable hand found in host iteration order, not to an explicit seat pointer.

When `10s` elapse in `playing`, the host scans `players` and auto-stands the first hand that:

- has at least two cards
- is not stood
- is not busted
- is not blackjack
- is not surrendered

This is an implementation detail worth knowing because it differs from a strict casino-style sequential turn model.

### Results timeout

The results screen auto-advances after `5s`. The host may also start the next round manually before the timer finishes.

## 9. Turn Model

The codebase does not currently maintain a dedicated `currentPlayerId` or explicit seat-order queue.

Instead:

- each player has `activeHandIndex`
- the UI checks whether that specific hand is actionable
- action handlers apply directly to the acting player's current hand
- the host timeout logic simply finds the first actionable hand

Practical implication:

- multiple players may be able to act during the same `playing` phase window
- the highlighted "active" hand is per player, not globally serialized across the table
- this is a current implementation characteristic, not traditional live-dealer turn sequencing

## 10. Dealer Automation

`useDealerProgression.ts` is the automation layer for host-only effects.

It is responsible for:

- guarding against double-deal race conditions with `dealingRef`
- transitioning from betting to playing
- restarting empty betting windows
- enforcing the `10s` action timeout
- flipping the dealer hole card
- dealing dealer cards one at a time
- moving from results to the next round

The actual state transforms still live in `blackjack.ts`; the hook just schedules when they happen.

## 11. Autoplay

Autoplay is implemented in `useAutoplay.ts`.

### What autoplay does

- optionally places a configured bet at the start of betting
- during `playing`, hits until the configured `standOn` threshold is reached
- for host players, starts the next round automatically after `2500ms` in results

### What autoplay does not do

- it is not basic strategy
- it does not evaluate dealer upcards
- it does not make split, insurance, or surrender decisions
- it only implements a threshold-based hit/stand heuristic

There is also a `15000ms` autoplay safety timeout that forces a stand if the round appears stuck.

## 12. Persistence Model

### Wallet

`src/features/blackjack/lib/wallet.ts` stores:

- bankroll payload in `bj_wallet`
- HMAC signature in `bj_wallet_sig`

Behavior:

- first load initializes the balance to `$1000`
- invalid or tampered data resets the bankroll to `$100`
- a player with `0` or less also gets reset to `$100`

### History

`src/features/blackjack/lib/history.ts` stores:

- the last 100 result records
- an HMAC signature

`useResultsEffects.ts` writes history records during the `results` phase.

### Security note

The signatures use `crypto.subtle`, but the secret is bundled in client code. That means the integrity checks help against casual local tampering or corrupted storage, not a determined attacker.

## 13. Join, Leave, And Spectator Behavior

### Joining mid-round

If a player joins after the table is already open and the phase is not `betting`, the host adds them with:

- an empty stood hand
- `ready = true`

That keeps them visible in the room without blocking the current round. The UI labels them as joining next round.

### Switching to spectator

Switching to spectator removes the player from `players`. If they had an active wager, the bet is forfeited because the wager had already been deducted from their balance.

### Leaving the room

Leaving mid-round also forfeits the current bet for the same reason.

## 14. Notable Implementation Nuances

- `dealInitialCards()` deliberately does **not** set `dealer.blackjack`, even when the hole card would make it `true`. Setting the flag at deal time would leak the hole card to all clients via `game-state-sync`. Instead, the host detects dealer blackjack locally by calling `isBlackjack(state.dealer.cards)` in `useDealerProgression`, and the canonical flag is finally written by `finalizeDealerHand()` once the hole card has been flipped.
- There is no dedicated "insurance resolution" or "dealer peek" subphase before players begin acting.
- Because `playing` begins immediately after the deal, there can be a brief window where players can act before a dealer-blackjack reveal animation completes.
- `playDealerHand()` in `blackjack.ts` is marked `@deprecated`. The runtime path is the staged trio: `flipDealerHoleCard()` → `dealerHitOne()` → `finalizeDealerHand()`. New code should not call `playDealerHand`.
- The deck can be replaced by a fresh shuffled six-deck shoe as soon as fewer than 20 cards remain, even if that happens during a round.
- A spectator who clicks "Join Game" defers their `isSpectator → false` flip until the host's next `game-state-sync` includes them as a player (`pendingJoinRef` in `useRoomConnection`). This avoids a window where the UI shows player controls but the player isn't yet in `players`.
- A `dealingRef` guard in `useDealerProgression` prevents the "all-ready" path and the betting-timeout path from both dispatching the deal in the same tick.
- Joining via URL: a `?room=CODE` query parameter on the lobby URL pre-fills the join input. The "Copy Link" action in the waiting room writes a URL of this shape, while "Copy Code" writes only the 6-char room code.

## 15. Current Architecture Risks

- Host disconnect means room loss.
- Multiplayer trust is social, not cryptographic.
- Randomness is good enough for casual play but not auditable or casino-grade.
- The turn model is simpler than real table sequencing and may not match every player expectation.
- The transport layer reserves chat but does not implement it.
