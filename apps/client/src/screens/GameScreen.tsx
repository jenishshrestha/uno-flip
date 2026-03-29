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
import { useEffect, useState } from "react";
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

// ─── Single card component ───
function CardView({
  card,
  activeSide,
  playable,
  onClick,
}: {
  card: Card;
  activeSide: ActiveSide;
  playable: boolean;
  onClick: () => void;
}) {
  const face = activeSide === "light" ? card.light : card.dark;
  const bg = getCardColor(face, activeSide);

  return (
    <button
      type="button"
      onClick={onClick}
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
        flexShrink: 0,
        cursor: playable ? "pointer" : "default",
        opacity: playable ? 1 : 0.5,
        transition: "transform 0.15s, border-color 0.15s",
        transform: playable ? "translateY(-4px)" : "none",
        padding: 0,
      }}
    >
      {formatValue(face.value)}
    </button>
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

  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ color: "#888", fontSize: 12, margin: "0 0 4px" }}>Discard</p>
      <div
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
          margin: "0 auto",
        }}
      >
        {formatValue(discardTop.value)}
      </div>
      {chosenColor && (
        <div
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
        </div>
      )}
    </div>
  );
}

// ─── Color picker modal (after playing a wild) ───
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <p style={{ color: "white", fontSize: 20, marginBottom: 16 }}>
        Pick a color
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            style={{
              width: 60,
              height: 60,
              borderRadius: 12,
              backgroundColor: colorMap[c],
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

  const myId = socket.id;
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === myId;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const opponents = gameState.players.filter((p) => p.id !== myId);

  // Reset hasDrawn when turn changes
  useEffect(() => {
    if (!isMyTurn) setHasDrawn(false);
  }, [isMyTurn]);

  // Check if a card can be played (basic check — server validates too)
  const canPlay = (card: Card): boolean => {
    if (!isMyTurn || !gameState.discardTop) return false;
    const face = gameState.activeSide === "light" ? card.light : card.dark;
    if (face.color === "wild") return true;
    // If a wild was played, match against the chosen color
    const activeColor = gameState.chosenColor ?? gameState.discardTop.color;
    if (face.color === activeColor) return true;
    if (face.value === gameState.discardTop.value) return true;
    return false;
  };

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
      {/* Challenge overlay — shown to the player who must draw */}
      {gameState.phase === "awaiting_challenge" &&
        gameState.challengeTarget === myId && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.8)",
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
              Accept the penalty or challenge (if you think it was played
              illegally)
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
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
              </button>
              <button
                type="button"
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
              </button>
            </div>
          </div>
        )}

      {/* Color picker overlay */}
      {gameState.phase === "choosing_color" && isMyTurn && (
        <ColorPicker
          activeSide={gameState.activeSide}
          onSelect={(color) => {
            socket.emit("SELECT_COLOR", {
              color: color as LightColor | DarkColor,
            });
          }}
        />
      )}

      {/* Side indicator */}
      <div
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
      </div>

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
          <button
            type="button"
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
              color: "#888",
              fontWeight: "bold",
              fontSize: 14,
              cursor: isMyTurn ? "pointer" : "default",
              opacity: isMyTurn ? 1 : 0.5,
            }}
          >
            {gameState.drawPileCount}
          </button>
        </div>
      </div>

      {/* Turn indicator */}
      <p
        style={{
          textAlign: "center",
          color: isMyTurn ? "#FFD700" : "#888",
          fontWeight: isMyTurn ? "bold" : "normal",
          fontSize: 16,
          marginBottom: 12,
        }}
      >
        {isMyTurn ? "Your turn!" : `${currentPlayer?.name ?? "..."}'s turn`}
      </p>

      {/* Pass button — shown after drawing a playable card */}
      {isMyTurn && hasDrawn && (
        <button
          type="button"
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
        </button>
      )}

      {/* UNO button */}
      {hand && hand.cards.length <= 2 && isMyTurn && (
        <button
          type="button"
          onClick={() => socket.emit("CALL_UNO")}
          style={{
            padding: "8px 24px",
            fontSize: 16,
            fontWeight: "bold",
            borderRadius: 8,
            border: "none",
            backgroundColor: "#e74c3c",
            color: "white",
            cursor: "pointer",
            alignSelf: "center",
            marginBottom: 12,
          }}
        >
          UNO!
        </button>
      )}

      {/* Your hand */}
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          padding: "8px 0 16px",
          justifyContent:
            hand && hand.cards.length <= 7 ? "center" : "flex-start",
        }}
      >
        {hand?.cards.map((card) => (
          <CardView
            key={card.id}
            card={card}
            activeSide={gameState.activeSide}
            playable={canPlay(card)}
            onClick={() => {
              if (isMyTurn && canPlay(card)) {
                socket.emit("PLAY_CARD", { cardId: card.id });
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Opponent badge ───
function OpponentBadge({
  player,
  isCurrent,
}: {
  player: PublicPlayer;
  isCurrent: boolean;
}) {
  return (
    <div
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        backgroundColor: "#16213e",
        border: isCurrent ? "2px solid #FFD700" : "2px solid transparent",
        fontSize: 13,
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span>{player.name}</span>
      <span
        style={{
          backgroundColor: "#333",
          padding: "2px 6px",
          borderRadius: 4,
          fontSize: 11,
        }}
      >
        {player.cardCount}
      </span>
      {player.isUno && (
        <span style={{ color: "#e74c3c", fontWeight: "bold", fontSize: 11 }}>
          UNO
        </span>
      )}
    </div>
  );
}
