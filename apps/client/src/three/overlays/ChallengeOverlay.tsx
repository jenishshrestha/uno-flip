import type { CardValue } from "@uno-flip/shared";
import { AnimatePresence, motion } from "motion/react";
import { socket } from "../../socket.js";

// Per actions.ts: wild_draw_two = 4. Failed challenge adds
// CHALLENGE_PENALTY_EXTRA (2). wild_draw_color is variable ("until color").
function getCounts(wildValue: CardValue | null) {
  if (wildValue === "wild_draw_two") {
    return { acceptLabel: "+4", failLabel: "+6 if fail" };
  }
  if (wildValue === "wild_draw_color") {
    return {
      acceptLabel: "until color",
      failLabel: "until color, +2 if fail",
    };
  }
  return { acceptLabel: "", failLabel: "" };
}

export function ChallengeOverlay({
  show,
  wildValue,
}: {
  show: boolean;
  wildValue?: CardValue | null;
}) {
  const { acceptLabel, failLabel } = getCounts(wildValue ?? null);

  return (
    <AnimatePresence>
      {show && (
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
            fontFamily: "system-ui",
          }}
        >
          <motion.p
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{ color: "white", fontSize: 20, margin: 0 }}
          >
            You've been hit with a Wild Draw!
          </motion.p>
          <p
            style={{
              color: "#aaa",
              fontSize: 14,
              margin: 0,
              maxWidth: 360,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            Draw the cards, or Challenge if you think it was played illegally.
            A failed challenge means you draw extra.
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
              Accept Draw {acceptLabel}
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
              Challenge {failLabel ? `(${failLabel})` : ""}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
