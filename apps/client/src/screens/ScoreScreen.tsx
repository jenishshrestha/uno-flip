import type { GameState } from "@uno-flip/shared";
import { motion } from "motion/react";
import { useEffect } from "react";
import { socket } from "../socket.js";

export function ScoreScreen({ gameState }: { gameState: GameState }) {
  const isGameOver = gameState.phase === "game_over";
  const myId = socket.id;
  const isHost = gameState.hostId === myId;

  // Reset background to default on this screen
  useEffect(() => {
    document.body.style.backgroundColor = "#1a1a2e";
    return () => {
      document.body.style.backgroundColor = "#1a1a2e";
    };
  }, []);

  // Sort players by cumulative score (descending)
  const ranked = [...gameState.players]
    .map((p) => ({ ...p, score: gameState.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui",
      }}
    >
      {/* Title */}
      <motion.h1
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.4, delay: 0.2 }}
        style={{
          fontSize: 36,
          margin: "0 0 8px",
          color: isGameOver ? "#FFD700" : "#eee",
        }}
      >
        {isGameOver ? "Game Over!" : "Round Over!"}
      </motion.h1>

      {/* Winner */}
      {winner && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          style={{ fontSize: 20, color: "#FFD700", marginBottom: 32 }}
        >
          {winner.name} {isGameOver ? "wins the game!" : "wins the round!"}
        </motion.p>
      )}

      {/* Scoreboard */}
      <div style={{ width: "100%", maxWidth: 360 }}>
        {ranked.map((player, i) => (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.1 }}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              backgroundColor: i === 0 ? "rgba(255,215,0,0.15)" : "#16213e",
              borderRadius: 8,
              marginBottom: 6,
              border:
                player.id === myId
                  ? "2px solid #FFD700"
                  : "2px solid transparent",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  color: "#888",
                  fontSize: 14,
                  width: 20,
                }}
              >
                #{i + 1}
              </span>
              <span style={{ fontSize: 16 }}>{player.name}</span>
              {player.id === myId && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: "bold",
                    backgroundColor: "#2ecc71",
                    color: "white",
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  YOU
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: i === 0 ? "#FFD700" : "#eee",
              }}
            >
              {player.score}
            </span>
          </motion.div>
        ))}
      </div>

      {/* 500 point reminder */}
      <p
        style={{
          color: "#555",
          fontSize: 12,
          margin: "16px 0 0",
        }}
      >
        First to 500 points wins the game
      </p>

      {/* Action */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        style={{ marginTop: 24 }}
      >
        {isGameOver ? (
          <p style={{ color: "#888", fontSize: 14 }}>Thanks for playing!</p>
        ) : isHost ? (
          <button
            type="button"
            onClick={() => socket.emit("START_NEXT_ROUND")}
            style={{
              padding: "14px 32px",
              fontSize: 18,
              fontWeight: "bold",
              borderRadius: 8,
              border: "none",
              backgroundColor: "#e74c3c",
              color: "white",
              cursor: "pointer",
            }}
          >
            Next Round
          </button>
        ) : (
          <p
            style={{
              color: "#888",
              fontStyle: "italic",
            }}
          >
            Waiting for host to start next round...
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
