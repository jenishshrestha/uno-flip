# UNO Flip - Local Multiplayer Card Game

## Context

Office team plays double-sided UNO (UNO Flip) face-to-face, but the rules are confusing in person. Building a local network multiplayer game so 4-10 players in the same room can join instantly from their phones and play with rules enforced automatically.

**New repo** — completely separate from heubert-monolith-starter.

---

## Tech Stack

| Layer | Technology | Reasoning |
|-------|-----------|-----------|
| Runtime | Node.js + TypeScript | Shared types between server & client |
| Server framework | Express | Serves static files + API |
| Real-time | Socket.IO | Rooms, reconnection, namespaces built-in |
| Client | React + Vite | Fast dev, fast builds, small bundle |
| Styling | Tailwind CSS v4 | Mobile-first, utility classes |
| Card animations | CSS 3D transforms | Hardware-accelerated flip animations |
| Game logic | State machine (custom) | Authoritative server, prevents cheating |
| QR code | `qrcode` package | Display join URL on host screen |
| Monorepo | Turborepo or npm workspaces | Shared types between server & client |

---

## Project Structure

```
uno-flip/
├── package.json              # Root workspace config
├── turbo.json                # (if turborepo)
├── packages/
│   └── shared/               # Shared types & constants
│       ├── types/
│       │   ├── card.ts       # Card, CardSide, Color, Value types
│       │   ├── game.ts       # GameState, PlayerState, RoomState
│       │   └── events.ts     # Socket.IO event types (client↔server)
│       └── constants/
│           ├── deck.ts       # Full 112-card deck definition (both sides)
│           └── rules.ts      # Scoring values, max players, etc.
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts           # Express + Socket.IO bootstrap
│   │   │   ├── room-manager.ts    # Create/join/leave rooms
│   │   │   ├── game-engine.ts     # Core game state machine
│   │   │   ├── deck.ts            # Shuffle, deal, draw pile management
│   │   │   ├── validators.ts      # Move validation (can this card be played?)
│   │   │   ├── scoring.ts         # Point calculation per round
│   │   │   └── network.ts         # LAN IP detection, QR generation
│   │   └── package.json
│   └── client/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── hooks/
│       │   │   ├── useSocket.ts        # Socket.IO connection management
│       │   │   ├── useGameState.ts     # Game state from server
│       │   │   └── useSwipeGesture.ts  # Card swipe/drag to play
│       │   ├── screens/
│       │   │   ├── HomeScreen.tsx       # Join/create room
│       │   │   ├── LobbyScreen.tsx      # Waiting room, player list
│       │   │   ├── GameScreen.tsx       # Main gameplay
│       │   │   └── ScoreScreen.tsx      # Round/game results
│       │   ├── components/
│       │   │   ├── Card.tsx             # Single card (flip animation)
│       │   │   ├── CardHand.tsx         # Fan of cards (player's hand)
│       │   │   ├── DiscardPile.tsx      # Center discard pile
│       │   │   ├── DrawPile.tsx         # Draw pile (tap to draw)
│       │   │   ├── PlayerAvatar.tsx     # Other players around the "table"
│       │   │   ├── GameBoard.tsx        # Layout: opponents, piles, hand
│       │   │   ├── UnoButton.tsx        # Call UNO button
│       │   │   ├── ColorPicker.tsx      # Wild card color selection
│       │   │   └── FlipAnimation.tsx    # Full-screen flip transition
│       │   ├── styles/
│       │   │   └── app.css             # Tailwind + card-specific styles
│       │   └── utils/
│       │       └── cardUtils.ts        # Card display helpers (icons, colors)
│       ├── public/
│       │   ├── manifest.json           # PWA manifest
│       │   └── sw.js                   # Service worker (offline shell)
│       └── package.json
```

---

## Implementation Phases

### Phase 1: Project Setup & Shared Types
> Foundation — get the monorepo running with shared types

- [ ] Initialize repo with npm workspaces
- [ ] Setup TypeScript config (base + per-package)
- [ ] Define shared types:
  - `CardSide` — { color, value, type (number|action|wild) }
  - `Card` — { id, lightSide: CardSide, darkSide: CardSide }
  - `ActiveSide` — 'light' | 'dark'
  - `Player` — { id, name, handCount, isUno, connected }
  - `GameState` — { activeSide, discardTop, currentPlayer, direction, players, phase }
  - `PlayerHand` — (private, only sent to owning player)
- [ ] Define all 112 cards in deck constant (light + dark pairings)
- [ ] Define Socket.IO event types (strongly typed):
  - Client → Server: `CREATE_ROOM`, `JOIN_ROOM`, `PLAY_CARD`, `DRAW_CARD`, `CALL_UNO`, `CATCH_UNO`, `SELECT_COLOR`
  - Server → Client: `ROOM_CREATED`, `PLAYER_JOINED`, `GAME_STATE`, `HAND_UPDATE`, `CARD_PLAYED`, `FLIP_EVENT`, `ROUND_OVER`, `GAME_OVER`, `ERROR`

### Phase 2: Server — Room System
> Players can create and join rooms

- [ ] Express server serving static client build
- [ ] Socket.IO server with typed events
- [ ] Room manager:
  - Create room → generates 4-char room code (e.g., `ABCD`)
  - Join room → validates code, checks player count (4-10)
  - Player names (no auth, just pick a name)
  - Host designation (first player = host, can start game)
  - Handle disconnection/reconnection (Socket.IO built-in + rejoin by player ID)
- [ ] LAN IP detection + QR code generation (terminal + web dashboard for host)

### Phase 3: Server — Game Engine (Core Loop)
> The heart of the game — state machine + rules enforcement

- [ ] **Deck management:**
  - Shuffle algorithm (Fisher-Yates)
  - Deal 7 cards to each player
  - Draw pile + discard pile tracking
  - Reshuffle discard into draw when empty
  - Flip entire deck/hands when FLIP card played

- [ ] **Game state machine** — phases:
  ```
  LOBBY → DEALING → AWAITING_PLAY → AWAITING_DRAW_DECISION →
  AWAITING_COLOR_CHOICE → AWAITING_UNO_CATCH → ROUND_OVER →
  GAME_OVER
  ```

- [ ] **Move validation:**
  - Card matches discard top by color, number, or symbol
  - Wild cards always playable
  - Wild Draw Two / Wild Draw Color — technically only when no other match (challenge rule)

- [ ] **Action card effects:**
  - **Light side:** Skip, Reverse, Draw One, Wild, Wild Draw Two, Flip
  - **Dark side:** Skip Everyone, Reverse, Draw Five, Wild, Wild Draw Color, Flip
  - Direction tracking (clockwise/counter-clockwise)

- [ ] **The Flip mechanic:**
  - Flip all player hands (server tracks both sides)
  - Flip draw pile and discard pile
  - New discard top determines next match
  - Broadcast `FLIP_EVENT` to all clients for animation

- [ ] **UNO calling:**
  - Auto-detect when player has 1 card left
  - Window for calling UNO (before next player acts)
  - Other players can "catch" — penalty: draw 2

- [ ] **Scoring:**
  - Calculate points based on active side's values
  - Track cumulative score across rounds
  - Game ends at 500 points

- [ ] **Edge cases:**
  - Starting card is action → apply to first player
  - Starting card is Wild Draw Two → reshuffle
  - Starting card is Flip → immediate flip to dark
  - 2-player mode: Reverse = Skip
  - Challenge rule for Wild Draw Two / Wild Draw Color

### Phase 4: Client — Join Flow + Lobby
> Players can join from their phones

- [ ] Vite + React + Tailwind setup
- [ ] PWA manifest + service worker (basic offline shell)
- [ ] **HomeScreen:**
  - Enter name
  - Create room (shows room code) OR join room (enter code)
  - Auto-detect server URL from current page
- [ ] **LobbyScreen:**
  - Player list with avatars/colors
  - Host has "Start Game" button
  - Min 4 / Max 10 player enforcement
  - Real-time player join/leave updates

### Phase 5: Client — Game UI
> The main gameplay screen — mobile-first card game

- [ ] **GameBoard layout** (mobile portrait):
  ```
  ┌─────────────────────┐
  │  Opponents (names +  │
  │  card counts around  │
  │  the edges)          │
  ├─────────────────────┤
  │                     │
  │   [Draw]  [Discard] │
  │    Pile     Pile    │
  │                     │
  │  Direction indicator │
  │  Current player glow │
  ├─────────────────────┤
  │  [UNO!]    [Status] │
  ├─────────────────────┤
  │  ┌──┐┌──┐┌──┐┌──┐  │
  │  │  ││  ││  ││  │  │  ← Your hand
  │  └──┘└──┘└──┘└──┘  │  (scrollable)
  └─────────────────────┘
  ```

- [ ] **Card component:**
  - CSS 3D flip animation (light ↔ dark)
  - Color-coded backgrounds (light: R/Y/G/B, dark: Pink/Teal/Orange/Purple)
  - Action card symbols/icons
  - Tap to select, tap again or swipe up to play
  - Playable cards highlighted, unplayable dimmed

- [ ] **Card hand:**
  - Horizontal scrollable fan of cards
  - Cards overlap slightly, spread on hover/tap
  - Smooth reorder animation when cards added/removed

- [ ] **Discard pile:**
  - Shows top card with played animation (card flies in)
  - Light/dark side indicator

- [ ] **Draw pile:**
  - Tap to draw
  - Card draw animation

- [ ] **Opponents display:**
  - Name + card count badges around top/sides
  - Highlight current player's turn
  - Show when someone has 1 card (UNO indicator)

- [ ] **UNO button:**
  - Big tappable button appears when you play to 1 card
  - Also appears to catch other players who forgot

- [ ] **Color picker:**
  - Modal with 4 color buttons (light or dark side colors)
  - Appears after playing a Wild card

- [ ] **Flip animation:**
  - Full-screen dramatic flip transition
  - All cards in hand animate flipping simultaneously
  - Background color scheme shifts (light ↔ dark theme)

### Phase 6: Client — Polish & PWA
> Make it feel like a real game

- [ ] **Screen wake lock** (NoSleep.js for iOS, Wake Lock API for Android)
- [ ] **Haptic feedback** (Vibration API where supported)
- [ ] **Sound effects** (card play, draw, UNO call, flip) — with mute toggle
- [ ] **Toast notifications** (card played, your turn, UNO caught)
- [ ] **Reconnection handling** — auto-rejoin game on disconnect
- [ ] **PWA install prompt** (Android auto, iOS manual instructions banner)
- [ ] **Loading/connection states** — graceful handling

### Phase 7: Host Dashboard
> What the person running the server sees on their laptop

- [ ] Terminal output: QR code + room code + player count
- [ ] Optional web dashboard at `/host`:
  - Large QR code for easy scanning
  - Room code in big text
  - Player list
  - Game status

---

## Data Flow

```
Player taps card
  → Client sends PLAY_CARD { cardId }
  → Server validates move
  → Server updates game state
  → Server broadcasts to ALL:
      - CARD_PLAYED { card, playerId } (public info)
      - Updated opponent card counts
  → Server sends to EACH player privately:
      - HAND_UPDATE { hand } (only their cards)
  → If action card: server applies effect, broadcasts result
  → If FLIP: server flips everything, sends FLIP_EVENT
  → Server advances turn, broadcasts GAME_STATE
```

---

## Key Design Decisions

1. **Server-authoritative** — Server holds all game state, validates every move. Clients are "dumb" renderers. Prevents cheating.
2. **Private hands** — Each player only receives their own cards. Opponents see card counts only.
3. **Both sides tracked server-side** — Server always knows both sides of every card. Clients only see the active side of their hand (honor system enforced by the server only sending active side data).
4. **Optimistic UI** — Play card immediately on tap, revert if server rejects. On LAN the confirmation is <5ms so this is barely noticeable.
5. **No database** — All state in-memory. Games are ephemeral. Server restart = clean slate.
6. **No auth** — Players just enter a name. Player identity tied to Socket.IO session + a reconnect token stored in localStorage.

---

## Verification / Testing Plan

- [ ] **Unit tests** — Game engine: deck shuffle, deal, move validation, action effects, flip mechanic, scoring, edge cases
- [ ] **Integration tests** — Socket.IO room flow: create, join, start, play through a round
- [ ] **Manual testing** — Open 4+ browser tabs (or phone + laptop) on same network, play a full game
- [ ] **Mobile testing** — Test on real iPhone (Safari) + Android (Chrome) for touch, wake lock, PWA behavior
- [ ] **Edge cases to test:**
  - Player disconnects mid-game → reconnects
  - Host disconnects → host migration or game ends
  - Draw pile exhaustion → reshuffle
  - Wild Draw Color → draw many cards
  - Flip card played → all hands/piles flip
  - UNO call timing window
  - 10 players simultaneously

---

## Estimated Effort by Phase

| Phase | Scope |
|-------|-------|
| 1. Setup & Types | Small — scaffolding + type definitions |
| 2. Room System | Small-Medium — Socket.IO rooms + join flow |
| 3. Game Engine | **Large** — this is the core, most complex phase |
| 4. Client Join/Lobby | Medium — UI screens + Socket.IO client |
| 5. Game UI | **Large** — card components, animations, layout |
| 6. Polish & PWA | Medium — sound, haptics, reconnection, PWA |
| 7. Host Dashboard | Small — QR display + optional web UI |

---

## Open Questions

1. **Stacking house rule?** — Official UNO says no stacking Draw cards. Want to add it as a room option?
2. **Timer per turn?** — Add an optional turn timer (e.g., 30s) to keep the game moving?
3. **Spectator mode?** — Allow people to watch without playing?
4. **Team variant?** — Any interest in team-based scoring?
