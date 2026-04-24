---
name: Session 4 Progress
description: Real-gameplay wiring, P0 crash fix, active-side fixes, deck authority, playable indicator
type: project
---

Branch: `feature/3d-table`. Session date: 2026-04-24.

Picked up after c155a2a (deck/discard piles + throw/draw animations). Focus this session: wire the 3D test-scene behaviours into real multiplayer gameplay, fix the cascade of active-side orientation bugs that followed, and make the deck server-authoritative.

---

## 1. Real gameplay wiring

Before: 3D scene worked in `#/test` with mocked state; real multiplayer only showed the game screen + a stray `CARD_PLAYED` toast. No draw animation, no opponent throw animation, no overlays.

Server
- [apps/server/src/index.ts](apps/server/src/index.ts) — `DRAW_CARD` handler now emits `CARD_DRAWN { playerId, cardId }` so every client can animate the draw.

Client ([apps/client/src/App.tsx](apps/client/src/App.tsx))
- New state: `discardPile: Card[]`, `opponentPlay`, `drawRequest`, `flipShowing`, `pendingDrawnCardId`.
- `DEAL_CARDS` → seeds the discard pile with `DECK_MAP.get(discardTopCardId)`.
- `CARD_PLAYED` → if not me, set `opponentPlay` to trigger the throw animation. No sonner toast (card lands visibly on the pile).
- `CARD_DRAWN` → set `drawRequest { playerId, cardId }`. If it's me and the card is legal, also set `pendingDrawnCardId` so the Pass button appears.
- `FLIP_EVENT` → reverse the local `discardPile` to match the server's in-place reverse, plus the `FlipOverlay` pulse.
- Handlers: `handleLocalPlayCard`, `handleOpponentPlayComplete`, `handleDrawComplete`, `handleDeckClick`, `handleColorSelect`, `handlePass`, `handleCatchUno`.
- Overlays mounted: `ColorPickerOverlay` (when `phase === "choosing_color"` and my turn), `ChallengeOverlay` (when I'm `challengeTarget`), `FlipOverlay` (1.2s pulse).
- On `ERROR` matching play-rejection messages, pops the last optimistic discardPile entry as a belt-and-suspenders rollback.

UI affordances in [ThreeGameScreen.tsx](apps/client/src/three/ThreeGameScreen.tsx)
- **Pass** button next to UNO button, shown when `showPass` is true (server left my turn open with a playable drawn card).
- **CATCH!** button on opponent labels when `cardCount === 1 && !opp.isUno && phase === "playing"`.

---

## 2. Client-side play validation (shared validators)

Moved `canPlayCard` and `isWildDrawLegal` from [apps/server/src/validators.ts](apps/server/src/validators.ts) to [packages/shared/src/validators.ts](packages/shared/src/validators.ts). Both are pure. Re-exported from [packages/shared/src/index.ts](packages/shared/src/index.ts). Server `validators.ts` deleted; `game-engine.ts` imports from `@uno-flip/shared`.

Client computes `playableIds: Set<number>` in `ThreeGameScreen` and threads it to `PlayerHand3D`. Unplayable card clicks no-op (no toast, no visual dim — user explicitly rejected dimming).

**Wild draw legality** is NOT enforced client-side — official rules allow the bluff. Only `canPlayCard` gates hand clicks; `isWildDrawLegal` stays on the server for challenge resolution.

---

## 3. P0 crash fix

`<CanvasImpl>` was crashing on game start with `Uncaught ReferenceError: DEFAULT_HAND_CONFIG is not defined` at [ThreeGameScreen.tsx:112](apps/client/src/three/ThreeGameScreen.tsx#L112). The `PlayArea` sub-component used both `DEFAULT_HAND_CONFIG` and `DEFAULT_DECK_CONFIG` as default parameter values but only `DEFAULT_DISCARD_CONFIG` was imported. `TestScene` always passed `handConfig`/`deckConfig` from leva so the bug was invisible there — only the real-game path hit the default and crashed. Added both imports.

---

## 4. Active-side orientation — the long saga

Geometry primer to avoid re-discovering this:
- Each card's mesh has +Z face = light, -Z face = dark.
- `tiltX ≈ -1.5` tilts the card nearly flat so +Z points mostly to world +Y (up, toward the camera at `(0, 12, 3)`).
- To show the dark face toward camera, rotate the card 180° around Y. I.e. `rotation.y = π` → `-Z` now points toward camera.

What the rules say:
- **Hand**: you hold cards active-side toward yourself — you see the active side.
- **Opponents**: they hold cards active-side toward themselves — you see the inactive side across the table.
- **Discard top**: played face-up, shows the active side.
- **Draw pile**: placed "Light Side facing down, Dark Side up" (UNO Flip setup rule 5) — you see the inactive side.
- **Flip card**: the entire discard pile is reversed (flip card goes to the bottom), the draw pile is flipped, all hands flip.

Where each renderer needs its Y rotation
| Surface | Light mode Y | Dark mode Y |
|---|---|---|
| Hand (own cards, active-side toward self) | 0 | π |
| Discard top (active-side up) | 0 | π |
| Deck top (inactive-side up) | **π** | **0** |
| Opponent hand (inactive-side toward viewer) | **π** | **0** |

Fixes landed across
- [components/DiscardPile3D.tsx](apps/client/src/three/components/DiscardPile3D.tsx) — per-card Y rotation and `getDiscardTopTransform` take `activeSide`.
- [components/DeckPile.tsx](apps/client/src/three/components/DeckPile.tsx) — same, but INVERTED (inactive-side up).
- [components/PlayerHand3D.tsx](apps/client/src/three/components/PlayerHand3D.tsx) `getHandSlotTransform` takes `activeSide` so a drawn card lands oriented right.
- [ThreeGameScreen.tsx](apps/client/src/three/ThreeGameScreen.tsx) `getOpponentCardPose` takes `activeSide`; all call sites in `PlayArea` pass it.

Throw/draw-target issue (before this fix): `from.quaternion` captured from the hand card's `getWorldQuaternion()` correctly included the 180° flip in dark mode, but `to.quaternion` (discard-top pose) didn't — so in dark mode a thrown card rotated back to light mid-flight.

---

## 5. Hand flip on cold mount — `useFanFlipAnimation` rework

`useFanFlipAnimation` only fired on `activeSide` *change*. If the client mounted cold into dark mode (starting card was Flip, or mid-game refresh), the hand JSX rotation hard-coded `[tiltX, 0, 0]` left cards at Y=0 → light side showing despite dark-mode background + pile. Screenshot from user showed exactly that: purple background, dark pile, light-side hand.

Rewrite in [hooks/useAnimations.ts](apps/client/src/three/hooks/useAnimations.ts):
- New `baseY` option. `0` for local hand, `π` for opponents (opponents show inactive-side by default).
- `prevSide = useRef<"light" | "dark" | null>(null)` — null is the first-mount sentinel.
- Three effect branches:
  1. **First mount** — set `flipRotation.current = baseY + (dark ? π : 0)`, imperatively set every ref's `rotation.y` to that value, no animation.
  2. **Same side, effect re-ran** (card drawn) — snap any ref whose `rotation.y` drifted from the tracked value (new refs arrive at JSX default `0`, need to be pulled up).
  3. **Side change** — existing stack → flip → fan GSAP timeline.
- [OpponentHand3D.tsx](apps/client/src/three/components/OpponentHand3D.tsx) — JSX rotation changed from `[-1.5, Math.PI, 0]` to `[-1.5, 0, 0]` and now passes `{ baseY: Math.PI }`. Opponent fans now actually visibly flip on flip-events; previously `flipRotation` accumulator started at 0 so first flip landed at π — same as the static JSX — no visible change.

---

## 6. Playable-card lift (long exploration, ended on "no lift")

User wanted playable cards visually distinguished. Long iteration:
1. World-Y lift → too subtle because Y is near-parallel to camera view in this scene.
2. Bigger world-Y lift → visible as zoom (toward camera), not "up on screen".
3. Camera-up vector lift `(0, 0.24, -0.97)` → correct direction, but pure -Z pushed cards behind in z-order because DeckPile was using inverted stacking (see section 7).
4. Local-axis translate `[tx, ty, tz]` with conversion via card rotation matrix — user landed on `translateY = 0.15`.
5. Then: user asked to remove it entirely. Final state: **no lift, no cursor change, no visual indication**. Just the click gate.

Kept the `playableIds` prop flow and `TEST_HAND_LIGHT` in [TestScene.tsx](apps/client/src/three/TestScene.tsx) (4 wilds + 3 number cards) for testing playability logic, and the mock discard top is now `blue-1` so only wilds register as playable.

Test-scene leva panels now include a "Playable translate" folder with 3 sliders (X/Y/Z) wired through `playableTranslate` prop — **removed** when the feature was dropped.

---

## 7. Deck authority — the one that fixed the fake cards

User reported: "deck shows pink reverse, I drew and got green reverse". The deck visual was a client-fake — `drawPileCards` was computed as `FULL_DECK - held - discard` sliced, bearing no relation to the server's shuffled pile.

Shared ([types/game.ts](packages/shared/src/types/game.ts)) — `GameState` gains `drawPileTopCardId: number | null`. Only the top is exposed; the rest of the shuffled deck order stays private on the server.

Server
- [game-engine.ts](apps/server/src/game-engine.ts) `getPublicGameState` fills it from `game.deck.drawPile[length-1]?.id ?? null`.
- [index.ts](apps/server/src/index.ts) `lobbyState` initialises it as `null`.

Client ([ThreeGameScreen.tsx](apps/client/src/three/ThreeGameScreen.tsx))
- `drawPileCards` rebuilt: length `drawPileCount`, last slot is `DECK_MAP.get(drawPileTopCardId)` (the real server top), others are `{ ...FULL_DECK[0], id: -i-1 }` placeholders with unique negative IDs.
- `DrawRequest` gained `cardId`. `PlayArea` uses `DECK_MAP.get(drawRequest.cardId)` for the draw animation, not the client-faked top.
- `visibleDrawPileCards` during draw uses `slice(0, -1)` (just shrink the stack by one) instead of filtering by card ID, since the client's draw pile doesn't correspond to the server's shuffle.
- [App.tsx](apps/client/src/App.tsx) `CARD_DRAWN` passes `cardId` into `setDrawRequest`.
- [TestScene.tsx](apps/client/src/three/TestScene.tsx) `triggerDraw` picks a real available card and sets `drawRequest.cardId`; mock game state computes `drawPileTopCardId` the same way the server would.

---

## 8. DeckPile stacking sign error (the final bug)

Even after (7) the drawn card still didn't match the deck visual. Root cause: [DeckPile.tsx](apps/client/src/three/components/DeckPile.tsx) stacked cards with `position={[0, 0, -i * STACK_GAP]}` (negative Z), which after the near-flat `tiltX` rotation resolves to world -Y — below the table. So the card at index 0 (Z=0, table level) was the visual top, and `visibleCards[count-1]` (Z=-0.49, below the table) was the visual bottom.

My section-7 fix put the server's `topCard` at `drawPileCards[count-1]` — which is the LAST rendered card, which was buried at the **bottom**. Visible top was a placeholder; actual drawn card came from the hidden real top.

Fix: flipped DeckPile's stacking to `position={[0, 0, i * STACK_GAP]}` (positive, matches DiscardPile3D's direction), and updated `getDeckTopTransform` to `(clampedCount - 1) * STACK_GAP`. Now `visibleCards[last] = topCard` is at the visual top.

---

## State at end of session

**Working**
- Real multiplayer flow end-to-end: deal, play, draw, flip, color-pick, challenge, catch-UNO, pass, win.
- All active-side orientations correct (hand, opponents, deck, discard) in both modes, across mounts and flips.
- Deck top is server-authoritative and matches what lands in the hand when drawing.
- Opponent fans visibly flip on flip-events.
- Cold-mount into dark mode renders hand correctly.

**Not tested exhaustively**
- Multi-round scoring UI.
- Reshuffle discard-into-draw path (rare in normal play).
- Reconnect mid-game.

**Deferred / not done**
- No "deal in" animation at game start — cards just appear. User explicitly skipped.
- No visual cue for playable cards — user rejected all tried approaches (dim, lift, scale).
- No fix for the pre-existing unused `activeSide` param lint warning in `Card3D.tsx`.

**Key files touched**
- Client: `App.tsx`, `three/ThreeGameScreen.tsx`, `three/TestScene.tsx`, `three/components/{Card3D,DeckPile,DiscardPile3D,OpponentHand3D,PlayerHand3D}.tsx`, `three/hooks/useAnimations.ts`.
- Server: `index.ts`, `game-engine.ts`, `validators.ts` (deleted).
- Shared: `types/game.ts`, `index.ts`, `validators.ts` (new).

**Uncommitted delta at handoff**: all of the above + `package.json` packageManager bump from `pnpm@9.0.0` → `pnpm@10.33.0`.
