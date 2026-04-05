import { Canvas, useThree } from "@react-three/fiber";
import type { Card, GameState, PlayerHand } from "@uno-flip/shared";
import { DECK_MAP } from "@uno-flip/shared";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import { socket } from "../socket.js";
import { playUnoSound } from "../sounds.js";
import { DealSequence } from "./components/DealSequence.js";
import { DiscardPile3D } from "./components/DiscardPile3D.js";
import { OpponentHand3D } from "./components/OpponentHand3D.js";
import type { HandConfig } from "./components/PlayerHand3D.js";
import { PlayerHand3D } from "./components/PlayerHand3D.js";
import { SceneLighting } from "./components/SceneLighting.js";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_POSITION,
} from "./utils/constants.js";

function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(new Vector3(0, 0, 0));
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

// ─── U-path seating algorithm ───
// Bottom is reserved for the current player.
// Opponents are distributed along a U-shaped path:
//   Left edge (bottom→top) → Top edge (left→right) → Right edge (top→bottom)
//
// t=0.0 = bottom-left corner
// t=0.5 = top-center
// t=1.0 = bottom-right corner
//
// Preset overrides for 1-3 opponents give the classic layouts:
//   1 opponent: top center (face to face)
//   2 opponents: top-left, top-right (Y shape)
//   3 opponents: left, top-center, right (cross shape)

const PAD = 5; // % padding from screen edges

function tToPosition(t: number): { left: string; top: string } {
  t = Math.max(0, Math.min(1, t));

  let left: number;
  let top: number;

  if (t <= 1 / 3) {
    // Left edge: going UP (bottom → top)
    const seg = t / (1 / 3);
    left = PAD;
    top = 100 - PAD - seg * (100 - 2 * PAD);
  } else if (t <= 2 / 3) {
    // Top edge: going RIGHT (left → right)
    const seg = (t - 1 / 3) / (1 / 3);
    left = PAD + seg * (100 - 2 * PAD);
    top = PAD;
  } else {
    // Right edge: going DOWN (top → bottom)
    const seg = (t - 2 / 3) / (1 / 3);
    left = 100 - PAD;
    top = PAD + seg * (100 - 2 * PAD);
  }

  return { left: `${left}%`, top: `${top}%` };
}

// Presets for classic small-count layouts
const PRESETS: Record<number, number[]> = {
  1: [0.5], // top center
  2: [1 / 3, 2 / 3], // top-left area, top-right area
  3: [1 / 6, 0.5, 5 / 6], // left, top-center, right
};

// Numeric version for 3D positioning
function tToPositionNumeric(t: number): { left: number; top: number } {
  t = Math.max(0, Math.min(1, t));
  let left: number;
  let top: number;
  if (t <= 1 / 3) {
    const seg = t / (1 / 3);
    left = PAD;
    top = 100 - PAD - seg * (100 - 2 * PAD);
  } else if (t <= 2 / 3) {
    const seg = (t - 1 / 3) / (1 / 3);
    left = PAD + seg * (100 - 2 * PAD);
    top = PAD;
  } else {
    const seg = (t - 2 / 3) / (1 / 3);
    left = 100 - PAD;
    top = PAD + seg * (100 - 2 * PAD);
  }
  return { left, top };
}

function getOpponentPositionsNumeric(
  opponentCount: number,
): Array<{ top: number; left: number }> {
  if (opponentCount === 0) return [];
  const tValues =
    PRESETS[opponentCount] ??
    Array.from(
      { length: opponentCount },
      (_, i) => (i + 1) / (opponentCount + 1),
    );
  return tValues.map(tToPositionNumeric);
}

function getOpponentPositions(
  opponentCount: number,
): Array<{ top: string; left: string }> {
  if (opponentCount === 0) return [];

  const tValues =
    PRESETS[opponentCount] ??
    Array.from(
      { length: opponentCount },
      (_, i) => (i + 1) / (opponentCount + 1),
    );

  return tValues.map(tToPosition);
}

// ─── Loading screen ───
function LoadingScreen() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui",
        color: "#aaa",
        gap: 12,
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: "3px solid rgba(255,255,255,0.1)",
          borderTop: "3px solid #FFD700",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p style={{ margin: 0, fontSize: 14 }}>Preparing table...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function ThreeGameScreen({
  gameState,
  hand,
  overrideMyId,
  handConfig,
  demoDealing,
  discardPile,
  onPlayCard,
}: {
  gameState: GameState;
  hand: PlayerHand | null;
  overrideMyId?: string;
  handConfig?: HandConfig;
  demoDealing?: boolean;
  discardPile?: Card[];
  onPlayCard?: (card: Card) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = gameState.activeSide === "dark";

  const myId = overrideMyId ?? socket.id;
  const myIndex = gameState.players.findIndex((p) => p.id === myId);
  const currentPlayerId = gameState.players[gameState.currentPlayerIndex]?.id;

  // Resolve my hand cards from IDs
  const myCards: Card[] = useMemo(() => {
    if (!hand) return [];
    return hand.cardIds
      .map((id) => DECK_MAP.get(id))
      .filter((c): c is Card => c !== undefined);
  }, [hand]);

  // Resolve all players' cards from IDs (from PublicPlayer.cardIds)
  const allPlayerCards = useMemo(() => {
    const result: Record<string, Card[]> = {};
    for (const player of gameState.players) {
      result[player.id] = player.cardIds
        .map((id) => DECK_MAP.get(id))
        .filter((c): c is Card => c !== undefined);
    }
    return result;
  }, [gameState.players]);

  // Build opponent list in clockwise order starting from the player after "me"
  const opponents = [];
  for (let i = 1; i < gameState.players.length; i++) {
    const idx = (myIndex + i) % gameState.players.length;
    opponents.push(gameState.players[idx]);
  }

  const seats = getOpponentPositions(opponents.length);
  const seatsNumeric = getOpponentPositionsNumeric(opponents.length);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100svh",
        position: "relative",
        overflow: "hidden",
        background: isDark
          ? "radial-gradient(ellipse at 50% 45%, #3a1a5e 0%, #1a0a2e 50%, #0a0515 100%)"
          : "radial-gradient(ellipse at 50% 45%, #1a5a3a 0%, #0a2a1a 50%, #050f0a 100%)",
        transition: "background 0.8s ease",
      }}
    >
      {/* 3D Canvas */}
      <Suspense fallback={<LoadingScreen />}>
        <Canvas
          camera={{
            position: CAMERA_POSITION,
            fov: CAMERA_FOV,
            near: CAMERA_NEAR,
            far: CAMERA_FAR,
          }}
          style={{ position: "absolute", inset: 0 }}
          gl={{ alpha: true }}
        >
          <CameraSetup />
          <SceneLighting />

          {/* Demo dealing animation (test page only) */}
          {demoDealing && myCards.length > 0 && (
            <DealSequence
              players={[
                {
                  id: myId ?? "me",
                  screenX: 50,
                  screenY: 85,
                  isMe: true,
                  cards: myCards,
                },
                ...opponents.map((opp, i) => {
                  const seat = seatsNumeric[i];
                  const oppId = opp?.id ?? `opp-${i}`;
                  return {
                    id: oppId,
                    screenX: seat?.left ?? 50,
                    screenY: seat?.top ?? 5,
                    isMe: false,
                    cards: allPlayerCards[oppId] ?? [],
                  };
                }),
              ]}
              activeSide={gameState.activeSide}
              active
            />
          )}

          {/* Discard pile */}
          {discardPile && discardPile.length > 0 && (
            <DiscardPile3D
              cards={discardPile}
              activeSide={gameState.activeSide}
            />
          )}

          {/* Player's hand */}
          {myCards.length > 0 && !demoDealing && (
            <PlayerHand3D
              cards={myCards}
              activeSide={gameState.activeSide}
              config={handConfig}
              onPlayCard={onPlayCard}
            />
          )}

          {/* Opponent hands — real cards showing inactive side */}
          {!demoDealing &&
            opponents.map((opp, i) => {
              const seat = seatsNumeric[i];
              if (!seat || !opp) return null;
              return (
                <OpponentHand3D
                  key={opp.id}
                  cards={allPlayerCards[opp.id] ?? []}
                  activeSide={gameState.activeSide}
                  screenLeft={seat.left}
                  screenTop={seat.top}
                />
              );
            })}
        </Canvas>
      </Suspense>

      {/* ─── UNO logo — center of screen ─── */}
      <img
        src="/images/logo.svg"
        alt="UNO Flip"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(20vw, 20vh)",
          height: "auto",
          opacity: 0.9,
          pointerEvents: "none",
        }}
      />

      {/* ─── Player labels (HTML overlay) ─── */}

      {/* Player name — bottom left */}
      <div
        style={{
          position: "absolute",
          bottom: "3%",
          left: "3%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          fontFamily: "system-ui",
        }}
      >
        <span
          style={{
            padding: "4px 14px",
            borderRadius: 8,
            backgroundColor:
              currentPlayerId === myId
                ? "rgba(255, 215, 0, 0.2)"
                : "rgba(0, 0, 0, 0.4)",
            border:
              currentPlayerId === myId
                ? "2px solid #FFD700"
                : "2px solid transparent",
            color: currentPlayerId === myId ? "#FFD700" : "#ccc",
            fontSize: 14,
            fontWeight: currentPlayerId === myId ? "bold" : "normal",
          }}
        >
          {gameState.players[myIndex]?.name ?? "You"}
        </span>
      </div>

      {/* UNO button — bottom right */}
      <button
        type="button"
        onClick={() => {
          playUnoSound();
          socket.emit("CALL_UNO");
        }}
        style={{
          position: "absolute",
          bottom: "3%",
          right: "3%",
          padding: "12px 24px",
          fontSize: 18,
          fontWeight: "bold",
          borderRadius: 50,
          border: "none",
          backgroundColor: "#e74c3c",
          color: "white",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(231, 76, 60, 0.5)",
          letterSpacing: 1,
          fontFamily: "system-ui",
        }}
      >
        UNO!
      </button>

      {/* Opponents */}
      {opponents.map((opp, i) => {
        if (!opp) return null;
        const seat = seats[i];
        if (!seat) return null;
        const isCurrent = opp.id === currentPlayerId;

        return (
          <div
            key={opp.id}
            style={{
              position: "absolute",
              top: seat.top,
              left: seat.left,
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              fontFamily: "system-ui",
            }}
          >
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 8,
                backgroundColor: isCurrent
                  ? "rgba(255, 215, 0, 0.2)"
                  : "rgba(0, 0, 0, 0.4)",
                border: isCurrent
                  ? "2px solid #FFD700"
                  : "2px solid transparent",
                color: isCurrent ? "#FFD700" : "#ccc",
                fontSize: 13,
                fontWeight: isCurrent ? "bold" : "normal",
              }}
            >
              {opp.name}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#888",
                backgroundColor: "rgba(0,0,0,0.3)",
                padding: "1px 8px",
                borderRadius: 4,
              }}
            >
              {opp.cardCount} cards
            </span>
            {opp.isUno && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: "bold",
                  color: "#e74c3c",
                }}
              >
                UNO!
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
