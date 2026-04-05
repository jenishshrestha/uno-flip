---
name: Session 3 Progress
description: 3D migration progress from 2026-04-04, card rendering, animations, test scene, exact deck pairings
type: project
---

Branch: `feature/3d-table` (from main)

**What's done:**
- Three.js + R3F + drei + GSAP + Rapier + leva installed
- CSS gradient background (no 3D table geometry — screen-based layout)
- Card SVG template system in code (cardSvgTemplate.ts) — no SVG files, all paths in variables
- All light side cards: numbers 1-9, skip, reverse, draw_one, flip, wild, wild_draw_two, wild_draw_color (Figma path exports)
- Dark side template ready (gradient bg + black symbols via buildCardSvg with side parameter)
- Exact 112-card deck with physical light/dark pairings (deck.ts rewritten from CARDS_LIST.md)
- Card3D component: FullCard (both real sides), FaceOnlyCard, FaceDownCard
- Player positions: U-path algorithm for 2-10 players
- PlayerHand3D with fan layout + leva controls
- OpponentHand3D component (shows card backs at opponent screen positions)
- Reusable animation hooks in useAnimations.ts: useFlipAnimation, useFanFlipAnimation, useDealAnimation, useArcMoveAnimation, useScalePulse
- Fan-flip animation: cards stack → flip 180° around own Y axis → fan back out
- Deal animation: cards arc from center to positions with stagger
- Test scene at #/test with leva controls and action buttons (Deal, Flip)
- UNO button with sound, UNO logo centered

**Open questions for next session:**
1. Dealing should be ROUND-ROBIN across all players (1 card per player per round, 7 rounds), not all-at-once per player. Needs a single orchestrator at ThreeGameScreen level.
2. Opponent cards should show the DARK SIDE face (not generic UNO back) since physically you see the other side of their cards across the table. But server currently only sends cardCount, not actual card data. Need to either:
   - Update server to send opponents' inactive-side card faces, OR
   - Show generic dark-side placeholder for now
3. Dark side card template needs visual testing (gradient backgrounds)
4. Card spacing default set to 0.5

**What's next (priority order):**
1. Fix dealing to round-robin across all players
2. Resolve opponent card visibility (server change vs placeholder)
3. Deck pile at center
4. Discard pile
5. Wire gameplay (play card, draw card, pass)
6. HTML overlays (color picker, challenge, turn indicator)
7. Dark side visual testing

**Key architecture decisions:**
- Screen-based layout, NOT 3D table. Cards positioned relative to viewport.
- CSS background gradient, transparent Three.js canvas on top
- Rapier physics planned for discard pile settling, not used yet
- GSAP for orchestrated animations, react-spring available but unused so far
- Card textures: SVG → Blob URL → Image → Canvas → CanvasTexture
- Animation hooks are reusable and composable (attach to any 3D object ref)

**Key files:**
- apps/client/src/three/ThreeGameScreen.tsx — main game screen + U-path seating
- apps/client/src/three/TestScene.tsx — test scene with leva + FULL_DECK
- apps/client/src/three/components/Card3D.tsx — card variants (Full/FaceOnly/FaceDown)
- apps/client/src/three/components/PlayerHand3D.tsx — player hand + deal/flip animations
- apps/client/src/three/components/OpponentHand3D.tsx — opponent cards (needs rework)
- apps/client/src/three/hooks/useAnimations.ts — GSAP animation hooks
- apps/client/src/three/hooks/useCardTexture.ts — SVG → texture pipeline
- apps/client/src/three/utils/cardSvgTemplate.ts — all card SVG paths + buildCardSvg()
- apps/client/src/three/utils/cardColors.ts — colors + dark gradients
- apps/client/src/three/utils/constants.ts — camera, card dimensions
- packages/shared/src/constants/deck.ts — exact 112-card pairings

**Color reference:**
- Light: Red #D72600, Blue #0956BF, Green #379711, Yellow #ECD407
- Dark gradients: Pink #FF00FF→#8A008A, Teal #00FFFF→#008080, Orange #FF8C00→#B05500, Purple #BF00FF→#5A0080
