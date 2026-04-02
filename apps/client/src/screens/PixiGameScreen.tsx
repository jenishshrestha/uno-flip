import { Application, extend, useApplication } from "@pixi/react";
import type {
  ActiveSide,
  Card,
  CardSide,
  DarkColor,
  GameState,
  LightColor,
  PlayerHand,
} from "@uno-flip/shared";
import gsap from "gsap";
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "../socket.js";

// Register PixiJS components for JSX
extend({ Container, Graphics, Text });

// Set global GSAP defaults — every tween gets this ease automatically
gsap.defaults({ ease: "power2.out", duration: 0.3 });

// ─── Constants ───
const CARD_W = 60;
const CARD_H = 88;
const CARD_R = 8;

// ─── Color map (hex numbers for PixiJS) ───
const COLORS_LIGHT: Record<string, number> = {
  red: 0xff5555,
  yellow: 0xffaa00,
  green: 0x55aa55,
  blue: 0x5555ff,
  wild: 0x333333,
};
const COLORS_DARK: Record<string, number> = {
  pink: 0xff69b4,
  teal: 0x008080,
  orange: 0xff8c00,
  purple: 0x8b008b,
  wild: 0x333333,
};

function cardColor(face: CardSide, side: ActiveSide): number {
  const map = side === "light" ? COLORS_LIGHT : COLORS_DARK;
  return map[face.color] ?? 0x333333;
}

function cardLabel(value: CardSide["value"]): string {
  if (typeof value === "number") return String(value);
  const labels: Record<string, string> = {
    skip: "⊘",
    skip_everyone: "⊘ALL",
    reverse: "⇄",
    draw_one: "+1",
    draw_five: "+5",
    flip: "FLIP",
    wild: "W",
    wild_draw_two: "W+2",
    wild_draw_color: "W+C",
  };
  return labels[value] ?? value;
}

function canPlayCard(card: Card, gameState: GameState): boolean {
  if (!gameState.discardTop) return false;
  const face = gameState.activeSide === "light" ? card.light : card.dark;
  if (face.color === "wild") return true;
  const activeColor = gameState.chosenColor ?? gameState.discardTop.color;
  if (face.color === activeColor) return true;
  if (face.value === gameState.discardTop.value) return true;
  return false;
}

// ─── Table felt background ───
function TableFelt() {
  const { app } = useApplication();
  const w = app?.screen?.width ?? 800;
  const h = app?.screen?.height ?? 600;
  const cx = w / 2;
  const cy = h * 0.43;

  return (
    <pixiGraphics
      draw={(g) => {
        g.clear();
        g.ellipse(cx, cy, w * 0.42, h * 0.3);
        g.fill({ color: 0x0d4d2b, alpha: 0.6 });
        g.ellipse(cx, cy, w * 0.42, h * 0.3);
        g.stroke({ color: 0x1a6b3c, width: 2, alpha: 0.4 });
      }}
    />
  );
}

// ─── Single card face (colored rectangle + value text) ───
function CardSprite({
  x,
  y,
  color,
  label,
  width = CARD_W,
  height = CARD_H,
  borderColor = 0xffffff,
  borderAlpha = 0.25,
  interactive = false,
  onClick,
  flyTo,
}: {
  x: number;
  y: number;
  color: number;
  label: string;
  width?: number;
  height?: number;
  borderColor?: number;
  borderAlpha?: number;
  interactive?: boolean;
  onClick?: () => void;
  flyTo?: { x: number; y: number; onComplete: () => void };
}) {
  const drawCard = useCallback(
    (g: Graphics) => {
      g.clear();
      // Card body
      g.roundRect(-width / 2, -height / 2, width, height, CARD_R);
      g.fill({ color });
      // Border
      g.roundRect(-width / 2, -height / 2, width, height, CARD_R);
      g.stroke({ color: borderColor, width: 1.5, alpha: borderAlpha });
      // Center oval (signature UNO look)
      g.ellipse(0, 0, width * 0.35, height * 0.25);
      g.fill({ color: 0xffffff, alpha: 0.15 });
    },
    [color, width, height, borderColor, borderAlpha],
  );

  const textStyle = new TextStyle({
    fontSize: width * 0.35,
    fontWeight: "bold",
    fill: 0xffffff,
    align: "center",
  });

  const containerRef = useRef<Container>(null);
  const initializedRef = useRef(false);

  // Smooth position transitions — tween instead of snapping
  useEffect(() => {
    if (!containerRef.current) return;
    if (!initializedRef.current) {
      // First render: set position immediately
      containerRef.current.x = x;
      containerRef.current.y = y;
      initializedRef.current = true;
    } else {
      // Subsequent renders: tween to new position
      gsap.to(containerRef.current, {
        x,
        y,
        duration: 0.25,
        ease: "power2.out",
      });
    }
  }, [x, y]);

  const onHoverIn = useCallback(() => {
    if (!containerRef.current) return;
    gsap.to(containerRef.current, {
      y: y - 14,
      duration: 0.2,
      ease: "power2.out",
    });
    gsap.to(containerRef.current.scale, {
      x: 1.08,
      y: 1.08,
      duration: 0.2,
      ease: "power2.out",
    });
  }, [y]);

  const onHoverOut = useCallback(() => {
    if (!containerRef.current) return;
    gsap.to(containerRef.current, { y, duration: 0.2, ease: "power2.out" });
    gsap.to(containerRef.current.scale, {
      x: 1,
      y: 1,
      duration: 0.2,
      ease: "power2.out",
    });
  }, [y]);

  const handleClick = useCallback(() => {
    if (!containerRef.current) return;
    if (flyTo) {
      // Mark the card as flying (onClick sets playingCardId)
      if (onClick) onClick();
      // Animate the actual card to the target, then fire onComplete
      gsap.to(containerRef.current, {
        x: flyTo.x,
        y: flyTo.y,
        duration: 0.3,
        ease: "power2.inOut",
        onComplete: flyTo.onComplete,
      });
      gsap.to(containerRef.current.scale, {
        x: 0.8,
        y: 0.8,
        duration: 0.3,
        ease: "power2.inOut",
      });
    } else if (onClick) {
      onClick();
    }
  }, [flyTo, onClick]);

  return (
    <pixiContainer
      ref={containerRef}
      interactive={interactive}
      cursor={onClick || flyTo ? "pointer" : "default"}
      onPointerDown={handleClick}
      onPointerOver={onHoverIn}
      onPointerOut={onHoverOut}
    >
      <pixiGraphics draw={drawCard} />
      <pixiText text={label} style={textStyle} anchor={0.5} x={0} y={0} />
    </pixiContainer>
  );
}

// ─── Card back (dark with "UNO" text) ───
function CardBack({
  x,
  y,
  width = CARD_W,
  height = CARD_H,
  interactive = false,
  highlight = false,
  onClick,
}: {
  x: number;
  y: number;
  width?: number;
  height?: number;
  interactive?: boolean;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const drawBack = useCallback(
    (g: Graphics) => {
      g.clear();
      // Glow behind card when highlighted
      if (highlight) {
        g.roundRect(
          -width / 2 - 3,
          -height / 2 - 3,
          width + 6,
          height + 6,
          CARD_R + 2,
        );
        g.fill({ color: 0xffd700, alpha: 0.15 });
      }
      // Card body
      g.roundRect(-width / 2, -height / 2, width, height, CARD_R);
      g.fill({ color: 0x1a1a2e });
      // Border
      g.roundRect(-width / 2, -height / 2, width, height, CARD_R);
      g.stroke({
        color: highlight ? 0xffd700 : 0xffffff,
        width: highlight ? 2 : 1,
        alpha: highlight ? 0.8 : 0.15,
      });
      // Inner oval
      g.ellipse(0, 0, width * 0.3, height * 0.2);
      g.fill({ color: 0xe74c3c, alpha: 0.6 });
    },
    [width, height, highlight],
  );

  const textStyle = new TextStyle({
    fontSize: width * 0.2,
    fontWeight: "bold",
    fill: 0xffffff,
    align: "center",
  });

  return (
    <pixiContainer
      x={x}
      y={y}
      interactive={interactive}
      cursor={interactive ? "pointer" : "default"}
      onPointerDown={onClick}
    >
      <pixiGraphics draw={drawBack} />
      <pixiText text="UNO" style={textStyle} anchor={0.5} x={0} y={0} />
    </pixiContainer>
  );
}

// ─── Flying card during dealing/drawing ───
// Supports mid-flight flip: starts face-down, flips to face-up at flipAt (0-1)
function FlyingCard({
  startX,
  startY,
  endX,
  endY,
  delay,
  faceUp,
  color,
  label,
  flipAt,
  flipColor,
  flipLabel,
  onComplete,
}: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
  faceUp: boolean;
  color?: number;
  label?: string;
  flipAt?: number;
  flipColor?: number;
  flipLabel?: string;
  onComplete?: () => void;
}) {
  const containerRef = useRef<Container>(null);
  const [showFace, setShowFace] = useState(faceUp);

  useEffect(() => {
    if (!containerRef.current) return;
    const c = containerRef.current;
    c.x = startX;
    c.y = startY;
    c.alpha = 0;

    const duration = 0.45;

    // Schedule mid-flight 2D flip: scale.x 1→0 (card narrows), swap, 0→1 (card widens)
    if (flipAt !== undefined && flipAt > 0 && flipAt < 1) {
      const flipTime = delay + duration * flipAt;
      const flipDuration = 0.15;

      // Narrow to 0
      gsap.to(c.scale, {
        x: 0,
        duration: flipDuration,
        delay: flipTime,
        ease: "power2.in",
        onComplete: () => {
          setShowFace(true);
          // Widen back to 1
          gsap.to(c.scale, {
            x: 1,
            duration: flipDuration,
            ease: "power2.out",
          });
        },
      });
    }

    gsap.to(c, {
      x: endX,
      y: endY,
      alpha: 1,
      duration,
      delay,
      ease: "power2.out",
      onComplete,
    });
  }, [startX, startY, endX, endY, delay, flipAt, onComplete]);

  const displayColor = showFace ? (flipColor ?? color) : undefined;
  const displayLabel = showFace ? (flipLabel ?? label) : undefined;

  if (showFace && displayColor !== undefined && displayLabel) {
    return (
      <pixiContainer ref={containerRef} alpha={0}>
        <CardSprite x={0} y={0} color={displayColor} label={displayLabel} />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer ref={containerRef} alpha={0}>
      <CardBack x={0} y={0} />
    </pixiContainer>
  );
}

// ─── The scene inside the canvas ───
function GameScene({
  gameState,
  hand,
}: {
  gameState: GameState;
  hand: PlayerHand | null;
}) {
  const { app } = useApplication();
  const w = app?.screen?.width ?? 800;
  const h = app?.screen?.height ?? 600;
  const cx = w / 2;

  const myId = socket.id;
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === myId;
  const handCards = hand?.cards ?? [];
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isDealing, setIsDealing] = useState(true);
  const [playingCardId, setPlayingCardId] = useState<number | null>(null);
  const [dealCards, setDealCards] = useState<
    Array<{
      id: number;
      targetX: number;
      targetY: number;
      delay: number;
      faceUp: boolean;
      color?: number;
      label?: string;
    }>
  >([]);
  const dealStartedRef = useRef(false);

  // Reset hasDrawn when turn changes or hand size changes
  useEffect(() => {
    if (!isMyTurn) setHasDrawn(false);
  }, [isMyTurn]);
  const handSize = handCards.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on handSize
  useEffect(() => {
    setHasDrawn(false);
  }, [handSize]);

  // Center positions
  const cy = h * 0.43;
  const deckX = cx - 42;
  const discardX = cx + 42;

  // Opponents
  const opponents = gameState.players.filter((p) => p.id !== myId);
  const currentPlayerId = gameState.players[gameState.currentPlayerIndex]?.id;

  // Position opponents around the top arc of the table
  const opponentSeats = opponents.map((opp, i) => {
    const count = opponents.length;
    const startAngle = Math.PI * 1.15;
    const endAngle = Math.PI * 1.85;
    const angle =
      count === 1
        ? Math.PI * 1.5
        : startAngle + (i / (count - 1)) * (endAngle - startAngle);
    const rx = w * 0.38;
    const ry = h * 0.3;
    return {
      player: opp,
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    };
  });

  // Fan layout: cards spread from center, slight overlap
  const overlap = Math.min(
    CARD_W - 10,
    (w - 40) / Math.max(handCards.length, 1),
  );
  const totalWidth = handCards.length * overlap;
  const handStartX = cx - totalWidth / 2 + overlap / 2;
  const handY = h - CARD_H / 2 - 16;

  // ─── Flying cards for play/draw animations ───
  const [flyingCards, setFlyingCards] = useState<
    Array<{
      id: number;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      faceUp: boolean;
      color?: number;
      label?: string;
      flipAt?: number;
      flipColor?: number;
      flipLabel?: string;
    }>
  >([]);
  const flyIdRef = useRef(0);

  // Draw animation — when hand grows, animate a card from deck
  const prevHandSizeRef = useRef(handCards.length);
  const [hiddenCardIdx, setHiddenCardIdx] = useState<number | null>(null);
  useEffect(() => {
    const prev = prevHandSizeRef.current;
    prevHandSizeRef.current = handCards.length;

    if (handCards.length > prev && !isDealing) {
      const id = flyIdRef.current++;
      const newCardIdx = handCards.length - 1;
      const targetX = handStartX + newCardIdx * overlap;
      const drawnCard = handCards[newCardIdx];

      // Get face info for the flip
      let flipColor: number | undefined;
      let flipLabel: string | undefined;
      if (drawnCard) {
        const face =
          gameState.activeSide === "light" ? drawnCard.light : drawnCard.dark;
        flipColor = cardColor(face, gameState.activeSide);
        flipLabel = cardLabel(face.value);
      }

      // Hide the real card while the flying card is in transit
      setHiddenCardIdx(newCardIdx);

      setFlyingCards((p) => [
        ...p,
        {
          id,
          startX: deckX,
          startY: cy,
          endX: targetX,
          endY: handY,
          faceUp: false,
          flipAt: 0.75,
          flipColor,
          flipLabel,
        },
      ]);

      // Remove flying card and reveal real card after animation completes
      setTimeout(() => {
        setFlyingCards((p) => p.filter((c) => c.id !== id));
        setHiddenCardIdx(null);
      }, 500);
    }
  }, [
    handCards.length,
    isDealing,
    deckX,
    cy,
    handStartX,
    overlap,
    handY,
    handCards,
    gameState.activeSide,
  ]);

  // ─── Dealing animation ───
  // Build the deal sequence: 7 rounds, each round deals 1 card to each player
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once when scene mounts
  useEffect(() => {
    if (dealStartedRef.current || !hand || handCards.length === 0) return;
    dealStartedRef.current = true;

    const totalPlayers = gameState.players.length;
    const myPlayerIndex = gameState.players.findIndex((p) => p.id === myId);
    const cardsPerPlayer = 7;
    const sequence: typeof dealCards = [];
    let cardIndex = 0;

    for (let round = 0; round < cardsPerPlayer; round++) {
      for (let p = 0; p < totalPlayers; p++) {
        const playerIdx = p;
        const delay = cardIndex * 0.12;

        if (gameState.players[playerIdx]?.id === myId) {
          // My card — fly to hand position, face up
          const card = handCards[round];
          if (card) {
            const face =
              gameState.activeSide === "light" ? card.light : card.dark;
            sequence.push({
              id: cardIndex,
              targetX: handStartX + round * overlap,
              targetY: handY,
              delay,
              faceUp: true,
              color: cardColor(face, gameState.activeSide),
              label: cardLabel(face.value),
            });
          }
        } else {
          // Opponent card — fly to their seat, face down
          const oppIdx = playerIdx > myPlayerIndex ? playerIdx - 1 : playerIdx;
          const seat = opponentSeats[oppIdx < 0 ? 0 : oppIdx];
          if (seat) {
            sequence.push({
              id: cardIndex,
              targetX: seat.x,
              targetY: seat.y,
              delay,
              faceUp: false,
            });
          }
        }
        cardIndex++;
      }
    }

    setDealCards(sequence);

    // End dealing after all cards have animated
    const totalDealTime = (sequence.length * 0.12 + 0.5) * 1000;
    setTimeout(() => setIsDealing(false), totalDealTime);
  }, []);

  const canDraw = isMyTurn && !hasDrawn;

  // During dealing: show table + flying cards only
  if (isDealing) {
    return (
      <pixiContainer>
        <TableFelt />

        {/* Deck stays visible during deal */}
        <CardBack x={deckX} y={cy} />
        <CardBack x={deckX - 1.5} y={cy - 2} />
        <CardBack x={deckX - 3} y={cy - 4} />

        {/* Flying cards */}
        {dealCards.map((dc) => (
          <FlyingCard
            key={dc.id}
            startX={deckX}
            startY={cy}
            endX={dc.targetX}
            endY={dc.targetY}
            delay={dc.delay}
            faceUp={dc.faceUp}
            color={dc.color}
            label={dc.label}
          />
        ))}
      </pixiContainer>
    );
  }

  return (
    <pixiContainer>
      <TableFelt />

      {/* Deck (draw pile) — 3 stacked card backs */}
      <CardBack x={deckX} y={cy} />
      <CardBack x={deckX - 1.5} y={cy - 2} />
      <CardBack
        x={deckX - 3}
        y={cy - 4}
        interactive
        highlight={canDraw}
        onClick={
          canDraw
            ? () => {
                socket.emit("DRAW_CARD");
                setHasDrawn(true);
              }
            : undefined
        }
      />

      {/* Discard pile — top card */}
      {gameState.discardTop && (
        <CardSprite
          x={discardX}
          y={cy}
          color={cardColor(gameState.discardTop, gameState.activeSide)}
          label={cardLabel(gameState.discardTop.value)}
          borderColor={0xffffff}
          borderAlpha={0.4}
        />
      )}

      {/* Opponent seats */}
      {opponentSeats.map(({ player, x: sx, y: sy }) => {
        const isCurrent = player.id === currentPlayerId;
        const count = Math.min(player.cardCount, 10);

        return (
          <pixiContainer key={player.id} x={sx} y={sy}>
            {/* Active player glow */}
            {isCurrent && (
              <pixiGraphics
                draw={(g) => {
                  g.clear();
                  g.circle(0, -10, CARD_H * 0.6);
                  g.fill({ color: 0xffd700, alpha: 0.1 });
                }}
              />
            )}
            {/* Name label (above cards) */}
            <pixiText
              text={player.name}
              style={
                new TextStyle({
                  fontSize: 12,
                  fontWeight: isCurrent ? "bold" : "normal",
                  fill: isCurrent ? 0xffd700 : 0xcccccc,
                  align: "center",
                })
              }
              anchor={0.5}
              x={0}
              y={-CARD_H / 2 - 14}
            />
            {/* Card count badge */}
            <pixiGraphics
              draw={(g) => {
                g.clear();
                g.roundRect(-12, -CARD_H / 2 - 32, 24, 16, 8);
                g.fill({ color: 0x000000, alpha: 0.5 });
              }}
            />
            <pixiText
              text={String(player.cardCount)}
              style={
                new TextStyle({
                  fontSize: 10,
                  fontWeight: "bold",
                  fill: 0xffffff,
                  align: "center",
                })
              }
              anchor={0.5}
              x={0}
              y={-CARD_H / 2 - 24}
            />
            {/* Fanned card backs — rotated arc like a real hand */}
            {Array.from({ length: count }).map((_, j) => {
              const mid = (count - 1) / 2;
              const spread = Math.min(count * 4, 30); // degrees total spread
              const angleDeg =
                count <= 1 ? 0 : (j - mid) * (spread / (count - 1));
              const angleRad = (angleDeg * Math.PI) / 180;
              // Cards pivot from bottom center — offset x/y based on angle
              const fanRadius = CARD_H * 0.7;
              const fx = Math.sin(angleRad) * fanRadius;
              const fy = -Math.cos(angleRad) * fanRadius + fanRadius;
              return (
                <pixiContainer
                  // biome-ignore lint: index key fine for static display
                  key={j}
                  x={fx}
                  y={fy}
                  rotation={angleRad}
                >
                  <CardBack x={0} y={0} />
                </pixiContainer>
              );
            })}
          </pixiContainer>
        );
      })}

      {/* Player's hand */}
      {handCards.map((card, i) => {
        // Hide the card that's being animated by the draw FlyingCard
        if (hiddenCardIdx === i) return null;

        const face = gameState.activeSide === "light" ? card.light : card.dark;
        const playable =
          isMyTurn && playingCardId === null && canPlayCard(card, gameState);
        const isFlying = playingCardId === card.id;

        return (
          <CardSprite
            key={card.id}
            x={isFlying ? discardX : handStartX + i * overlap}
            y={isFlying ? cy : playable ? handY - 6 : handY}
            color={cardColor(face, gameState.activeSide)}
            label={cardLabel(face.value)}
            borderColor={playable ? 0xffd700 : 0xffffff}
            borderAlpha={playable ? 0.8 : 0.2}
            interactive={!isFlying}
            flyTo={
              playable
                ? {
                    x: discardX,
                    y: cy,
                    onComplete: () => {
                      socket.emit("PLAY_CARD", { cardId: card.id });
                      setPlayingCardId(null);
                    },
                  }
                : undefined
            }
            onClick={playable ? () => setPlayingCardId(card.id) : undefined}
          />
        );
      })}

      {/* Flying cards (play/draw animations) */}
      {flyingCards.map((fc) => (
        <FlyingCard
          key={fc.id}
          startX={fc.startX}
          startY={fc.startY}
          endX={fc.endX}
          endY={fc.endY}
          delay={0}
          faceUp={fc.faceUp}
          color={fc.color}
          label={fc.label}
          flipAt={fc.flipAt}
          flipColor={fc.flipColor}
          flipLabel={fc.flipLabel}
        />
      ))}
    </pixiContainer>
  );
}

// ─── Overlay styles ───
const overlayBase: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.85)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
  fontFamily: "system-ui",
};

const btnStyle = (bg: string): React.CSSProperties => ({
  padding: "12px 24px",
  fontSize: 16,
  fontWeight: "bold",
  borderRadius: 8,
  border: "none",
  backgroundColor: bg,
  color: "white",
  cursor: "pointer",
});

// ─── Main export ───
export function PixiGameScreen({
  gameState,
  hand,
}: {
  gameState: GameState;
  hand: PlayerHand | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showFlip, setShowFlip] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const myId = socket.id;
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === myId;
  const handCards = hand?.cards ?? [];

  // FLIP overlay
  useEffect(() => {
    const onFlip = () => {
      setShowFlip(true);
      setTimeout(() => setShowFlip(false), 1500);
    };
    socket.on("FLIP_EVENT", onFlip);
    return () => {
      socket.off("FLIP_EVENT", onFlip);
    };
  }, []);

  // Reset hasDrawn
  useEffect(() => {
    if (!isMyTurn) setHasDrawn(false);
  }, [isMyTurn]);
  const handSize = handCards.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on handSize
  useEffect(() => {
    setHasDrawn(false);
  }, [handSize]);

  const colorMap =
    gameState.activeSide === "light"
      ? { red: "#FF5555", yellow: "#FFAA00", green: "#55AA55", blue: "#5555FF" }
      : {
          pink: "#FF69B4",
          teal: "#008080",
          orange: "#FF8C00",
          purple: "#8B008B",
        };
  const colorNames = Object.keys(colorMap) as (LightColor | DarkColor)[];

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100svh",
        background:
          "radial-gradient(ellipse at 50% 40%, #1a3a2a 0%, #0f1f18 60%, #080e0b 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* PixiJS Canvas */}
      <Application
        resizeTo={containerRef}
        background={0x0a1a10}
        backgroundAlpha={0}
        antialias
      >
        <GameScene gameState={gameState} hand={hand} />
      </Application>

      {/* ─── Turn indicator ─── */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "4px 14px",
          borderRadius: 6,
          backgroundColor: "rgba(0,0,0,0.5)",
          color: isMyTurn ? "#FFD700" : "rgba(255,255,255,0.6)",
          fontWeight: isMyTurn ? "bold" : "normal",
          fontSize: 13,
          fontFamily: "system-ui",
        }}
      >
        {isMyTurn
          ? "Your turn!"
          : `${gameState.players[gameState.currentPlayerIndex]?.name ?? "..."}'s turn`}
      </div>

      {/* ─── Side indicator ─── */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          padding: "3px 10px",
          borderRadius: 4,
          backgroundColor: "rgba(0,0,0,0.4)",
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
          fontFamily: "system-ui",
        }}
      >
        {gameState.activeSide.toUpperCase()} •{" "}
        {gameState.direction === "clockwise" ? "→" : "←"}
      </div>

      {/* ─── Pass + UNO buttons ─── */}
      <div
        style={{
          position: "absolute",
          bottom: CARD_H + 28,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 10,
          fontFamily: "system-ui",
        }}
      >
        {isMyTurn && hasDrawn && (
          <button
            type="button"
            onClick={() => {
              socket.emit("PASS_TURN");
              setHasDrawn(false);
            }}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: "bold",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.3)",
              backgroundColor: "rgba(0,0,0,0.5)",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
            }}
          >
            Pass
          </button>
        )}
        {hand &&
          hand.cards.length <= 2 &&
          isMyTurn &&
          handCards.some((c) => canPlayCard(c, gameState)) && (
            <button
              type="button"
              onClick={() => socket.emit("CALL_UNO")}
              style={{
                padding: "6px 20px",
                fontSize: 16,
                fontWeight: "bold",
                borderRadius: 8,
                border: "none",
                backgroundColor: "#e74c3c",
                color: "white",
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(231,76,60,0.5)",
              }}
            >
              UNO!
            </button>
          )}
      </div>

      {/* ─── FLIP overlay ─── */}
      {showFlip && (
        <div
          style={{
            ...overlayBase,
            backgroundColor: "rgba(0,0,0,0.9)",
            pointerEvents: "none",
            zIndex: 200,
          }}
        >
          <span
            style={{
              fontSize: 80,
              fontWeight: 900,
              color: "#FFD700",
              textShadow: "0 0 40px rgba(255,215,0,0.6)",
              letterSpacing: 8,
              fontFamily: "system-ui",
            }}
          >
            FLIP!
          </span>
        </div>
      )}

      {/* ─── Challenge overlay ─── */}
      {gameState.phase === "awaiting_challenge" &&
        gameState.challengeTarget === myId && (
          <div style={{ ...overlayBase, gap: 16 }}>
            <p style={{ color: "white", fontSize: 20, margin: 0 }}>
              You've been hit with a Wild Draw!
            </p>
            <p style={{ color: "#aaa", fontSize: 14, margin: 0 }}>
              Accept the penalty or challenge
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => socket.emit("ACCEPT_DRAW")}
                style={btnStyle("#e74c3c")}
              >
                Accept Draw
              </button>
              <button
                type="button"
                onClick={() => socket.emit("CHALLENGE_DRAW")}
                style={btnStyle("#f39c12")}
              >
                Challenge!
              </button>
            </div>
          </div>
        )}

      {/* ─── Color picker ─── */}
      {gameState.phase === "choosing_color" && isMyTurn && (
        <div style={overlayBase}>
          <p style={{ color: "white", fontSize: 22, marginBottom: 20 }}>
            Pick a color
          </p>
          <div style={{ display: "flex", gap: 14 }}>
            {colorNames.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => socket.emit("SELECT_COLOR", { color: c })}
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 14,
                  backgroundColor: colorMap[c as keyof typeof colorMap],
                  border: "3px solid white",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "white",
                  fontWeight: "bold",
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
