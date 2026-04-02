import type {
  ActiveSide,
  Card,
  CardSide,
  DarkColor,
  GameState,
  LightColor,
  PlayerHand,
  PublicPlayer,
} from "@uno-flip/shared";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CardBack } from "../components/UnoCard.js";
import { socket } from "../socket.js";
import { DARK_COLORS, LIGHT_COLORS } from "../styles.js";
import "./game.css";

// ─── Helpers ───
function getCardColor(face: CardSide, activeSide: ActiveSide): string {
  const colorMap = activeSide === "light" ? LIGHT_COLORS : DARK_COLORS;
  return colorMap[face.color] ?? "#333";
}

function formatValue(value: CardSide["value"]): string {
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

function getFanStyle(index: number, total: number) {
  const mid = (total - 1) / 2;
  const maxAngle = Math.min(total * 2.5, 20);
  const angle = total <= 1 ? 0 : (index - mid) * (maxAngle / (total - 1));
  const lift = Math.abs(index - mid) * 3;
  return { rotate: angle, translateY: lift };
}

// ─── Opponent slot — shows name + face-down cards ───
function OpponentSlot({
  player,
  isCurrent,
  canCatch,
  onCatch,
}: {
  player: PublicPlayer;
  isCurrent: boolean;
  canCatch: boolean;
  onCatch: () => void;
}) {
  return (
    <motion.div
      className="opponent-slot"
      animate={{
        scale: isCurrent ? 1.05 : 1,
      }}
      transition={{ type: "spring", bounce: 0.3 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          className={`opponent-name ${isCurrent ? "is-current" : ""}`}
          style={{ opacity: player.connected ? 1 : 0.35 }}
        >
          {player.name}
        </span>
        <AnimatePresence>
          {player.isUno && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", bounce: 0.6 }}
              style={{
                color: "#e74c3c",
                fontWeight: "bold",
                fontSize: 11,
              }}
            >
              UNO
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {canCatch && (
            <motion.button
              type="button"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", bounce: 0.5 }}
              whileTap={{ scale: 0.85 }}
              onClick={onCatch}
              style={{
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: "bold",
                borderRadius: 4,
                border: "none",
                backgroundColor: "#e67e22",
                color: "white",
                cursor: "pointer",
              }}
            >
              Catch!
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <CardBack count={player.cardCount} />
    </motion.div>
  );
}

// ─── Discard pile ───
function DiscardPile({
  discardTop,
  activeSide,
  chosenColor,
}: {
  discardTop: CardSide | null;
  activeSide: ActiveSide;
  chosenColor: string | null;
}) {
  if (!discardTop) return null;
  const bg = getCardColor(discardTop, activeSide);
  const cardKey = `${discardTop.color}-${discardTop.value}`;

  return (
    <div style={{ textAlign: "center" }}>
      <p
        style={{
          color: "rgba(255,255,255,0.5)",
          fontSize: 11,
          margin: "0 0 4px",
        }}
      >
        Discard
      </p>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={cardKey}
          initial={{ y: 80, scale: 0.5, rotate: -12, opacity: 0 }}
          animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          style={{
            width: 62,
            height: 90,
            backgroundColor: bg,
            borderRadius: 7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: "bold",
            fontSize: 20,
            border: "2px solid rgba(255,255,255,0.3)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          {formatValue(discardTop.value)}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {chosenColor && (
          <motion.div
            key={chosenColor}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              marginTop: 6,
              padding: "2px 10px",
              borderRadius: 4,
              backgroundColor:
                LIGHT_COLORS[chosenColor] ?? DARK_COLORS[chosenColor] ?? "#333",
              fontSize: 11,
              color: "white",
              fontWeight: "bold",
            }}
          >
            {chosenColor}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Draw pile (stacked deck) ───
function DrawPile({
  count,
  isMyTurn,
  hasDrawn,
  onDraw,
}: {
  count: number;
  isMyTurn: boolean;
  hasDrawn: boolean;
  onDraw: () => void;
}) {
  const canDraw = isMyTurn && !hasDrawn;
  return (
    <div style={{ textAlign: "center" }}>
      <p
        style={{
          color: "rgba(255,255,255,0.5)",
          fontSize: 11,
          margin: "0 0 4px",
        }}
      >
        Draw
      </p>
      <motion.button
        type="button"
        whileHover={canDraw ? { scale: 1.06, y: -3 } : undefined}
        whileTap={canDraw ? { scale: 0.94 } : undefined}
        onClick={() => canDraw && onDraw()}
        className="deck-stack"
        style={{
          border: "none",
          background: "none",
          padding: 0,
          cursor: canDraw ? "pointer" : "default",
          opacity: isMyTurn ? 1 : 0.6,
        }}
      >
        {/* Stacked cards to give depth */}
        <div className="deck-stack-card" style={{ top: 0, left: 0 }} />
        <div className="deck-stack-card" style={{ top: -2, left: 1 }} />
        <div
          className="deck-stack-card"
          style={{
            top: -4,
            left: 2,
            border: canDraw
              ? "2px solid #FFD700"
              : "2px solid rgba(255,255,255,0.15)",
            boxShadow: canDraw
              ? "0 0 12px rgba(255,215,0,0.3)"
              : "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.4)",
              fontWeight: "bold",
              fontSize: 14,
            }}
          >
            {count}
          </span>
        </div>
      </motion.button>
    </div>
  );
}

// ─── Color picker modal ───
function ColorPicker({
  activeSide,
  onSelect,
}: {
  activeSide: ActiveSide;
  onSelect: (color: string) => void;
}) {
  const colors =
    activeSide === "light"
      ? (["red", "yellow", "green", "blue"] as LightColor[])
      : (["pink", "teal", "orange", "purple"] as DarkColor[]);
  const colorMap = activeSide === "light" ? LIGHT_COLORS : DARK_COLORS;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <motion.p
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        style={{ color: "white", fontSize: 22, marginBottom: 20 }}
      >
        Pick a color
      </motion.p>
      <div style={{ display: "flex", gap: 14 }}>
        {colors.map((c, i) => (
          <motion.button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              type: "spring",
              bounce: 0.5,
              delay: 0.15 + i * 0.08,
            }}
            whileHover={{ scale: 1.15, y: -6 }}
            whileTap={{ scale: 0.85 }}
            style={{
              width: 62,
              height: 62,
              borderRadius: 14,
              backgroundColor: colorMap[c],
              border: "3px solid white",
              boxShadow: `0 4px 20px ${colorMap[c]}66`,
              cursor: "pointer",
              fontSize: 12,
              color: "white",
              fontWeight: "bold",
            }}
          >
            {c}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Hand card (fan position + hover/tap) ───
function HandCard({
  card,
  activeSide,
  playable,
  onClick,
  index,
  total,
  isInitialDeal,
  deckRef,
}: {
  card: Card;
  activeSide: ActiveSide;
  playable: boolean;
  onClick: () => void;
  index: number;
  total: number;
  isInitialDeal: boolean;
  deckRef: React.RefObject<HTMLDivElement | null>;
}) {
  const face = activeSide === "light" ? card.light : card.dark;
  const bg = getCardColor(face, activeSide);
  const fan = getFanStyle(index, total);

  // Calculate initial position relative to deck for dealing animation
  const getDealOrigin = () => {
    if (!isInitialDeal || !deckRef.current) {
      return { y: 30, x: 60, scale: 0.5, rotate: 0, opacity: 0 };
    }
    // Cards come from the deck position (center of screen, above the hand)
    return { y: -200, x: 0, scale: 0.4, rotate: -20, opacity: 0 };
  };

  return (
    <motion.div
      layout
      initial={getDealOrigin()}
      animate={{
        y: fan.translateY,
        x: 0,
        opacity: 1,
        scale: 1,
        rotate: fan.rotate,
      }}
      exit={{
        y: -160,
        opacity: 0,
        scale: 0.5,
        rotate: 0,
      }}
      transition={{
        type: "spring",
        stiffness: 280,
        damping: 26,
        delay: isInitialDeal ? index * 0.12 : 0,
      }}
      style={{
        marginLeft: index === 0 ? 0 : -10,
        transformOrigin: "bottom center",
        zIndex: index,
      }}
    >
      <motion.button
        type="button"
        onClick={onClick}
        whileHover={playable ? { y: -16, scale: 1.1 } : undefined}
        whileTap={playable ? { scale: 0.9 } : undefined}
        style={{
          width: 56,
          height: 84,
          backgroundColor: bg,
          borderRadius: 7,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: "bold",
          fontSize: 15,
          border: playable
            ? "2.5px solid #FFD700"
            : "2px solid rgba(255,255,255,0.2)",
          boxShadow: playable
            ? "0 4px 15px rgba(255,215,0,0.3)"
            : "0 2px 8px rgba(0,0,0,0.4)",
          cursor: playable ? "pointer" : "default",
          opacity: playable ? 1 : 0.55,
          padding: 0,
        }}
      >
        {formatValue(face.value)}
      </motion.button>
    </motion.div>
  );
}

// ─── Main game screen ───
export function GameScreen({
  gameState,
  hand,
}: {
  gameState: GameState;
  hand: PlayerHand | null;
}) {
  const [hasDrawn, setHasDrawn] = useState(false);
  const [showFlip, setShowFlip] = useState(false);
  const hasDealtRef = useRef(false);
  const deckRef = useRef<HTMLDivElement>(null);

  const myId = socket.id;
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === myId;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const opponents = gameState.players.filter((p) => p.id !== myId);

  // Track initial deal
  useEffect(() => {
    if (hand && hand.cards.length > 0 && !hasDealtRef.current) {
      const t = setTimeout(() => {
        hasDealtRef.current = true;
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [hand]);

  useEffect(() => {
    if (!isMyTurn) setHasDrawn(false);
  }, [isMyTurn]);

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

  // Background theme shift
  useEffect(() => {
    document.body.style.backgroundColor =
      gameState.activeSide === "dark" ? "#071a0e" : "transparent";
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [gameState.activeSide]);

  const canPlay = (card: Card): boolean => {
    if (!isMyTurn || !gameState.discardTop) return false;
    const face = gameState.activeSide === "light" ? card.light : card.dark;
    if (face.color === "wild") return true;
    const activeColor = gameState.chosenColor ?? gameState.discardTop.color;
    if (face.color === activeColor) return true;
    if (face.value === gameState.discardTop.value) return true;
    return false;
  };

  const handCards = hand?.cards ?? [];

  // Reset hasDrawn when a card is played (hand size changes)
  // Needed for skip_everyone where isMyTurn stays true
  const handSize = handCards.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run on handSize change
  useEffect(() => {
    setHasDrawn(false);
  }, [handSize]);

  return (
    <div className="game-table">
      {/* ─── Overlays ─── */}
      <AnimatePresence>
        {showFlip && (
          <motion.div
            key="flip-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 200,
              pointerEvents: "none",
            }}
          >
            <motion.span
              initial={{ scale: 0.2, rotateY: -180, opacity: 0 }}
              animate={{ scale: 1, rotateY: 0, opacity: 1 }}
              exit={{ scale: 3, opacity: 0 }}
              transition={{ type: "spring", bounce: 0.4, duration: 1 }}
              style={{
                fontSize: 80,
                fontWeight: 900,
                color: "#FFD700",
                textShadow:
                  "0 0 40px rgba(255,215,0,0.6), 0 0 80px rgba(255,215,0,0.3)",
                letterSpacing: 8,
              }}
            >
              FLIP!
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {gameState.phase === "awaiting_challenge" &&
          gameState.challengeTarget === myId && (
            <motion.div
              key="challenge"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.85)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
                gap: 16,
              }}
            >
              <p style={{ color: "white", fontSize: 20 }}>
                You've been hit with a Wild Draw!
              </p>
              <p style={{ color: "#aaa", fontSize: 14 }}>
                Accept the penalty or challenge
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => socket.emit("ACCEPT_DRAW")}
                  style={{
                    padding: "12px 24px",
                    fontSize: 16,
                    fontWeight: "bold",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "#e74c3c",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Accept Draw
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => socket.emit("CHALLENGE_DRAW")}
                  style={{
                    padding: "12px 24px",
                    fontSize: 16,
                    fontWeight: "bold",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "#f39c12",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Challenge!
                </motion.button>
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      <AnimatePresence>
        {gameState.phase === "choosing_color" && isMyTurn && (
          <ColorPicker
            key="color-picker"
            activeSide={gameState.activeSide}
            onSelect={(color) => {
              socket.emit("SELECT_COLOR", {
                color: color as LightColor | DarkColor,
              });
            }}
          />
        )}
      </AnimatePresence>

      {/* ─── Opponents (top) ─── */}
      <div className="opponents-zone">
        {opponents.map((p) => (
          <OpponentSlot
            key={p.id}
            player={p}
            isCurrent={currentPlayer?.id === p.id}
            canCatch={p.cardCount === 1 && !p.isUno}
            onCatch={() => socket.emit("CATCH_UNO", { targetPlayerId: p.id })}
          />
        ))}
      </div>

      {/* ─── Center (deck + discard) ─── */}
      <div className="center-zone" ref={deckRef}>
        <DrawPile
          count={gameState.drawPileCount}
          isMyTurn={isMyTurn}
          hasDrawn={hasDrawn}
          onDraw={() => {
            socket.emit("DRAW_CARD");
            setHasDrawn(true);
          }}
        />
        <DiscardPile
          discardTop={gameState.discardTop}
          activeSide={gameState.activeSide}
          chosenColor={gameState.chosenColor}
        />
      </div>

      {/* ─── Info (turn + buttons) ─── */}
      <div className="info-zone">
        {/* Side indicator */}
        <div
          style={{
            padding: "3px 10px",
            borderRadius: 4,
            backgroundColor: "rgba(0,0,0,0.3)",
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {gameState.activeSide.toUpperCase()} SIDE •{" "}
          {gameState.direction === "clockwise" ? "→" : "←"}
        </div>

        {/* Turn indicator */}
        <AnimatePresence mode="wait">
          <motion.p
            key={isMyTurn ? "your-turn" : currentPlayer?.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            style={{
              color: isMyTurn ? "#FFD700" : "rgba(255,255,255,0.6)",
              fontWeight: isMyTurn ? "bold" : "normal",
              fontSize: 15,
              margin: 0,
            }}
          >
            {isMyTurn ? "Your turn!" : `${currentPlayer?.name ?? "..."}'s turn`}
          </motion.p>
        </AnimatePresence>

        {/* Pass + UNO buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <AnimatePresence>
            {isMyTurn && hasDrawn && (
              <motion.button
                key="pass"
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                whileTap={{ scale: 0.94 }}
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
                  backgroundColor: "rgba(0,0,0,0.3)",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                }}
              >
                Pass
              </motion.button>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {hand &&
              hand.cards.length <= 2 &&
              isMyTurn &&
              handCards.some((c) => canPlay(c)) && (
                <motion.button
                  key="uno"
                  type="button"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", bounce: 0.5 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.85 }}
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
                </motion.button>
              )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Your hand (bottom) ─── */}
      <div className="hand-zone">
        <AnimatePresence>
          {handCards.map((card, index) => (
            <HandCard
              key={card.id}
              card={card}
              activeSide={gameState.activeSide}
              playable={canPlay(card)}
              index={index}
              total={handCards.length}
              isInitialDeal={!hasDealtRef.current}
              deckRef={deckRef}
              onClick={() => {
                if (isMyTurn && canPlay(card)) {
                  socket.emit("PLAY_CARD", { cardId: card.id });
                }
              }}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
