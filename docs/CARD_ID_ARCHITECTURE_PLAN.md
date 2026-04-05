# Plan: Card-ID Architecture + Full 3D Game Wiring

## Context
The 3D UNO Flip game needs every card to be a real double-sided 3D object — for the current player AND opponents. In physical UNO Flip, you see the inactive side of opponents' cards across the table. Currently the server only sends card counts for opponents. We need to restructure so the server sends card IDs, and the client looks them up from the shared `FULL_DECK` (112 cards, already available on both sides).

**Principle:** Client-authoritative rendering, server-authoritative game logic. The client already has `FULL_DECK` with all 112 card pairings. Server just needs to say "player X has cards [14, 67, 3]" and the client renders them with both sides.

## Phase 1: Shared Types + DECK_MAP

### `packages/shared/src/constants/deck.ts`
Add O(1) lookup map after FULL_DECK:
```ts
export const DECK_MAP: ReadonlyMap<number, Card> = new Map(
  FULL_DECK.map(card => [card.id, card])
);
```

### `packages/shared/src/types/game.ts`
- Add `cardIds: number[]` to `PublicPlayer`
- Change `PlayerHand` from `{ cards: Card[] }` to `{ cardIds: number[] }`
- Add `DealInfo` type: `{ playerId: string; cardIds: number[] }`

### `packages/shared/src/types/events.ts`
- Add `DEAL_CARDS` event: `{ deals: DealInfo[]; discardTopCardId: number; drawPileCount: number }`
- Change `CARD_PLAYED` from `{ playerId, card: CardSide }` to `{ playerId, cardId: number }`
- Add `CARD_DRAWN` event: `{ playerId, cardId: number }`

### `packages/shared/src/index.ts`
- Export `DECK_MAP` and `DealInfo` type

## Phase 2: Server Changes

### `apps/server/src/game-engine.ts`
- `getPublicGameState()`: add `cardIds: hand.map(c => c.id)` to each PublicPlayer
- Add `getDealInfo()`: returns all players' card IDs + discard top card ID
- Change `PlayResult.cardPlayed: CardSide` → `PlayResult.cardPlayedId: number`
- Add `getPlayerHandIds()`: returns `number[]` instead of `Card[]`

### `apps/server/src/index.ts`
- `START_GAME`: emit `DEAL_CARDS` with all players' card assignments
- `broadcastGameState`: send `{ cardIds }` in HAND_UPDATE
- `PLAY_CARD` handler: emit `cardId` instead of `CardSide`
- `DRAW_CARD` handler: emit `CARD_DRAWN` with card ID to all players

## Phase 3: Client State Management

### `apps/client/src/App.tsx`
- Import `DECK_MAP` from shared
- Add state: `allPlayerCardIds: Record<string, number[]>`
- Handle `DEAL_CARDS` → store all card IDs, trigger deal animation
- Handle `CARD_DRAWN` → add card ID to player's list
- Update `HAND_UPDATE` handler for `{ cardIds }` format
- Update `GAME_STATE` handler to extract `cardIds` from PublicPlayer
- Derive `Card[]` from IDs using `DECK_MAP.get(id)` before passing to 3D

## Phase 4: 3D Components

### `apps/client/src/three/ThreeGameScreen.tsx`
- Accept `allPlayerCardIds: Record<string, number[]>`
- Resolve opponent Card[] from IDs using DECK_MAP
- Pass real cards to DealSequence and OpponentHand3D
- Remove all placeholder card generation

### `apps/client/src/three/components/OpponentHand3D.tsx`
- Change from `cardCount: number` to `cards: Card[]`
- Render real `Card3D` components (opponents see inactive side naturally)
- Fan-flip animation support (same as PlayerHand3D)

### `apps/client/src/three/TestScene.tsx`
- Generate `allPlayerCardIds` from FULL_DECK round-robin
- Pass to ThreeGameScreen

## What Does NOT Change
- `Card3D.tsx` — already renders both sides
- `DealSequence.tsx` — already accepts Card[] per player
- `PlayerHand3D.tsx` — already works with Card[]
- `useAnimations.ts` — all animation hooks unchanged
- `cardSvgTemplate.ts` — SVG rendering unchanged
- Server validation logic (validators.ts) — unchanged
- Server game engine core (turns, scoring, challenges) — unchanged
- `FULL_DECK` 112-card pairings — unchanged

## Security Note
Sending all card IDs to all clients is accurate to the physical game — you CAN see opponents' inactive sides. Server remains authoritative for all rules.

## Implementation Order
1. `packages/shared/` — types + DECK_MAP (foundation, no breakage)
2. `apps/server/src/game-engine.ts` — data helpers
3. `apps/server/src/index.ts` — event emissions
4. `apps/client/src/App.tsx` — state management
5. `apps/client/src/three/ThreeGameScreen.tsx` — wiring
6. `apps/client/src/three/components/OpponentHand3D.tsx` — real card rendering
7. `apps/client/src/three/TestScene.tsx` — mock data update

## Verification
1. `pnpm dev` — both server (3001) and client (5174) start
2. `#/test` — Deal Cards deals real cards to all player positions
3. `#/test` — Flip Cards rotates all cards (yours + opponents)
4. Two browser tabs — create room, join, start game
5. Verify: your cards show light side, opponents show inactive side
6. Verify: dealing is round-robin (1 card per player per round)
7. Verify: playing a card removes it from hand and appears on discard
8. Verify: drawing a card animates from deck to hand
