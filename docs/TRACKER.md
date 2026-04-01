# UNO Flip — Project Plan

> Status key: ✅ Done · 🚧 In progress · ❌ Not started

---

## Phase 1: Project Setup & Shared Types ✅
> Foundation — monorepo running with shared types

- ✅ Turborepo + pnpm workspaces
- ✅ TypeScript config (base + per-package)
- ✅ Biome (linter + formatter — replaces ESLint + Prettier)
- ✅ Shared types:
  - `CardSide` — `{ color, value }`
  - `Card` — `{ id, light: CardSide, dark: CardSide }`
  - `ActiveSide` — `'light' | 'dark'`
  - `PublicPlayer` — `{ id, name, cardCount, isUno, connected }`
  - `GameState` — `{ activeSide, discardTop, currentPlayerIndex, direction, players, phase, ... }`
  - `PlayerHand` — private, only sent to the owning player
- ✅ 112-card deck constant (light + dark pairings, 1–9 only, correct color pairs)
- ✅ Strongly typed Socket.IO events:
  - Client → Server: `CREATE_ROOM`, `JOIN_ROOM`, `PLAY_CARD`, `DRAW_CARD`, `PASS_TURN`, `CALL_UNO`, `SELECT_COLOR`, `ACCEPT_DRAW`, `CHALLENGE_DRAW`
  - Server → Client: `ROOM_CREATED`, `PLAYER_JOINED`, `PLAYER_LEFT`, `GAME_STATE`, `HAND_UPDATE`, `CARD_PLAYED`, `FLIP_EVENT`, `CHALLENGE_RESULT`, `ROUND_OVER`, `GAME_OVER`, `ERROR`

---

## Phase 2: Server — Room System ✅
> Players can create and join rooms

- ✅ Express server (`apps/server`)
- ✅ Socket.IO server with typed events
- ✅ Room manager (`room-manager.ts`):
  - Create room → generates 4-letter room code (e.g. `ABCD`)
  - Join room → validates code, checks player limits
  - Player names (no auth — just pick a name)
  - Host designation (first player = host, can start game)
  - Handle disconnection (player removed, room cleaned up)
- ✅ REST endpoint `GET /api/room/:code` for client-side room validation
- ❌ LAN IP detection + QR code generation (deferred to Phase 7)

---

## Phase 3: Server — Game Engine ✅
> State machine + rules enforcement

- ✅ **Deck management** (`deck.ts`):
  - Fisher-Yates shuffle
  - Deal 7 cards per player
  - Draw pile + discard pile
  - Reshuffle discard into draw when empty
  - Flip entire deck/hands on FLIP card

- ✅ **Game state machine** (`game-engine.ts`) — phases:
  ```
  lobby → dealing → playing → choosing_color →
  awaiting_challenge → round_over → game_over
  ```

- ✅ **Move validation** (`validators.ts`):
  - Match discard top by color, number, or symbol
  - Wild cards always playable
  - Wild Draw Two / Wild Draw Color legal only when no color match in hand

- ✅ **Action card effects** (`actions.ts`):
  - Light side: Skip, Reverse, Draw One, Wild, Wild Draw Two, Flip
  - Dark side: Skip Everyone (skips all, you go again), Reverse, Draw Five, Wild, Wild Draw Color, Flip
  - Direction tracking (clockwise / counter-clockwise)

- ✅ **The Flip mechanic**:
  - Flip all player hands (server tracks both sides)
  - Flip draw and discard piles
  - Broadcast `FLIP_EVENT` to all clients

- ✅ **Challenge mechanic** (Wild Draw Two / Color):
  - Target player can Accept or Challenge
  - If challenged successfully → offender draws instead
  - If challenge fails → challenger draws more

- ✅ **Scoring** (`scoring.ts`):
  - Points calculated from active side card values
  - Cumulative across rounds — first to 500 wins

- ✅ **Edge cases**:
  - 2-player: Reverse acts as Skip
  - Starting card rules (can't start on Wild Draw)
  - Last card effects apply before round ends

---

## Phase 4: Client — Join Flow & Lobby ✅
> Players can join from their devices

- ✅ Vite + React + TypeScript (`apps/client`)
- ✅ Hash-based router: `/ → /room/:code`
- ✅ Home screen: "Play" button → creates room
- ✅ Name entry screen
- ✅ Lobby screen:
  - Real-time player list (HOST / YOU badges)
  - Host sees "Start Game" button
  - Non-host sees waiting message
- ✅ Sonner toasts for errors, events, round results
- ✅ Invalid room URL → toast error + redirect home

---

## Phase 5: Client — Game UI 🚧
> Main gameplay screen — card interactions and animations

### Server-side (done)
- ✅ `scores: Record<string, number>` in GameState
- ✅ `START_NEXT_ROUND` event + handler
- ✅ `startNextRound()` — reset round, keep cumulative scores
- ✅ `reconnectPlayer()` — swap socket ID on reconnect
- ✅ `rejoinRoom()` — find disconnected player by name
- ✅ Mid-game disconnect marks player disconnected (not removed)
- ✅ Room auto-deletes when all players disconnect
- ✅ `connectedPlayers` set tracks connection status

### Client-side (done)
- ✅ Score screen between rounds (ScoreScreen.tsx)
- ✅ "Next Round" button for host
- ✅ CSS cleanup (removed Vite template, game-appropriate styles)
- ✅ Background theme shift (light ↔ dark side via body style)
- ✅ Basic motion.dev animations (hover, tap, overlays, FLIP text)

### Needs rework — Table-top card game feel
Current animations are web UI transitions (fade/slide). Need real card game feel:

- ❌ **Table layout** — CSS Grid with players around edges, center zone for deck/discard
- ❌ **Dealing animation** — Cards fly one-by-one from deck to each player (staged on client)
- ❌ **3D card flip** — CSS `preserve-3d` + `backface-visibility`, lift at midpoint
- ❌ **Card movement** — Cards fly between real screen positions (deck → hand → discard)
- ❌ **Opponent display** — Face-down card backs at opponent positions (top/sides)
- ❌ **Draw animation** — Card physically moves from deck to hand and flips face-up
- ❌ **Play animation** — Card flies from hand to discard pile position

**Technique:** FLIP pattern via Motion `layoutId` or refs + `getBoundingClientRect()`
**Research:** See `memory/research_card_game_animations.md`

---

## Phase 6: Polish & PWA ❌
> Make it feel like a real game

- ❌ Screen wake lock (NoSleep.js / Wake Lock API)
- ❌ Haptic feedback (Vibration API)
- ❌ Sound effects: card play, draw, UNO call, flip — with mute toggle
- ✅ Reconnection handling — auto-rejoin game on disconnect (done in Phase 5)
- ❌ PWA manifest + service worker (offline shell, installable)
- ❌ PWA install prompt (Android auto, iOS manual banner)
- ❌ Loading / connection states — graceful handling

---

## Phase 7: Host Dashboard ❌
> What the person running the server sees on their laptop

- ❌ Terminal output: QR code + room code + player count
- ❌ Web dashboard at `/host`:
  - Large QR code for easy scanning
  - Room code in big text
  - Player list with status
  - Game status / round score

---

## Tech notes

| Concern | Choice |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Server | Express + Socket.IO |
| Client | Vite + React + TypeScript |
| Shared | `packages/shared` — types, deck, rules |
| Linting | Biome (not ESLint/Prettier) |
| Styling | Plain CSS / CSS modules (no Tailwind) |
| Animations | motion.dev (formerly Framer Motion) |
| Package manager | pnpm |

## Commands

```bash
pnpm dev          # Start server (3001) + client (5173)
pnpm lint         # Check only
pnpm lint:fix     # Auto-fix formatting
```

## Current branch

`refactor/game-engine-rules` — has all latest work, not yet merged to `main`.
