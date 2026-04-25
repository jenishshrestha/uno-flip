# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## User preferences
- Frontend engineer, beginner at backend/Node.js — explain server concepts using frontend analogies.
- Build incrementally, one step at a time. Let the user test before moving on; don't batch.
- Use `pnpm` (not npm/yarn/bun).
- **Do not** add Claude as co-author in git commits.
- Plain CSS / inline styles + GSAP for animations. No Tailwind.

## Commands
Run from repo root unless noted. `pnpm dev` runs server + client concurrently via Turbo.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Server on `:3001`, client on Vite (`:5174` typically) |
| `pnpm build` | Build all workspaces |
| `pnpm lint` / `pnpm lint:fix` | Biome check / auto-fix |
| `pnpm format` | Biome format only |
| `pnpm check-types` | `tsc --noEmit` across workspaces |
| `pnpm --filter @uno-flip/client exec tsc --noEmit` | Type-check just the client |
| `pnpm --filter @uno-flip/client exec biome check --write <files>` | Lint+format specific client files |

There are no automated tests yet — verify changes manually in `#/` (real game) or `#/test` (3D playground).

## Architecture (the parts that span multiple files)

### Workspaces
- `apps/server` — Express + Socket.IO. Authoritative for game rules.
- `apps/client` — Vite + React 19 + React Three Fiber. UI + 3D rendering.
- `packages/shared` — Types, deck data, validators. Imported by both apps as `@uno-flip/shared`.

### Card-ID architecture (read this before touching gameplay code)
Every card in `FULL_DECK` has a stable numeric `id` and pre-paired light/dark sides (UNO Flip rules). The server only sends **IDs**; the client resolves them through `DECK_MAP.get(id)`. This is true everywhere:
- `PublicPlayer.cardIds: number[]` — what each player holds (visible to all, since UNO Flip lets you see opponents' inactive sides).
- `PlayerHand.cardIds: number[]` — your own hand.
- `DealInfo`, `CARD_PLAYED { cardId }`, `CARD_DRAWN { cardId }` — all event payloads.

When you see a `Card[]` derived in the client (e.g. `myCards`, `allPlayerCards`, `drawPileCards`), it's always `cardIds.map(id => DECK_MAP.get(id))`. The draw pile is *derived*, not sent: `FULL_DECK − held by anyone − discardPile`, then trimmed to `gameState.drawPileCount`.

### Server event flow (`apps/server/src/index.ts`)
Hash-routed client → typed Socket.IO events. The shapes live in `packages/shared/src/types/events.ts`. The engine is purely functional in `game-engine.ts` (no I/O); `index.ts` wires events to engine calls and broadcasts `GAME_STATE`/`HAND_UPDATE` after each mutation. Validators are duplicated client-side via `canPlayCard` / `isWildDrawLegal` from `@uno-flip/shared` for instant feedback — server is still authoritative.

### Client routing (`apps/client/src/App.tsx`)
Hash-based, no router lib:
- `#/` — home (name entry, create/join room)
- `#/room/CODE` — lobby + game (one screen, swaps based on `gameState.phase`)
- `#/test` — `TestScene` with leva controls; the primary dev surface for tweaking 3D layout, animations, and sounds without a server.

### 3D scene (`apps/client/src/three/`)
Camera at `[0, 12, 3]` looking at origin, FOV 45. No 3D table — the background is a CSS gradient on the container `<div>`; the Canvas is `alpha: true` and overlays it.

**Screen-relative positioning.** Hand/deck/discard/opponents all accept a `screenLeft`/`screenTop` (or `screenY`) percentage and project it onto the Y=0 world plane via NDC `unproject`. See helpers `getDeckWorldPos`, `getDiscardWorldPos`, `getHandWorldPos`. To match orientations across hand/deck/discard, all use `tiltX ≈ -1.5` (nearly upright, facing camera). Card depth-stacking is along the *card-local* Z, so the parent group rotation tilts the entire stack uniformly.

**`PlayArea` orchestrator (`ThreeGameScreen.tsx`).** A component that lives **inside** the Canvas (so it can `useThree()`) and owns:
- Player hand, opponents, deck, discard pile rendering.
- Throw animations for both local plays (click → reads card's world pose via ref) and opponent plays (driven by `opponentPlay` prop).
- Draw animations from deck → hand for both local (deck click) and opponent (driven by `drawRequest` prop).

In-flight cards are filtered out of their source list and a `ThrowCardSequence` is rendered instead. On animation end the parent's `onPlayCard`/`onDrawComplete` is called and the local "in-flight" state is cleared on the **next rAF** so the committed render is visible for one frame before unmounting the flying card — this masks the texture swap.

**`ThrowCardSequence`** is a single primitive used for throw and draw. Configurable `duration`, `arcHeight`, `extraSpin`. It slerps quaternions and lerps positions with a sine-arc lift; `extraSpin` decays to 0 at landing so the final pose matches the target exactly (zero snap).

**Pose helpers.** Each pile module exports the math the orchestrator needs to compute exact landing/launch poses:
- `getDeckTopTransform`, `getDeckWorldPos` (DeckPile.tsx)
- `getDiscardTopTransform`, `getDiscardWorldPos`, `getNextDiscardSlot` (DiscardPile3D.tsx) — discard uses deterministic per-card jitter (offset + spin) seeded from `card.id`, so a thrown card lands at the exact slot the renderer will draw it at.
- `getHandSlotTransform`, `getHandWorldPos` (PlayerHand3D.tsx)

**Texture cache.** `useCardFaceTexture` looks up a module-level `Map<string, CanvasTexture>` keyed by `${color}|${value}|${activeSide}`. Without this, a card moving from a flying-animation node into a pile node would re-rasterize its SVG and blink for a frame.

### Animation hooks (`apps/client/src/three/hooks/useAnimations.ts`)
- `useFanFlipAnimation` — stack → flip 180° → fan, used by hand/opponent components on `activeSide` change.
- `useDealAnimation` — deal-from-center round-robin used by `DealSequence`.
Both take `cardRefs` (array of `Group | null`) and animate via GSAP directly on the object's transform.

### Card SVGs
`cardSvgTemplate.ts` builds light/dark face SVGs from a stored `VALUE_PATHS` dictionary (Figma path exports). `useCardTexture` rasterizes them via Blob URL → `<img>` → 2D canvas → `CanvasTexture`.

### Sounds (`apps/client/src/sounds.ts`)
Pre-loaded `<audio>` elements: `pick` (on play click), `throw` (on play landing), `draw` (on draw start), `uno`. All wrapped in a `play()` helper that swallows autoplay-block errors.

## Conventions worth knowing
- TypeScript ESM throughout (`"type": "module"`). Imports use `.js` extensions even though sources are `.ts` (NodeNext resolution).
- Biome enforces import sorting, type-only imports, and unused-import errors. After significant edits run `pnpm --filter @uno-flip/client exec biome check --write <files>` to auto-fix.
- `@uno-flip/shared` is a workspace package — re-imports/types must be re-exported from `packages/shared/src/index.ts` to be visible.
- `docs/UNO_FLIP_RULES.md` is the canonical rules reference; consult it before changing engine logic.
