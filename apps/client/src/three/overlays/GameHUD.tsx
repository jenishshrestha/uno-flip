import type { ActiveSide, PublicPlayer } from "@uno-flip/shared";
import { AnimatePresence, motion } from "motion/react";
import { socket } from "../../socket.js";

// ─── Turn indicator ───
function TurnIndicator({
  isMyTurn,
  currentPlayer,
}: {
  isMyTurn: boolean;
  currentPlayer: PublicPlayer | undefined;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={isMyTurn ? "your-turn" : currentPlayer?.id}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "5px 16px",
          borderRadius: 6,
          backgroundColor: "rgba(0,0,0,0.6)",
          color: isMyTurn ? "#FFD700" : "rgba(255,255,255,0.6)",
          fontWeight: isMyTurn ? "bold" : "normal",
          fontSize: 14,
          fontFamily: "system-ui",
          pointerEvents: "none",
        }}
      >
        {isMyTurn ? "Your turn!" : `${currentPlayer?.name ?? "..."}'s turn`}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Side/direction badge ───
function SideBadge({
  activeSide,
  direction,
}: {
  activeSide: ActiveSide;
  direction: string;
}) {
  return (
    <motion.div
      key={activeSide}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        position: "absolute",
        top: 14,
        left: 14,
        padding: "4px 10px",
        borderRadius: 4,
        backgroundColor: "rgba(0,0,0,0.5)",
        fontSize: 11,
        color: "rgba(255,255,255,0.5)",
        fontFamily: "system-ui",
        pointerEvents: "none",
      }}
    >
      {activeSide.toUpperCase()} •{" "}
      {direction === "clockwise" ? "\u2192" : "\u2190"}
    </motion.div>
  );
}

// ─── UNO button ───
function UnoButton({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          key="uno-btn"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", bounce: 0.5 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.85 }}
          onClick={() => socket.emit("CALL_UNO")}
          style={{
            position: "absolute",
            bottom: 120,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 28px",
            fontSize: 18,
            fontWeight: "bold",
            borderRadius: 10,
            border: "none",
            backgroundColor: "#e74c3c",
            color: "white",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(231,76,60,0.4)",
            fontFamily: "system-ui",
          }}
        >
          UNO!
        </motion.button>
      )}
    </AnimatePresence>
  );
}

// ─── Pass button ───
function PassButton({ show, onPass }: { show: boolean; onPass: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          key="pass-btn"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={onPass}
          style={{
            position: "absolute",
            bottom: 120,
            right: "50%",
            transform: "translateX(80px)",
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: "bold",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.3)",
            backgroundColor: "rgba(0,0,0,0.5)",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            fontFamily: "system-ui",
          }}
        >
          Pass
        </motion.button>
      )}
    </AnimatePresence>
  );
}

// ─── Catch UNO buttons ───
function CatchButtons({ opponents }: { opponents: PublicPlayer[] }) {
  const catchable = opponents.filter((p) => p.cardCount === 1 && !p.isUno);
  if (catchable.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 50,
        right: 14,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontFamily: "system-ui",
      }}
    >
      {catchable.map((p) => (
        <motion.button
          key={p.id}
          type="button"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          whileTap={{ scale: 0.85 }}
          onClick={() => socket.emit("CATCH_UNO", { targetPlayerId: p.id })}
          style={{
            padding: "4px 12px",
            fontSize: 12,
            fontWeight: "bold",
            borderRadius: 6,
            border: "none",
            backgroundColor: "#e67e22",
            color: "white",
            cursor: "pointer",
          }}
        >
          Catch {p.name}!
        </motion.button>
      ))}
    </div>
  );
}

// ─── Combined HUD ───
export function GameHUD({
  isMyTurn,
  currentPlayer,
  activeSide,
  direction,
  opponents,
  showUno,
  showPass,
  onPass,
}: {
  isMyTurn: boolean;
  currentPlayer: PublicPlayer | undefined;
  activeSide: ActiveSide;
  direction: string;
  opponents: PublicPlayer[];
  showUno: boolean;
  showPass: boolean;
  onPass: () => void;
}) {
  return (
    <>
      <TurnIndicator isMyTurn={isMyTurn} currentPlayer={currentPlayer} />
      <SideBadge activeSide={activeSide} direction={direction} />
      <UnoButton show={showUno} />
      <PassButton show={showPass} onPass={onPass} />
      <CatchButtons opponents={opponents} />
    </>
  );
}
