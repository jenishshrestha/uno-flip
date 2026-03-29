# UNO Flip — Project Context

## User
- Frontend engineer, beginner at backend/Node.js
- Explain server concepts using frontend analogies
- Build step by step so each piece is understandable
- Use pnpm (not npm or bun) for package management
- Do not add Claude as co-author in git commits

## Tech Stack
- **Monorepo**: Turborepo + pnpm workspaces
- **Server**: Express + Socket.IO (apps/server)
- **Client**: Vite + React + TypeScript (apps/client)
- **Shared**: Types, deck, rules (packages/shared)
- **Linter/Formatter**: Biome (not ESLint/Prettier)
- **Styling**: Inline styles currently, Tailwind planned

## Project Structure
```
apps/server/src/
  index.ts          — Express + Socket.IO wiring, event handlers
  room-manager.ts   — Create/join/leave rooms (4-letter codes)
  deck.ts           — Shuffle, deal, draw, discard, reshuffle
  validators.ts     — Card play validation, wild draw legality
  actions.ts        — Action card effect resolver
  scoring.ts        — Point calculation
  game-engine.ts    — Main game state machine

apps/client/src/
  App.tsx            — Hash-based router (home → room → lobby → game)
  socket.ts          — Typed Socket.IO connection
  styles.ts          — Shared styles + card color maps
  screens/GameScreen.tsx — Game UI with cards, piles, challenge overlay

packages/shared/src/
  types/card.ts      — Card, CardSide, CardValue, ActiveSide
  types/game.ts      — GameState, PublicPlayer, GamePhase
  types/events.ts    — ClientToServerEvents, ServerToClientEvents
  constants/deck.ts  — 112-card deck builder
  constants/rules.ts — Scoring, player limits, game rules

docs/UNO_FLIP_RULES.md — Complete official rules reference
```

## Game Flow
1. Player clicks Play → server creates room → URL becomes #/room/CODE
2. Players open URL → enter name → join lobby
3. Host clicks Start Game → 7 cards dealt → game begins
4. Players take turns: play matching card, draw, or pass
5. Wild cards → color picker → challenge mechanic for wild draws
6. Round ends when someone empties hand → scoring → first to 500 wins

## Commands
- `pnpm dev` — Start both server (3001) and client (5173)
- `pnpm lint:fix` — Biome lint + format
- `pnpm lint` — Check only (no fix)

## Current State (2026-03-29)
- Branch `refactor/game-engine-rules` has latest work (not merged to main)
- Game engine matches official UNO Flip rules
- Manual testing only — no unit tests yet
- Next: Phase 5 (card UI/animations with Tailwind) or fix remaining bugs
