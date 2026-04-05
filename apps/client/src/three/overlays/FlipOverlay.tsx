import { AnimatePresence, motion } from "motion/react";

export function FlipOverlay({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
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
              fontFamily: "system-ui",
            }}
          >
            FLIP!
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
