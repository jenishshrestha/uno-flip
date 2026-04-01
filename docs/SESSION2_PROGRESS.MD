---
name: project-session2-progress
description: Session 2 progress (2026-03-30) — Phase 5 implementation status, what's done, what's next
type: project
---

## Session 2 Progress (2026-03-30)

### What was completed

**Server-side (all working, tested):**
- `scores: Record<string, number>` added to `GameState` (shared types)
- `START_NEXT_ROUND` event added to `ClientToServerEvents`
- `startNextRound()` in game-engine — resets round, keeps cumulative scores
- `reconnectPlayer()` in game-engine — swaps old socket ID → new ID in all maps/sets
- `rejoinRoom()` in room-manager — finds disconnected player by name, reconnects
- `removePlayer()` updated — mid-game marks disconnected (keeps for rejoin), lobby fully removes
- Room auto-deletes when ALL players disconnect mid-game
- `connectedPlayers: Set<string>` tracks who is connected
- `JOIN_ROOM` handler tries reconnection first, falls back to normal join
- `disconnect` handler differentiates mid-game vs lobby
- `START_NEXT_ROUND` handler (host only, round_over phase only)

**Client-side (done but needs rework):**
- `index.css` cleaned up — removed Vite template CSS, added game styles with `transition: background-color 0.8s ease` on body
- `App.css` emptied (body styles in index.css)
- `motion` package installed
- `ScoreScreen.tsx` created — animated scoreboard, "Next Round" button for host
- `App.tsx` routes `round_over`/`game_over` to ScoreScreen
- `GameScreen.tsx` has motion animations but **user wants a complete rework**

### What needs rework (Phase 5 animation overhaul)

User feedback: current animations are just web UI fade/slide transitions. Wants actual card game feel — cards physically flying from deck to players, table layout, 3D flip.

**Three big changes needed:**

1. **Table layout** — Replace vertical column with CSS Grid
   - Opponents at top/sides, deck+discard in center, your hand at bottom
   - Green felt-like background with radial gradient
   - Side players rotated 90°

2. **Dealing animation** — Client-side staged dealing
   - Server sends all cards at once (no server change)
   - Client stages them: one card at a time flies from deck position to each player
   - Uses `useRef` on deck → `getBoundingClientRect()` for source coordinates
   - Opponent cards fly face-down, your cards flip face-up on arrival
   - 150ms stagger between each card

3. **3D card flip** — CSS `preserve-3d` + `backface-visibility`
   - Front face (card color + value) and back face (card back design)
   - Flip lifts card at midpoint (`translateZ(8em)` at 50%) for realism
   - Used during dealing (face-down → face-up) and FLIP event

**Research saved in:** `research_card_game_animations.md`

### Branch status
- Working on `main` branch (not on a feature branch)
- All changes are uncommitted

### To resume next session
1. Read `research_card_game_animations.md` for full technique details
2. Rework `GameScreen.tsx`:
   - CSS Grid table layout
   - 3D card component with front/back faces
   - Dealing phase animation (staged, one card at a time)
   - Card movement using refs for deck/discard positions
3. Test with `pnpm dev` — open two tabs at http://localhost:5173
