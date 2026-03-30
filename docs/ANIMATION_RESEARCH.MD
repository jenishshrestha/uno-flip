---
name: research-card-game-animations
description: Deep research on how real card game UIs are built — FLIP technique, layoutId, table layout, 3D flip, dealing animations
type: project
---

## Card Game UI Animation Research (2026-03-30)

### The Core Technique: FLIP Animations

The standard approach for making cards "physically move" between positions on a web-based card game is the **FLIP pattern** (First-Last-Invert-Play) by Paul Lewis:

1. **First** — Record card's current position via `getBoundingClientRect()`
2. **Last** — Execute DOM change (move card to new container), capture new position
3. **Invert** — Apply CSS `transform` so card appears at old position
4. **Play** — Animate removal of that transform → card smoothly moves to new position

Only animates `transform` and `opacity` — compositor-friendly, 60fps on GPU.

### Motion's `layoutId` — Automated FLIP

Motion (motion.dev) automates FLIP via `layoutId` prop. When a component with `layoutId` unmounts in one location and mounts in another, Motion automatically animates between positions.

```jsx
<LayoutGroup>
  {/* Deck zone */}
  <div className="deck">
    {deck.map(card => (
      <motion.div key={card.id} layoutId={`card-${card.id}`} />
    ))}
  </div>
  {/* Hand zone */}
  <div className="hand">
    {hand.map(card => (
      <motion.div key={card.id} layoutId={`card-${card.id}`} />
    ))}
  </div>
</LayoutGroup>
```

Moving a card ID from `deck` array to `hand` array → Motion auto-animates the positional transition.

**Note:** In our UNO game, deck cards don't exist as React elements (client only sees `drawPileCount`). So for dealing/drawing, we use refs to measure deck screen position and set `initial` coordinates from there.

### GSAP Flip Plugin (Alternative)

GSAP's Flip plugin is the manual version with more control:
- `absolute: true` — card becomes `position: absolute` during animation (flies freely over layout)
- `spin` — adds rotation during transit
- `zIndex` control during animation
- Timeline-based staggered dealing

Currently NOT using GSAP (using Motion instead), but Flip plugin is a good fallback if Motion `layoutId` proves insufficient.

### Table Layout — CSS Grid

Standard card game table uses CSS Grid with named areas:

```css
.game-table {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    ".      opponent  ."
    "left   center    right"
    ".      player    .";
  width: 100%;
  height: 100vh;
  background: radial-gradient(ellipse, #1a6b3c, #0d4d2b);
}
```

- **Bottom** — current player's hand, face-up, fanned
- **Top** — opponent across, face-down, compact
- **Left/Right** — side opponents, cards rotated 90°
- **Center** — draw pile + discard pile

Side players: `transform: rotate(90deg)` / `rotate(-90deg)`

### Card Fan Layout

Fan uses `transform-origin: bottom center` with per-card rotation:

```css
.card-in-hand {
  --index: 0;
  --fan-spread: 4deg;
  transform-origin: bottom center;
  transform: rotateZ(calc(var(--index) * var(--fan-spread)));
  margin-left: -30px; /* overlap */
  transition: transform 260ms ease;
}
.card-in-hand:hover {
  transform: rotateZ(calc(var(--index) * var(--fan-spread)))
             translateY(-30px) translateZ(60px);
}
```

In React, calculate `--index` as `i - mid` where `mid = (total-1)/2`. Arc curve: `offsetY = Math.abs(index - mid) * 3px`.

### 3D Card Flip (Face-Down to Face-Up)

Realistic flip lifts the card at midpoint:

```css
.card { transform-style: preserve-3d; perspective: 100em; }
.card .front, .card .back {
  position: absolute; inset: 0;
  backface-visibility: hidden;
}
.card .back { transform: rotateY(180deg); }

@keyframes flip-to-front {
  0%   { transform: translateZ(0) rotateY(180deg); }
  50%  { transform: translateZ(8em) rotateY(90deg); }  /* LIFT */
  100% { transform: translateZ(0) rotateY(0deg); }
}
```

The `translateZ` at midpoint makes the card lift off the table — key for realism.

### Dealing Animation Approach

Client receives all cards at once from server. Client stages the animation:

1. Don't show cards immediately
2. Run dealing sequence: one card at a time flies from deck position to each player
3. Opponent cards fly face-down
4. Your cards flip face-up on arrival
5. Use `useRef` on deck element → `getBoundingClientRect()` for source coordinates
6. Stagger 150ms between each card

```javascript
async function dealCards() {
  for (let i = 0; i < 7 * numPlayers; i++) {
    const playerIndex = i % numPlayers;
    await new Promise(resolve => setTimeout(resolve, 150));
    setDealQueue(prev => [...prev, { card, playerIndex }]);
  }
}
```

### Playing a Card

Card flies from hand position to discard pile position. With `layoutId`, just move the card ID from hand array to discard array → Motion animates automatically. Add random rotation on discard pile for realism.

### Single Container Insight

From Pilatch experiments: if using separate DOM containers per zone, moving a card between them can kill animations in React. Solutions:
- **Option A:** Keep all cards in one flat container, position purely via CSS transforms
- **Option B (recommended for React):** Use `layoutId` (Motion) to correlate elements across container boundaries

### Key Sources
- Motion layout animations: motion.dev/docs/react-layout-animations
- Motion LayoutGroup: motion.dev/docs/react-layout-group
- GSAP Flip Plugin: gsap.com/docs/v3/Plugins/Flip/
- FLIP Technique: aerotwist.com/blog/flip-your-animations/
- Realistic Card Flip: auroratide.com/posts/realistic-flip-animation/
- Card Animation Demos: experiments.pilatch.com/card-animation/
- CodePen card dealing: codepen.io/jmorris/pen/GgBmbo
- CSS card fan: medium.com/@leferreyra (interactive card fan)
- UNO JS implementations: github.com/eperezcosano/Uno, github.com/pedrooaugusto/UNO-card-game

### What Needs to Change in Our UNO Game

1. **Table layout** — Replace vertical column with CSS Grid (players around edges, center zone)
2. **Dealing animation** — Client-side staged dealing (one card at a time from deck position)
3. **3D card flip** — CSS preserve-3d with front/back faces, lift at midpoint
4. **Card movement** — Use refs for deck/discard positions, animate cards between real screen coordinates
5. **Opponent card display** — Show face-down card backs at opponent positions (top/sides)

**Why:** User wants it to feel like sitting at a table, not a web app with transitions.
**How to apply:** Rewrite GameScreen layout to CSS Grid table, add dealing phase with staged animation, implement 3D card flip component.
