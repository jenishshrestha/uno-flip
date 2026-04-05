import type { ActiveSide, DarkColor, LightColor } from "@uno-flip/shared";
import { AnimatePresence, motion } from "motion/react";
import { DARK_COLORS, LIGHT_COLORS } from "../utils/cardColors.js";

export function ColorPickerOverlay({
  show,
  activeSide,
  onSelect,
}: {
  show: boolean;
  activeSide: ActiveSide;
  onSelect: (color: LightColor | DarkColor) => void;
}) {
  const colors =
    activeSide === "light"
      ? (["red", "yellow", "green", "blue"] as LightColor[])
      : (["pink", "teal", "orange", "purple"] as DarkColor[]);
  const colorMap = activeSide === "light" ? LIGHT_COLORS : DARK_COLORS;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="color-picker"
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
            fontFamily: "system-ui",
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
      )}
    </AnimatePresence>
  );
}
