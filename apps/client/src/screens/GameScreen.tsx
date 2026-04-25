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
import { socket } from "../socket.js";
import { DARK_COLORS, LIGHT_COLORS } from "../styles.js";

// ─── Get background color for a card face ───
function getCardColor(face: CardSide, activeSide: ActiveSide): string {
  const colorMap = activeSide === "light" ? LIGHT_COLORS : DARK_COLORS;
  return colorMap[face.color] ?? "#333";
}

// ─── Format card value for display ───
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

// ─── Calculate fan layout for a hand of cards ───
function getFanStyle(index: number, total: number) {
  const mid = (total - 1) / 2;
  const maxAngle = Math.min(total * 2.5, 18); // wider fan for more cards, cap at 18°
  const angle = (index - mid) * (maxAngle / Math.max(total - 1, 1));
  const lift = Math.abs(index - mid) * 4; // cards at edges dip down
  return {
    rotate: angle,
    translateY: lift,
    marginLeft: index === 0 ? 0 : -12, // overlap cards
  };
}

// ─── Single card component ───
function CardView({
  card,
  activeSide,
  playable,
  onClick,
  index,
  total,
  isInitialDeal,
}: {
  card: Card;
  activeSide: ActiveSide;
  playable: boolean;
  onClick: () => void;
  index: number;
  total: number;
  isInitialDeal: boolean;
}) {
  const face = activeSide === "light" ? card.light : card.dark;
  const bg = getCardColor(face, activeSide);
  const fan = getFanStyle(index, total);

  return (
    <motion.div
      layout
      // Deal: fly from deck area (above). Draw mid-game: slide from right.
      initial={{
        y: isInitialDeal ? -200 : 30,
        x: isInitialDeal ? 0 : 80,
        opacity: 0,
        scale: 0.5,
        rotate: 0,
      }}
      animate={{
        y: fan.translateY,
        x: 0,
        opacity: 1,
        scale: 1,
        rotate: fan.rotate,
      }}
      // Play: fly up toward discard pile
      exit={{
        y: -180,
        opacity: 0,
        scale: 0.6,
        rotate: 0,
      }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 24,
        delay: isInitialDeal ? index * 0.1 : 0,
      }}
      style={{
        marginLeft: fan.marginLeft,
        transformOrigin: "bottom center",
        zIndex: index,
      }}
    >
      <motion.button
        type="button"
        onClick={onClick}
        whileHover={playable ? { y: -14, scale: 1.08 } : undefined}
        whileTap={playable ? { scale: 0.92 } : undefined}
        style={{
          width: 60,
          height: 90,
          backgroundColor: bg,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: "bold",
          fontSize: 16,
          border: playable
            ? "3px solid #FFD700"
            : "2px solid rgba(255,255,255,0.2)",
          boxShadow: playable
            ? "0 4px 15px rgba(255,215,0,0.3)"
            : "0 2px 8px rgba(0,0,0,0.3)",
          flexShrink: 0,
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

// ─── Discard pile display ───
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
      <p style={{ color: "#888", fontSize: 12, margin: "0 0 4px" }}>Discard</p>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={cardKey}
          // Card lands on pile from below (played from hand)
          initial={{ y: 80, scale: 0.5, rotate: -12, opacity: 0 }}
          animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          style={{
            width: 70,
            height: 100,
            backgroundColor: bg,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: "bold",
            fontSize: 20,
            border: "2px solid rgba(255,255,255,0.3)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            margin: "0 auto",
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

// ─── Opponent badge ───
function OpponentBadge({
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
      animate={{
        borderColor: isCurrent ? "#FFD700" : "transparent",
        scale: isCurrent ? 1.06 : 1,
        boxShadow: isCurrent
          ? "0 0 12px rgba(255,215,0,0.3)"
          : "0 0 0px rgba(0,0,0,0)",
      }}
      transition={{ type: "spring", bounce: 0.3 }}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        backgroundColor: "#16213e",
        border: "2px solid transparent",
        fontSize: 13,
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span style={{ opacity: player.connected ? 1 : 0.35 }}>
        {player.name}
      </span>
      <motion.span
        key={player.cardCount}
        initial={{ scale: 1.5, color: "#FFD700" }}
        animate={{ scale: 1, color: "#eee" }}
        transition={{ type: "spring", bounce: 0.5 }}
        style={{
          backgroundColor: "#333",
          padding: "2px 6px",
          borderRadius: 4,
          fontSize: 11,
        }}
      >
        {player.cardCount}
      </motion.span>
      <AnimatePresence>
        {player.isUno && (
          <motion.span
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", bounce: 0.6 }}
            style={{ color: "#e74c3c", fontWeight: "bold", fontSize: 11 }}
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
              fontSize: 11,
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

  const myId = socket.id;
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === myId;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const opponents = gameState.players.filter((p) => p.id !== myId);

  // Track whether initial deal stagger has played
  useEffect(() => {
    if (hand && hand.cards.length > 0 && !hasDealtRef.current) {
      const t = setTimeout(() => {
        hasDealtRef.current = true;
      }, 900);
      return () => clearTimeout(t);
    }
  }, [hand]);

  // Reset hasDrawn when turn changes
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
      gameState.activeSide === "dark" ? "#120a1e" : "#1a1a2e";
    return () => {
      document.body.style.backgroundColor = "#1a1a2e";
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

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui",
        maxWidth: 500,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* FLIP overlay */}
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

      {/* Challenge overlay */}
      <AnimatePresence>
        {gameState.phase === "awaiting_challenge" &&
          gameState.challengeTarget === myId && (
            <motion.div
              key="challenge-overlay"
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
              <motion.p
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                style={{ color: "white", fontSize: 20 }}
              >
                You've been hit with a Wild Draw!
              </motion.p>
              <p style={{ color: "#aaa", fontSize: 14 }}>
                Accept the penalty or challenge (if you think it was played
                illegally)
              </p>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15 }}
                style={{ display: "flex", gap: 12 }}
              >
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
              </motion.div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Color picker overlay */}
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

      {/* Side indicator */}
      <motion.div
        key={gameState.activeSide}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          textAlign: "center",
          padding: "4px 12px",
          borderRadius: 4,
          backgroundColor:
            gameState.activeSide === "light" ? "#444" : "#1a1a1a",
          fontSize: 12,
          color: "#aaa",
          marginBottom: 12,
          alignSelf: "center",
        }}
      >
        {gameState.activeSide.toUpperCase()} SIDE •{" "}
        {gameState.direction === "clockwise" ? "→" : "←"}
      </motion.div>

      {/* Opponents */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        {opponents.map((p) => (
          <OpponentBadge
            key={p.id}
            player={p}
            isCurrent={currentPlayer?.id === p.id}
            canCatch={p.cardCount === 1 && !p.isUno}
            onCatch={() => socket.emit("CATCH_UNO", { targetPlayerId: p.id })}
          />
        ))}
      </div>

      {/* Center area: discard + draw pile */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 24,
          alignItems: "center",
          marginBottom: 16,
          flexGrow: 1,
        }}
      >
        <DiscardPile
          discardTop={gameState.discardTop}
          activeSide={gameState.activeSide}
          chosenColor={gameState.chosenColor}
        />

        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#888", fontSize: 12, margin: "0 0 4px" }}>Draw</p>
          <motion.button
            type="button"
            whileHover={
              isMyTurn && !hasDrawn ? { scale: 1.08, y: -4 } : undefined
            }
            whileTap={isMyTurn && !hasDrawn ? { scale: 0.94 } : undefined}
            onClick={() => {
              if (isMyTurn && !hasDrawn) {
                socket.emit("DRAW_CARD");
                setHasDrawn(true);
              }
            }}
            style={{
              width: 70,
              height: 100,
              backgroundColor: "#2c3e50",
              borderRadius: 8,
              border: isMyTurn
                ? "3px solid #FFD700"
                : "2px solid rgba(255,255,255,0.2)",
              boxShadow: isMyTurn
                ? "0 0 12px rgba(255,215,0,0.2)"
                : "0 2px 8px rgba(0,0,0,0.3)",
              color: "#888",
              fontWeight: "bold",
              fontSize: 14,
              cursor: isMyTurn ? "pointer" : "default",
              opacity: isMyTurn ? 1 : 0.5,
            }}
          >
            {gameState.drawPileCardIds.length}
          </motion.button>
        </div>
      </div>

      {/* Turn indicator */}
      <AnimatePresence mode="wait">
        <motion.p
          key={isMyTurn ? "your-turn" : currentPlayer?.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          style={{
            textAlign: "center",
            color: isMyTurn ? "#FFD700" : "#888",
            fontWeight: isMyTurn ? "bold" : "normal",
            fontSize: 16,
            marginBottom: 12,
          }}
        >
          {isMyTurn ? "Your turn!" : `${currentPlayer?.name ?? "..."}'s turn`}
        </motion.p>
      </AnimatePresence>

      {/* Pass button */}
      <AnimatePresence>
        {isMyTurn && hasDrawn && (
          <motion.button
            key="pass-btn"
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              socket.emit("PASS_TURN");
              setHasDrawn(false);
            }}
            style={{
              padding: "8px 24px",
              fontSize: 14,
              fontWeight: "bold",
              borderRadius: 8,
              border: "1px solid #666",
              backgroundColor: "transparent",
              color: "#aaa",
              cursor: "pointer",
              alignSelf: "center",
              marginBottom: 12,
            }}
          >
            Pass (don't play drawn card)
          </motion.button>
        )}
      </AnimatePresence>

      {/* UNO button */}
      <AnimatePresence>
        {hand && hand.cards.length <= 2 && isMyTurn && (
          <motion.button
            key="uno-btn"
            type="button"
            initial={{ scale: 0, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.5 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => socket.emit("CALL_UNO")}
            style={{
              padding: "10px 28px",
              fontSize: 18,
              fontWeight: "bold",
              borderRadius: 10,
              border: "none",
              backgroundColor: "#e74c3c",
              color: "white",
              cursor: "pointer",
              alignSelf: "center",
              marginBottom: 12,
              boxShadow: "0 4px 20px rgba(231,76,60,0.4)",
            }}
          >
            UNO!
          </motion.button>
        )}
      </AnimatePresence>

      {/* Your hand — fan layout */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          padding: "12px 0 20px",
          minHeight: 110,
          overflowX: handCards.length > 10 ? "auto" : "visible",
        }}
      >
        <AnimatePresence>
          {handCards.map((card, index) => (
            <CardView
              key={card.id}
              card={card}
              activeSide={gameState.activeSide}
              playable={canPlay(card)}
              index={index}
              total={handCards.length}
              isInitialDeal={!hasDealtRef.current}
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
