import { Canvas, useThree } from "@react-three/fiber";
import type { ActiveSide, Card, GameState, PlayerHand } from "@uno-flip/shared";
import { canPlayCard, DECK_MAP, resolveCardIds } from "@uno-flip/shared";
import { AnimatePresence, motion } from "motion/react";
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
import type {
  DiscardConfig,
  DiscardEntry,
} from "./components/DiscardPile3D.js";
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
import { TableDirection } from "./components/TableDirection.js";
import { TableLogo } from "./components/TableLogo.js";
import type { ThrowPose } from "./components/ThrowCardSequence.js";
import { ThrowCardSequence } from "./components/ThrowCardSequence.js";
import { DARK_COLORS, LIGHT_COLORS } from "./utils/cardColors.js";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_POSITION,
} from "./utils/constants.js";
import { projectScreenPercentToY0 } from "./utils/screenProject.js";

// Mix of positive, gloating, and "throw at someone" emotes.
const EMOTES = ["👍", "🤣", "🎉", "❤️", "😡", "🥚", "💩", "🤡"] as const;

// Small popover anchored above a nameplate. Pick an emoji → emit + close.
function EmotePicker({ onPick }: { onPick: (emote: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.85 }}
      transition={{ type: "spring", bounce: 0.4, duration: 0.25 }}
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        padding: 8,
        borderRadius: 12,
        background: "rgba(0,0,0,0.85)",
        border: "1px solid rgba(255,255,255,0.15)",
        backdropFilter: "blur(6px)",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 4,
        zIndex: 80,
      }}
    >
      {EMOTES.map((e) => (
        <motion.button
          key={e}
          type="button"
          whileHover={{ scale: 1.18 }}
          whileTap={{ scale: 0.85 }}
          onClick={(ev) => {
            ev.stopPropagation();
            onPick(e);
          }}
          style={{
            width: 36,
            height: 36,
            fontSize: 22,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {e}
        </motion.button>
      ))}
    </motion.div>
  );
}

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
  activeSide: ActiveSide = "light",
): ThrowPose {
  const hit = projectScreenPercentToY0(camera, opp.screenLeft, opp.screenTop);
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

// One in-flight emote between two players. App.tsx accumulates these from
// the EMOTE socket event and passes them down; we render flying emojis
// between the sender's nameplate and the recipient's nameplate.
export interface EmoteFlight {
  id: string;
  fromId: string;
  toId: string;
  emote: string;
}

export interface OpponentPlay {
  playerId: string;
  card: Card;
  // The active side at the moment the card was played. Captured at CARD_PLAYED
  // arrival so the throw lands on the correct face even if FLIP_EVENT/
  // GAME_STATE arrive before the animation completes.
  sidePlayedOn: ActiveSide;
}

// Treat a card as occupying its source slot during flight: if the underlying
// data already removed/added it (race with GAME_STATE/HAND_UPDATE), produce
// the canonical "with-card" list and the slot index it should be at.
function withCardEnsured(
  cards: Card[],
  card: Card,
): { cards: Card[]; slotIndex: number } {
  const existing = cards.findIndex((c) => c.id === card.id);
  if (existing >= 0) return { cards, slotIndex: existing };
  return { cards: [...cards, card], slotIndex: cards.length };
}

function excludeById(cards: Card[], ids: ReadonlySet<number>): Card[] {
  if (ids.size === 0) return cards;
  return cards.filter((c) => !ids.has(c.id));
}

export interface DrawRequest {
  playerId: string;
  // Card ID the server drew. Should match drawPileCardIds.at(-1) at the
  // moment the draw was issued, but we keep it explicit for clarity.
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
  chosenColorHex,
  highlightDeck,
}: {
  myCards: Card[];
  myPlayerId: string;
  opponents: OpponentSeat[];
  discardPile: DiscardEntry[] | undefined;
  drawPileCards: Card[];
  activeSide: ActiveSide;
  chosenColorHex?: string;
  handConfig?: HandConfig;
  discardConfig?: DiscardConfig;
  deckConfig?: DeckConfig;
  demoDealing?: boolean;
  playableIds?: ReadonlySet<number>;
  playableTranslate?: [number, number, number];
  onPlayCard?: (card: Card) => void;
  opponentPlay?: OpponentPlay | null;
  onOpponentPlayComplete?: (play: OpponentPlay) => void;
  drawRequest?: DrawRequest | null;
  onDrawComplete?: (card: Card, playerId: string) => void;
  onDeckClick?: (playerId: string) => void;
  highlightDeck?: boolean;
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
  // For wild plays we wait until `chosenColorHex` is set (server has the
  // color choice) so the throw animates with the final color baked in.
  useEffect(() => {
    if (!opponentPlay) return;
    if (lastHandledOppPlayRef.current === opponentPlay) return;

    const playedFace =
      opponentPlay.sidePlayedOn === "light"
        ? opponentPlay.card.light
        : opponentPlay.card.dark;
    if (playedFace.color === "wild" && !chosenColorHex) {
      // Defer; effect re-runs when chosenColorHex becomes defined.
      return;
    }

    lastHandledOppPlayRef.current = opponentPlay;

    const opp = opponents.find((o) => o.id === opponentPlay.playerId);
    if (!opp) return;

    // GAME_STATE may have already removed the played card from opp.cards;
    // pin it back into its source slot so the lift starts from where it was.
    const { cards: cardsBefore, slotIndex } = withCardEnsured(
      opp.cards,
      opponentPlay.card,
    );
    const from = getOpponentCardPose(
      camera,
      { ...opp, cards: cardsBefore },
      slotIndex,
      activeSide,
    );
    const worldPos = getDiscardWorldPos(camera, discardConfig);
    const slot = getNextDiscardSlot(discardPile?.length ?? 0);
    const target = getDiscardTopTransform(
      opponentPlay.card,
      slot,
      discardConfig,
      worldPos,
      opponentPlay.sidePlayedOn,
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
  }, [
    opponentPlay,
    opponents,
    camera,
    discardConfig,
    discardPile,
    activeSide,
    chosenColorHex,
  ]);

  const handleOppThrowComplete = useCallback(() => {
    const finished = oppThrowing;
    if (!finished) return;
    playThrowSound();
    onOpponentPlayComplete?.({
      playerId: finished.playerId,
      card: finished.card,
      // PlayArea's oppThrowing doesn't carry sidePlayedOn explicitly; the
      // throw's `to` quaternion was computed from opponentPlay.sidePlayedOn,
      // so we pass that through via the prop.
      sidePlayedOn: opponentPlay?.sidePlayedOn ?? activeSide,
    });
    requestAnimationFrame(() => setOppThrowing(null));
  }, [oppThrowing, onOpponentPlayComplete, opponentPlay, activeSide]);

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
      // HAND_UPDATE may have already added the drawn card; pin it to its
      // post-land slot either way.
      const { cards: handAfter, slotIndex } = withCardEnsured(myCards, card);
      to = getHandSlotTransform(
        camera,
        handConfig,
        slotIndex,
        handAfter.length,
        activeSide,
      );
    } else {
      const opp = opponents.find((o) => o.id === drawRequest.playerId);
      if (!opp) return;
      const { cards: oppCardsAfter, slotIndex: nextSlot } = withCardEnsured(
        opp.cards,
        card,
      );
      to = getOpponentCardPose(
        camera,
        { ...opp, cards: oppCardsAfter },
        nextSlot,
        activeSide,
      );
    }

    playDrawSound();
    setDrawing({ playerId: drawRequest.playerId, card, from, to });
  }, [
    drawRequest,
    drawPileCards,
    camera,
    deckConfig,
    handConfig,
    myCards,
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

  // Hide any in-flight card (throw or local draw) from the rendered hand —
  // the flying ThrowCardSequence renders it from its source slot instead.
  const visibleHandCards = useMemo(() => {
    const exclude = new Set<number>();
    if (throwing) exclude.add(throwing.card.id);
    if (drawing && drawing.playerId === myPlayerId)
      exclude.add(drawing.card.id);
    return excludeById(myCards, exclude);
  }, [myCards, throwing, drawing, myPlayerId]);

  const visibleOpponents = useMemo(() => {
    return opponents.map((o) => {
      const exclude = new Set<number>();
      if (oppThrowing && o.id === oppThrowing.playerId)
        exclude.add(oppThrowing.card.id);
      if (drawing && o.id === drawing.playerId) exclude.add(drawing.card.id);
      const cards = excludeById(o.cards, exclude);
      return cards === o.cards ? o : { ...o, cards };
    });
  }, [opponents, oppThrowing, drawing]);

  // Hide the top of the draw pile while a draw is in flight — the flying
  // ThrowCardSequence renders it instead. Filter by id since the top of
  // drawPileCards is now authoritatively the drawn card.
  const visibleDrawPileCards = useMemo(() => {
    if (!drawing) return drawPileCards;
    return drawPileCards.filter((c) => c.id !== drawing.card.id);
  }, [drawPileCards, drawing]);

  return (
    <>
      {discardPile && discardPile.length > 0 && (
        <DiscardPile3D
          cards={discardPile}
          config={discardConfig}
          chosenColorHex={chosenColorHex}
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
          chosenColorHex={chosenColorHex}
        />
      )}

      {!demoDealing && visibleDrawPileCards.length > 0 && (
        <DeckPile
          cards={visibleDrawPileCards}
          activeSide={activeSide}
          config={deckConfig}
          highlight={highlightDeck}
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

function tToPosition(t: number): { left: number; top: number } {
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
  return { left, top };
}

// Presets for classic small-count layouts
const PRESETS: Record<number, number[]> = {
  1: [0.5], // top center
  2: [1 / 3, 2 / 3], // top-left area, top-right area
  3: [1 / 6, 0.5, 5 / 6], // left, top-center, right
};

function getOpponentPositions(
  opponentCount: number,
): Array<{ top: number; left: number }> {
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
  emoteFlights,
  onEmoteFlightLand,
  onSendEmote,
}: {
  gameState: GameState;
  hand: PlayerHand | null;
  overrideMyId?: string;
  handConfig?: HandConfig;
  deckConfig?: DeckConfig;
  discardConfig?: DiscardConfig;
  demoDealing?: boolean;
  onDemoDealingComplete?: () => void;
  discardPile?: DiscardEntry[];
  onPlayCard?: (card: Card) => void;
  opponentPlay?: OpponentPlay | null;
  onOpponentPlayComplete?: (play: OpponentPlay) => void;
  drawRequest?: DrawRequest | null;
  onDrawComplete?: (card: Card, playerId: string) => void;
  onDeckClick?: (playerId: string) => void;
  showPass?: boolean;
  onPass?: () => void;
  onCatchUno?: (targetPlayerId: string) => void;
  emoteFlights?: EmoteFlight[];
  onEmoteFlightLand?: (id: string) => void;
  onSendEmote?: (toId: string, emote: string) => void;
  playableTranslate?: [number, number, number];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = gameState.activeSide === "dark";
  // PlayerId whose nameplate is currently showing the emote picker. Click a
  // nameplate to open it, click outside or pick an emote to close.
  const [emoteTargetId, setEmoteTargetId] = useState<string | null>(null);

  const myId = overrideMyId ?? socket.id;
  const myIndex = gameState.players.findIndex((p) => p.id === myId);
  const currentPlayerId = gameState.players[gameState.currentPlayerIndex]?.id;

  const myCards: Card[] = useMemo(
    () => (hand ? resolveCardIds(hand.cardIds) : []),
    [hand],
  );

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

  const allPlayerCards = useMemo(() => {
    const result: Record<string, Card[]> = {};
    for (const player of gameState.players) {
      result[player.id] = resolveCardIds(player.cardIds);
    }
    return result;
  }, [gameState.players]);

  // Server-authoritative shuffled order: index 0 = bottom, last = top.
  const drawPileCards = useMemo(
    () => resolveCardIds(gameState.drawPileCardIds),
    [gameState.drawPileCardIds],
  );

  // Hex for the chosen color of the current top wild card. null when no wild
  // is on top, or wild has been played but color hasn't been picked yet.
  const chosenColorHex = useMemo(() => {
    if (!gameState.chosenColor) return undefined;
    const map = gameState.activeSide === "light" ? LIGHT_COLORS : DARK_COLORS;
    return map[gameState.chosenColor];
  }, [gameState.chosenColor, gameState.activeSide]);

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

  const seats = useMemo(
    () => getOpponentPositions(opponents.length),
    [opponents.length],
  );

  const opponentSeats: OpponentSeat[] = useMemo(
    () =>
      opponents
        .map((opp, i) => {
          const seat = seats[i];
          if (!opp || !seat) return null;
          return {
            id: opp.id,
            cards: allPlayerCards[opp.id] ?? [],
            screenLeft: seat.left,
            screenTop: seat.top,
          };
        })
        .filter((s): s is OpponentSeat => s !== null),
    [opponents, seats, allPlayerCards],
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
          <TableDirection direction={gameState.direction} />

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
                  const seat = seats[i];
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
            chosenColorHex={chosenColorHex}
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
            highlightDeck={
              currentPlayerId === myId && gameState.phase === "playing"
            }
          />
        </Canvas>
      </Suspense>

      {/* ─── Player labels (HTML overlay) ─── */}

      {/* Player name — bottom left. Click to open the emote picker. */}
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
        <AnimatePresence>
          {emoteTargetId === myId && (
            <EmotePicker
              onPick={(emote) => {
                if (myId) onSendEmote?.(myId, emote);
                setEmoteTargetId(null);
              }}
            />
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() =>
            setEmoteTargetId((cur) => (cur === myId ? null : (myId ?? null)))
          }
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
            cursor: "pointer",
            fontFamily: "system-ui",
          }}
        >
          {gameState.players[myIndex]?.name ?? "You"}
        </button>
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

      {/* UNO button — always visible, but only fires the call when it's
          your turn, you have 2 cards, and one is playable (server enforces
          the same rule). The button visibly dims when inactive. */}
      {(() => {
        const canCallUno =
          currentPlayerId === myId &&
          myCards.length === 2 &&
          playableIds.size > 0;
        return (
          <button
            type="button"
            onClick={() => {
              if (!canCallUno) return;
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
              cursor: canCallUno ? "pointer" : "not-allowed",
              boxShadow: canCallUno
                ? "0 4px 16px rgba(231, 76, 60, 0.5)"
                : "0 2px 8px rgba(0, 0, 0, 0.3)",
              letterSpacing: 1,
              fontFamily: "system-ui",
              opacity: canCallUno ? 1 : 0.4,
              transition: "opacity 0.2s, box-shadow 0.2s",
            }}
          >
            UNO!
          </button>
        );
      })()}

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
              top: `${seat.top}%`,
              left: `${seat.left}%`,
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              fontFamily: "system-ui",
            }}
          >
            <AnimatePresence>
              {emoteTargetId === opp.id && (
                <EmotePicker
                  onPick={(emote) => {
                    onSendEmote?.(opp.id, emote);
                    setEmoteTargetId(null);
                  }}
                />
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={() =>
                setEmoteTargetId((cur) => (cur === opp.id ? null : opp.id))
              }
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
                cursor: "pointer",
                fontFamily: "system-ui",
              }}
            >
              {opp.name}
            </button>
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

      {/* Click-outside backdrop to dismiss the emote picker */}
      {emoteTargetId !== null && (
        <button
          type="button"
          aria-label="Close emote picker"
          onClick={() => setEmoteTargetId(null)}
          style={{
            position: "absolute",
            inset: 0,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "default",
            zIndex: 65,
          }}
        />
      )}

      {/* ─── Emote flights — emojis arcing between player nameplates ─── */}
      <AnimatePresence>
        {(emoteFlights ?? []).map((flight) => {
          const fromAnchor = getPlayerAnchor(
            flight.fromId,
            myId,
            opponents,
            seats,
          );
          const toAnchor = getPlayerAnchor(flight.toId, myId, opponents, seats);
          if (!fromAnchor || !toAnchor) return null;
          return (
            <motion.div
              key={flight.id}
              initial={{
                left: `${fromAnchor.left}%`,
                top: `${fromAnchor.top}%`,
                scale: 0.4,
                opacity: 0,
              }}
              animate={{
                left: `${toAnchor.left}%`,
                top: `${toAnchor.top}%`,
                scale: [0.4, 1.6, 1.6, 1.4],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 1.2,
                times: [0, 0.4, 0.8, 1],
                ease: "easeOut",
              }}
              onAnimationComplete={() => onEmoteFlightLand?.(flight.id)}
              style={{
                position: "absolute",
                fontSize: 56,
                lineHeight: 1,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 70,
                filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.6))",
              }}
            >
              {flight.emote}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// Map a playerId to its on-screen nameplate anchor (% units, top-left origin).
// Local player sits at fixed bottom-left; opponents use the seat layout.
function getPlayerAnchor(
  playerId: string,
  myId: string | undefined,
  opponents: { id: string }[],
  seats: { left: number; top: number }[],
): { left: number; top: number } | null {
  if (playerId === myId) return { left: 8, top: 95 };
  const idx = opponents.findIndex((o) => o.id === playerId);
  if (idx === -1) return null;
  return seats[idx] ?? null;
}
