import { AnimatePresence, motion } from "motion/react";
import { socket } from "../../socket.js";

export function ChallengeOverlay({ show }: { show: boolean }) {
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
          <p style={{ color: "#aaa", fontSize: 14, margin: 0 }}>
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
  );
}
