# Blackjack Online (v1.1)

Browser-based blackjack built with Next.js, React, and PeerJS. The app has no backend game server: one browser becomes the host, keeps the canonical game state, and broadcasts it to the rest of the room over WebRTC.

Live app: <https://blackjack-online-one.vercel.app>

## Documentation Map

- [`README.md`](README.md): project overview, setup, development workflow, and current limitations
- [`docs/architecture-and-state.md`](docs/architecture-and-state.md): technical deep dive into room lifecycle, state ownership, networking, hooks, timers, autoplay, and persistence
- [`docs/casino-rules-and-odds.md`](docs/casino-rules-and-odds.md): implemented blackjack rules, payout formulas, odds, shoe/dealing algorithms, and timeout behavior

## Feature Summary

- Solo play and peer-to-peer multiplayer rooms
- Host-authoritative state replication over PeerJS/WebRTC
- Spectator mode with mid-round join deferral
- Six-deck blackjack shoe with split, double, insurance, and optional surrender
- Autoplay with configurable stand threshold and auto-bet
- Local bankroll and bet history persistence with client-side HMAC integrity checks
- Strict host-side validation of peer message payloads (names, balances, bets)
- English and Spanish UI with synthesized Web Audio effects

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Useful commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

Tests use Node's built-in test runner with type stripping (Node 22.6+ required) — no test dependencies.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 App Router |
| UI | React 19 client components |
| Styling | Tailwind CSS v4 + custom global CSS |
| Networking | PeerJS over WebRTC data channels |
| Language | TypeScript 6 |
| State model | Host-authoritative in-memory game state |
| Persistence | `localStorage` + browser `crypto.subtle` HMAC |
| Audio | Web Audio API |

## How The Game Works

At runtime the app is split into two roles:

- Host browser: creates the room, owns the full `GameState`, applies all bets and actions, runs phase timers, and broadcasts canonical updates.
- Peer browser: joins the room, sends intents such as `player-bet` and `player-action`, and mirrors whatever state the host sends back.

The round loop is:

```text
betting -> playing -> dealer-turn -> results -> betting
```

Current timer values:

- Betting window: `20s`
- Player action timeout: `10s`
- Results auto-advance: `5s`

All countdowns are derived from host timestamps stored in the shared game state, so peers render the same timer values after sync.

## Implemented Table Rules

These are the rules currently implemented by the codebase. The full explanation and caveats are in [`docs/casino-rules-and-odds.md`](docs/casino-rules-and-odds.md).

| Rule | Current behavior |
| --- | --- |
| Shoe | 6 decks |
| Blackjack payout | `3:2` |
| Dealer rule | Stands on all `17`s, including soft `17` |
| Insurance | Optional room rule, offered only when dealer shows an Ace and only on the un-acted 2-card initial hand |
| Surrender | Optional room rule, returns half the bet |
| Split | Enabled by default, up to 4 hands total |
| Split tens | Allowed (`10/J/Q/K` may split together) |
| Double down | Allowed on any 2-card active hand, including after split |
| Split aces | Can be split and played as normal hands in this implementation |
| Broke-player reset | Balance resets to `$100` when a player reaches `0` |

## Project Structure

```text
src/
  app/
    layout.tsx
    page.tsx
    globals.css
  features/blackjack/
    components/     UI pieces
    hooks/          room/session/automation hooks
    lib/            game engine, p2p, wallet, history, sounds
    screens/        lobby, waiting room, game room
    types/          shared feature types
  shared/
    hooks/
    i18n/
    lib/
docs/
  architecture-and-state.md
  casino-rules-and-odds.md
```

## Core Runtime Files

- `src/features/blackjack/screens/GameRoom.tsx`: top-level orchestration
- `src/features/blackjack/hooks/useRoomConnection.ts`: room lifecycle, host/peer sync, P2P messaging
- `src/features/blackjack/hooks/useDealerProgression.ts`: host-side timers and automatic phase transitions
- `src/features/blackjack/hooks/useRoundCountdown.ts`: derived countdown and progress values
- `src/features/blackjack/hooks/useAutoplay.ts`: auto-bet, auto-play, auto-next-round behavior
- `src/features/blackjack/lib/blackjack.ts`: main game engine and state transforms
- `src/features/blackjack/lib/validation.ts`: pure host-side input sanitization for untrusted payloads
- `src/features/blackjack/lib/p2p.ts`: PeerJS wrapper
- `src/features/blackjack/lib/wallet.ts`: signed bankroll persistence
- `src/features/blackjack/lib/history.ts`: signed hand history persistence

## Environment Variables

None are required — the app defaults to the public PeerJS cloud for signaling.

To point at a self-hosted PeerJS signaling server instead, set these at build time:

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_PEERJS_HOST` | Signaling server hostname (enables the rest) |
| `NEXT_PUBLIC_PEERJS_PORT` | Optional port |
| `NEXT_PUBLIC_PEERJS_PATH` | Optional mount path, defaults to `/` |
| `NEXT_PUBLIC_PEERJS_KEY` | Optional server key |
| `NEXT_PUBLIC_PEERJS_SECURE` | Set to `false` for plain `ws://` (local dev servers) |

Example for a local `npx peer --port 9000` server:

```bash
NEXT_PUBLIC_PEERJS_HOST=localhost NEXT_PUBLIC_PEERJS_PORT=9000 NEXT_PUBLIC_PEERJS_SECURE=false npm run dev
```

## Deployment

### Vercel CLI

```bash
vercel
vercel --prod
```

### GitHub integration

1. Push the repository to GitHub.
2. Import it in Vercel.
3. Leave the default Next.js build settings in place.

No environment variables are needed today.

## Known Limitations

- No backend authority exists beyond the host browser. If the host closes the tab, the room is gone.
- The wallet and history signatures only deter casual tampering; the signing secret ships to the client.
- The balance a player brings into a room is client-declared: the host validates its shape (finite, non-negative, capped) but cannot verify its history. Multiplayer trust remains social.
- The current `playing` phase does not enforce a strict seat-by-seat turn pointer; see [`docs/architecture-and-state.md`](docs/architecture-and-state.md) for the exact behavior.
- Broadcasts are sanitized (`deck` stripped, dealer hole card masked), but the host player can always inspect the full shoe locally — hosting and playing in the same room requires trusting the host.
- The `chat` message type exists in the transport layer but there is no chat reducer or UI.
- PeerJS cloud signaling is convenient for small rooms, but it is not a production-grade multiplayer backend.
