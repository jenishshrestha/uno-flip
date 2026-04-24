import { Canvas, useThree } from "@react-three/fiber";
import type { Card, GameState, PlayerHand } from "@uno-flip/shared";
import { canPlayCard, DECK_MAP, FULL_DECK } from "@uno-flip/shared";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Camera } from "three";
import { Euler, Quaternion, Vector3 } from "three";
import { socket } from "../socket.js";
import {
  playDrawSound,
  playPickSound,
  playThrowSound,
  playUnoSound,
} from "../sounds.js";
import { DealSequence } from "./components/DealSequence.js";
import type { DeckConfig } from "./components/DeckPile.js";
import {
  DEFAULT_DECK_CONFIG,
  DeckPile,
  getDeckTopTransform,
  getDeckWorldPos,
} from "./components/DeckPile.js";
import type { DiscardConfig } from "./components/DiscardPile3D.js";
import {
  DEFAULT_DISCARD_CONFIG,
  DiscardPile3D,
  getDiscardTopTransform,
  getDiscardWorldPos,
  getNextDiscardSlot,
} from "./components/DiscardPile3D.js";
import { OpponentHand3D } from "./components/OpponentHand3D.js";
import type { HandConfig } from "./components/PlayerHand3D.js";
import {
  DEFAULT_HAND_CONFIG,
  getHandSlotTransform,
  PlayerHand3D,
} from "./components/PlayerHand3D.js";
import { SceneLighting } from "./components/SceneLighting.js";
import { TableLogo } from "./components/TableLogo.js";
import type { ThrowPose } from "./components/ThrowCardSequence.js";
import { ThrowCardSequence } from "./components/ThrowCardSequence.js";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_POSITION,
} from "./utils/constants.js";

// Must match OpponentHand3D's layout constants
const OPP_CARD_SPACING = 0.15;
const OPP_CARD_SCALE = 0.5;

// Compute where the top of an opponent's hand is in world space + the pose of
// a specific card slot. Mirrors OpponentHand3D exactly so the throw starts
// from where the card visually sits. Opponents show the INACTIVE side (the
// side the card is actually facing away from the player on the table), so the
// Y flip is inverted relative to the hand/deck/discard.
function getOpponentCardPose(
  camera: Camera,
  opp: OpponentSeat,
  slotIndex: number,
  activeSide: "light" | "dark" = "light",
): ThrowPose {
  const ndcX = (opp.screenLeft / 100) * 2 - 1;
  const ndcY = -((opp.screenTop / 100) * 2 - 1);
  const ndc = new Vector3(ndcX, ndcY, 0.5);
  ndc.unproject(camera);
  const dir = ndc.sub(camera.position).normalize();
  const t = -camera.position.y / dir.y;
  const hit = camera.position.clone().add(dir.multiplyScalar(t));

  const count = opp.cards.length;
  const spacing = Math.min(OPP_CARD_SPACING, 2 / Math.max(count, 1));
  const totalWidth = (count - 1) * spacing;
  const startX = hit.x - totalWidth / 2;

  const position = new Vector3(
    startX + slotIndex * spacing,
    0.01 + slotIndex * 0.002,
    hit.z + 0.8,
  );
  const sideY = activeSide === "light" ? Math.PI : 0;
  const quaternion = new Quaternion().setFromEuler(new Euler(-1.5, sideY, 0));
  return { position, quaternion, scale: OPP_CARD_SCALE };
}

export interface OpponentSeat {
  id: string;
  cards: Card[];
  screenLeft: number;
  screenTop: number;
}

export interface OpponentPlay {
  playerId: string;
  card: Card;
}

export interface DrawRequest {
  playerId: string;
  // The actual card ID the server says was drawn. Required so the draw
  // animation carries the real card instead of whatever the client-side
  // deck happens to have on top (those two don't correspond — the client
  // computes the draw pile from FULL_DECK order, not the server's shuffle).
  cardId: number;
}

// Orchestrates hand → throw animation → discard pile for both local and
// opponent plays. Lives inside Canvas so it can access `camera` via useThree.
function PlayArea({
  myCards,
  myPlayerId,
  opponents,
  discardPile,
  drawPileCards,
  activeSide,
  handConfig = DEFAULT_HAND_CONFIG,
  discardConfig = DEFAULT_DISCARD_CONFIG,
  deckConfig = DEFAULT_DECK_CONFIG,
  demoDealing,
  playableIds,
  playableTranslate,
  onPlayCard,
  opponentPlay,
  onOpponentPlayComplete,
  drawRequest,
  onDrawComplete,
  onDeckClick,
}: {
  myCards: Card[];
  myPlayerId: string;
  opponents: OpponentSeat[];
  discardPile: Card[] | undefined;
  drawPileCards: Card[];
  activeSide: "light" | "dark";
  handConfig?: HandConfig;
  discardConfig?: DiscardConfig;
  deckConfig?: DeckConfig;
  demoDealing?: boolean;
  playableIds?: ReadonlySet<number>;
  playableTranslate?: [number, number, number];
  onPlayCard?: (card: Card) => void;
  opponentPlay?: OpponentPlay | null;
  onOpponentPlayComplete?: () => void;
  drawRequest?: DrawRequest | null;
  onDrawComplete?: (card: Card, playerId: string) => void;
  onDeckClick?: (playerId: string) => void;
}) {
  const { camera } = useThree();
  const [throwing, setThrowing] = useState<{
    card: Card;
    from: ThrowPose;
    to: ThrowPose;
  } | null>(null);
  const [oppThrowing, setOppThrowing] = useState<{
    playerId: string;
    card: Card;
    from: ThrowPose;
    to: ThrowPose;
  } | null>(null);
  const lastHandledOppPlayRef = useRef<OpponentPlay | null>(null);

  const [drawing, setDrawing] = useState<{
    playerId: string;
    card: Card;
    from: ThrowPose;
    to: ThrowPose;
  } | null>(null);
  const lastHandledDrawRef = useRef<DrawRequest | null>(null);

  const handlePlay = useCallback(
    (
      card: Card,
      fromPose: { position: Vector3; quaternion: Quaternion; scale: number },
    ) => {
      if (throwing) return; // ignore extra clicks mid-flight
      playPickSound();
      const worldPos = getDiscardWorldPos(camera, discardConfig);
      const slot = getNextDiscardSlot(discardPile?.length ?? 0);
      const target = getDiscardTopTransform(
        card,
        slot,
        discardConfig,
        worldPos,
        activeSide,
      );
      setThrowing({
        card,
        from: fromPose,
        to: {
          position: target.position,
          quaternion: target.quaternion,
          scale: target.scale,
        },
      });
    },
    [camera, discardConfig, discardPile, throwing, activeSide],
  );

  const handleThrowComplete = useCallback(() => {
    const finished = throwing;
    if (!finished) return;
    playThrowSound();
    onPlayCard?.(finished.card);
    requestAnimationFrame(() => setThrowing(null));
  }, [throwing, onPlayCard]);

  // Kick off opponent throw when the `opponentPlay` prop transitions to a
  // new value. Uses a ref to avoid re-triggering on unrelated re-renders.
  useEffect(() => {
    if (!opponentPlay) return;
    if (lastHandledOppPlayRef.current === opponentPlay) return;
    lastHandledOppPlayRef.current = opponentPlay;

    const opp = opponents.find((o) => o.id === opponentPlay.playerId);
    if (!opp || opp.cards.length === 0) return;

    // Pull the card from its last visible slot (arbitrary but stable).
    const slotIndex = opp.cards.length - 1;
    const from = getOpponentCardPose(camera, opp, slotIndex, activeSide);
    const worldPos = getDiscardWorldPos(camera, discardConfig);
    const slot = getNextDiscardSlot(discardPile?.length ?? 0);
    const target = getDiscardTopTransform(
      opponentPlay.card,
      slot,
      discardConfig,
      worldPos,
      activeSide,
    );
    playPickSound();
    setOppThrowing({
      playerId: opp.id,
      card: opponentPlay.card,
      from,
      to: {
        position: target.position,
        quaternion: target.quaternion,
        scale: target.scale,
      },
    });
  }, [opponentPlay, opponents, camera, discardConfig, discardPile, activeSide]);

  const handleOppThrowComplete = useCallback(() => {
    const finished = oppThrowing;
    if (!finished) return;
    playThrowSound();
    onOpponentPlayComplete?.();
    requestAnimationFrame(() => setOppThrowing(null));
  }, [oppThrowing, onOpponentPlayComplete]);

  // Kick off a draw when `drawRequest` transitions to a new value.
  useEffect(() => {
    if (!drawRequest) return;
    if (lastHandledDrawRef.current === drawRequest) return;
    lastHandledDrawRef.current = drawRequest;

    // Animate the actual server-drawn card, not the client's faked top.
    const card = DECK_MAP.get(drawRequest.cardId);
    if (!card) return;

    const deckWorld = getDeckWorldPos(camera, deckConfig);
    const from = getDeckTopTransform(
      deckConfig,
      deckWorld,
      drawPileCards.length,
      activeSide,
    );

    let to: ThrowPose;
    if (drawRequest.playerId === myPlayerId) {
      // Land in the next hand slot
      const nextSlot = myCards.length;
      const totalAfter = nextSlot + 1;
      to = getHandSlotTransform(
        camera,
        handConfig,
        nextSlot,
        totalAfter,
        activeSide,
      );
    } else {
      const opp = opponents.find((o) => o.id === drawRequest.playerId);
      if (!opp) return;
      const nextSlot = opp.cards.length;
      const totalAfter = nextSlot + 1;
      to = getOpponentCardPose(
        camera,
        { ...opp, cards: [...opp.cards, card] }, // sim count+1 for spacing
        nextSlot,
        activeSide,
      );
      void totalAfter;
    }

    playDrawSound();
    setDrawing({ playerId: drawRequest.playerId, card, from, to });
  }, [
    drawRequest,
    drawPileCards,
    camera,
    deckConfig,
    handConfig,
    myCards.length,
    myPlayerId,
    opponents,
    activeSide,
  ]);

  const handleDrawComplete = useCallback(() => {
    const finished = drawing;
    if (!finished) return;
    onDrawComplete?.(finished.card, finished.playerId);
    requestAnimationFrame(() => setDrawing(null));
  }, [drawing, onDrawComplete]);

  // Hide the thrown card from the local hand while it's flying
  const visibleHandCards = useMemo(
    () =>
      throwing ? myCards.filter((c) => c.id !== throwing.card.id) : myCards,
    [myCards, throwing],
  );

  // Filter in-flight cards from opponents' displayed hands (throw or draw source)
  const visibleOpponents = useMemo(() => {
    return opponents.map((o) => {
      let cards = o.cards;
      if (oppThrowing && o.id === oppThrowing.playerId) {
        cards = cards.filter((c) => c.id !== oppThrowing.card.id);
      }
      return cards === o.cards ? o : { ...o, cards };
    });
  }, [opponents, oppThrowing]);

  // Hide the top of the draw pile while a draw is in flight. The client's
  // draw pile doesn't correspond to the server's real shuffle (it's just
  // FULL_DECK minus held), so we can't filter by the drawing card's id —
  // instead just drop the last rendered card to shrink the stack by one.
  const visibleDrawPileCards = useMemo(() => {
    if (!drawing) return drawPileCards;
    return drawPileCards.slice(0, -1);
  }, [drawPileCards, drawing]);

  return (
    <>
      {discardPile && discardPile.length > 0 && (
        <DiscardPile3D
          cards={discardPile}
          activeSide={activeSide}
          config={discardConfig}
        />
      )}

      {visibleHandCards.length > 0 && !demoDealing && (
        <PlayerHand3D
          cards={visibleHandCards}
          activeSide={activeSide}
          config={handConfig}
          playableIds={playableIds}
          playableTranslate={playableTranslate}
          onPlayCard={handlePlay}
        />
      )}

      {!demoDealing &&
        visibleOpponents.map((opp) => (
          <OpponentHand3D
            key={opp.id}
            cards={opp.cards}
            activeSide={activeSide}
            screenLeft={opp.screenLeft}
            screenTop={opp.screenTop}
          />
        ))}

      {throwing && (
        <ThrowCardSequence
          card={throwing.card}
          activeSide={activeSide}
          from={throwing.from}
          to={throwing.to}
          onComplete={handleThrowComplete}
        />
      )}

      {oppThrowing && (
        <ThrowCardSequence
          card={oppThrowing.card}
          activeSide={activeSide}
          from={oppThrowing.from}
          to={oppThrowing.to}
          onComplete={handleOppThrowComplete}
        />
      )}

      {!demoDealing && visibleDrawPileCards.length > 0 && (
        <DeckPile
          cards={visibleDrawPileCards}
          activeSide={activeSide}
          config={deckConfig}
          onClick={drawing ? undefined : () => onDeckClick?.(myPlayerId)}
        />
      )}

      {drawing && (
        <ThrowCardSequence
          card={drawing.card}
          activeSide={activeSide}
          from={drawing.from}
          to={drawing.to}
          onComplete={handleDrawComplete}
          duration={0.5}
          arcHeight={0.9}
          extraSpin={Math.PI * 0.25}
        />
      )}
    </>
  );
}

function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(new Vector3(0, 0, 0));
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

// ─── U-path seating algorithm ───
// Bottom is reserved for the current player.
// Opponents are distributed along a U-shaped path:
//   Left edge (bottom→top) → Top edge (left→right) → Right edge (top→bottom)
//
// t=0.0 = bottom-left corner
// t=0.5 = top-center
// t=1.0 = bottom-right corner
//
// Preset overrides for 1-3 opponents give the classic layouts:
//   1 opponent: top center (face to face)
//   2 opponents: top-left, top-right (Y shape)
//   3 opponents: left, top-center, right (cross shape)

const PAD = 5; // % padding from screen edges

function tToPosition(t: number): { left: string; top: string } {
  t = Math.max(0, Math.min(1, t));

  let left: number;
  let top: number;

  if (t <= 1 / 3) {
    // Left edge: going UP (bottom → top)
    const seg = t / (1 / 3);
    left = PAD;
    top = 100 - PAD - seg * (100 - 2 * PAD);
  } else if (t <= 2 / 3) {
    // Top edge: going RIGHT (left → right)
    const seg = (t - 1 / 3) / (1 / 3);
    left = PAD + seg * (100 - 2 * PAD);
    top = PAD;
  } else {
    // Right edge: going DOWN (top → bottom)
    const seg = (t - 2 / 3) / (1 / 3);
    left = 100 - PAD;
    top = PAD + seg * (100 - 2 * PAD);
  }

  return { left: `${left}%`, top: `${top}%` };
}

// Presets for classic small-count layouts
const PRESETS: Record<number, number[]> = {
  1: [0.5], // top center
  2: [1 / 3, 2 / 3], // top-left area, top-right area
  3: [1 / 6, 0.5, 5 / 6], // left, top-center, right
};

// Numeric version for 3D positioning
function tToPositionNumeric(t: number): { left: number; top: number } {
  t = Math.max(0, Math.min(1, t));
  let left: number;
  let top: number;
  if (t <= 1 / 3) {
    const seg = t / (1 / 3);
    left = PAD;
    top = 100 - PAD - seg * (100 - 2 * PAD);
  } else if (t <= 2 / 3) {
    const seg = (t - 1 / 3) / (1 / 3);
    left = PAD + seg * (100 - 2 * PAD);
    top = PAD;
  } else {
    const seg = (t - 2 / 3) / (1 / 3);
    left = 100 - PAD;
    top = PAD + seg * (100 - 2 * PAD);
  }
  return { left, top };
}

function getOpponentPositionsNumeric(
  opponentCount: number,
): Array<{ top: number; left: number }> {
  if (opponentCount === 0) return [];
  const tValues =
    PRESETS[opponentCount] ??
    Array.from(
      { length: opponentCount },
      (_, i) => (i + 1) / (opponentCount + 1),
    );
  return tValues.map(tToPositionNumeric);
}

function getOpponentPositions(
  opponentCount: number,
): Array<{ top: string; left: string }> {
  if (opponentCount === 0) return [];

  const tValues =
    PRESETS[opponentCount] ??
    Array.from(
      { length: opponentCount },
      (_, i) => (i + 1) / (opponentCount + 1),
    );

  return tValues.map(tToPosition);
}

// ─── Loading screen ───
function LoadingScreen() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui",
        color: "#aaa",
        gap: 12,
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: "3px solid rgba(255,255,255,0.1)",
          borderTop: "3px solid #FFD700",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p style={{ margin: 0, fontSize: 14 }}>Preparing table...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function ThreeGameScreen({
  gameState,
  hand,
  overrideMyId,
  handConfig,
  deckConfig,
  discardConfig,
  demoDealing,
  onDemoDealingComplete,
  discardPile,
  onPlayCard,
  opponentPlay,
  onOpponentPlayComplete,
  drawRequest,
  onDrawComplete,
  onDeckClick,
  showPass,
  onPass,
  onCatchUno,
  playableTranslate,
}: {
  gameState: GameState;
  hand: PlayerHand | null;
  overrideMyId?: string;
  handConfig?: HandConfig;
  deckConfig?: DeckConfig;
  discardConfig?: DiscardConfig;
  demoDealing?: boolean;
  onDemoDealingComplete?: () => void;
  discardPile?: Card[];
  onPlayCard?: (card: Card) => void;
  opponentPlay?: OpponentPlay | null;
  onOpponentPlayComplete?: () => void;
  drawRequest?: DrawRequest | null;
  onDrawComplete?: (card: Card, playerId: string) => void;
  onDeckClick?: (playerId: string) => void;
  showPass?: boolean;
  onPass?: () => void;
  onCatchUno?: (targetPlayerId: string) => void;
  playableTranslate?: [number, number, number];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = gameState.activeSide === "dark";

  const myId = overrideMyId ?? socket.id;
  const myIndex = gameState.players.findIndex((p) => p.id === myId);
  const currentPlayerId = gameState.players[gameState.currentPlayerIndex]?.id;

  // Resolve my hand cards from IDs
  const myCards: Card[] = useMemo(() => {
    if (!hand) return [];
    return hand.cardIds
      .map((id) => DECK_MAP.get(id))
      .filter((c): c is Card => c !== undefined);
  }, [hand]);

  // Which of my cards can legally be played on the current discard top.
  // Empty when it's not my turn, the phase isn't "playing", or no discard top.
  const playableIds = useMemo(() => {
    const canAct = currentPlayerId === myId && gameState.phase === "playing";
    if (!canAct || !gameState.discardTop) return new Set<number>();
    const top = gameState.discardTop;
    return new Set(
      myCards
        .filter((c) =>
          canPlayCard(c, top, gameState.activeSide, gameState.chosenColor),
        )
        .map((c) => c.id),
    );
  }, [
    myCards,
    currentPlayerId,
    myId,
    gameState.phase,
    gameState.discardTop,
    gameState.activeSide,
    gameState.chosenColor,
  ]);

  // Resolve all players' cards from IDs (from PublicPlayer.cardIds)
  const allPlayerCards = useMemo(() => {
    const result: Record<string, Card[]> = {};
    for (const player of gameState.players) {
      result[player.id] = player.cardIds
        .map((id) => DECK_MAP.get(id))
        .filter((c): c is Card => c !== undefined);
    }
    return result;
  }, [gameState.players]);

  // Draw pile visualization. Only the TOP card's identity is known (the
  // server exposes it via gameState.drawPileTopCardId); the rest of the
  // deck stays private. We still render a stack of `drawPileCount` cards
  // so it visually reads as a thick pile, but every card below the top is
  // a placeholder (its dark face is what the user would see on the edges
  // of a real face-down pile anyway). Each placeholder gets a unique
  // negative ID to avoid React-key collisions with the real top card.
  const drawPileCards = useMemo(() => {
    const count = gameState.drawPileCount;
    if (count === 0) return [];
    const topCard =
      gameState.drawPileTopCardId != null
        ? (DECK_MAP.get(gameState.drawPileTopCardId) ?? null)
        : null;
    const placeholder = FULL_DECK[0];
    if (!placeholder) return [];
    const stack: Card[] = [];
    for (let i = 0; i < count; i++) {
      const isTop = i === count - 1;
      if (isTop && topCard) {
        stack.push(topCard);
      } else {
        stack.push({ ...placeholder, id: -i - 1 });
      }
    }
    return stack;
  }, [gameState.drawPileCount, gameState.drawPileTopCardId]);

  // Build opponent list in clockwise order starting from the player after "me"
  const opponents = useMemo(() => {
    const list: (typeof gameState.players)[number][] = [];
    for (let i = 1; i < gameState.players.length; i++) {
      const idx = (myIndex + i) % gameState.players.length;
      const p = gameState.players[idx];
      if (p) list.push(p);
    }
    return list;
  }, [gameState.players, myIndex]);

  const seats = getOpponentPositions(opponents.length);
  const seatsNumeric = getOpponentPositionsNumeric(opponents.length);

  const opponentSeats: OpponentSeat[] = useMemo(
    () =>
      opponents
        .map((opp, i) => {
          const seat = seatsNumeric[i];
          if (!opp || !seat) return null;
          return {
            id: opp.id,
            cards: allPlayerCards[opp.id] ?? [],
            screenLeft: seat.left,
            screenTop: seat.top,
          };
        })
        .filter((s): s is OpponentSeat => s !== null),
    [opponents, seatsNumeric, allPlayerCards],
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100svh",
        position: "relative",
        overflow: "hidden",
        background: isDark
          ? "radial-gradient(ellipse at 50% 45%, #3a1a5e 0%, #1a0a2e 50%, #0a0515 100%)"
          : "radial-gradient(ellipse at 50% 45%, #1a5a3a 0%, #0a2a1a 50%, #050f0a 100%)",
        transition: "background 0.8s ease",
      }}
    >
      {/* 3D Canvas */}
      <Suspense fallback={<LoadingScreen />}>
        <Canvas
          camera={{
            position: CAMERA_POSITION,
            fov: CAMERA_FOV,
            near: CAMERA_NEAR,
            far: CAMERA_FAR,
          }}
          style={{ position: "absolute", inset: 0 }}
          gl={{ alpha: true }}
        >
          <CameraSetup />
          <SceneLighting />
          <TableLogo />

          {/* Demo dealing animation (test page only) */}
          {demoDealing && myCards.length > 0 && (
            <DealSequence
              players={[
                {
                  id: myId ?? "me",
                  screenX: 50,
                  screenY: 85,
                  isMe: true,
                  cards: myCards,
                },
                ...opponents.map((opp, i) => {
                  const seat = seatsNumeric[i];
                  const oppId = opp?.id ?? `opp-${i}`;
                  return {
                    id: oppId,
                    screenX: seat?.left ?? 50,
                    screenY: seat?.top ?? 5,
                    isMe: false,
                    cards: allPlayerCards[oppId] ?? [],
                  };
                }),
              ]}
              activeSide={gameState.activeSide}
              active
              onComplete={onDemoDealingComplete}
            />
          )}

          {/* Hand + opponents + deck + discard + throw/draw animations */}
          <PlayArea
            myCards={myCards}
            myPlayerId={myId ?? "me"}
            opponents={opponentSeats}
            discardPile={discardPile}
            drawPileCards={drawPileCards}
            activeSide={gameState.activeSide}
            handConfig={handConfig}
            discardConfig={discardConfig}
            deckConfig={deckConfig}
            demoDealing={demoDealing}
            playableIds={playableIds}
            playableTranslate={playableTranslate}
            onPlayCard={onPlayCard}
            opponentPlay={opponentPlay}
            onOpponentPlayComplete={onOpponentPlayComplete}
            drawRequest={drawRequest}
            onDrawComplete={onDrawComplete}
            onDeckClick={onDeckClick}
          />
        </Canvas>
      </Suspense>

      {/* ─── Player labels (HTML overlay) ─── */}

      {/* Player name — bottom left */}
      <div
        style={{
          position: "absolute",
          bottom: "3%",
          left: "3%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          fontFamily: "system-ui",
        }}
      >
        <span
          style={{
            padding: "4px 14px",
            borderRadius: 8,
            backgroundColor:
              currentPlayerId === myId
                ? "rgba(255, 215, 0, 0.2)"
                : "rgba(0, 0, 0, 0.4)",
            border:
              currentPlayerId === myId
                ? "2px solid #FFD700"
                : "2px solid transparent",
            color: currentPlayerId === myId ? "#FFD700" : "#ccc",
            fontSize: 14,
            fontWeight: currentPlayerId === myId ? "bold" : "normal",
          }}
        >
          {gameState.players[myIndex]?.name ?? "You"}
        </span>
      </div>

      {/* Pass button — shown when the player just drew a playable card */}
      {showPass && (
        <button
          type="button"
          onClick={() => onPass?.()}
          style={{
            position: "absolute",
            bottom: "3%",
            right: "calc(3% + 140px)",
            padding: "12px 22px",
            fontSize: 16,
            fontWeight: "bold",
            borderRadius: 50,
            border: "none",
            backgroundColor: "#555",
            color: "white",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
            letterSpacing: 1,
            fontFamily: "system-ui",
          }}
        >
          Pass
        </button>
      )}

      {/* UNO button — bottom right */}
      <button
        type="button"
        onClick={() => {
          playUnoSound();
          socket.emit("CALL_UNO");
        }}
        style={{
          position: "absolute",
          bottom: "3%",
          right: "3%",
          padding: "12px 24px",
          fontSize: 18,
          fontWeight: "bold",
          borderRadius: 50,
          border: "none",
          backgroundColor: "#e74c3c",
          color: "white",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(231, 76, 60, 0.5)",
          letterSpacing: 1,
          fontFamily: "system-ui",
        }}
      >
        UNO!
      </button>

      {/* Opponents */}
      {opponents.map((opp, i) => {
        if (!opp) return null;
        const seat = seats[i];
        if (!seat) return null;
        const isCurrent = opp.id === currentPlayerId;

        return (
          <div
            key={opp.id}
            style={{
              position: "absolute",
              top: seat.top,
              left: seat.left,
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              fontFamily: "system-ui",
            }}
          >
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 8,
                backgroundColor: isCurrent
                  ? "rgba(255, 215, 0, 0.2)"
                  : "rgba(0, 0, 0, 0.4)",
                border: isCurrent
                  ? "2px solid #FFD700"
                  : "2px solid transparent",
                color: isCurrent ? "#FFD700" : "#ccc",
                fontSize: 13,
                fontWeight: isCurrent ? "bold" : "normal",
              }}
            >
              {opp.name}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#888",
                backgroundColor: "rgba(0,0,0,0.3)",
                padding: "1px 8px",
                borderRadius: 4,
              }}
            >
              {opp.cardCount} cards
            </span>
            {opp.isUno && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: "bold",
                  color: "#e74c3c",
                }}
              >
                UNO!
              </span>
            )}
            {opp.cardCount === 1 &&
              !opp.isUno &&
              gameState.phase === "playing" && (
                <button
                  type="button"
                  onClick={() => onCatchUno?.(opp.id)}
                  style={{
                    marginTop: 2,
                    padding: "2px 10px",
                    fontSize: 11,
                    fontWeight: "bold",
                    borderRadius: 4,
                    border: "none",
                    backgroundColor: "#f39c12",
                    color: "white",
                    cursor: "pointer",
                    letterSpacing: 0.5,
                  }}
                >
                  CATCH!
                </button>
              )}
          </div>
        );
      })}
    </div>
  );
}
