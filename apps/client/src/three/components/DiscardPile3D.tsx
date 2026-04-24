import { useThree } from "@react-three/fiber";
import type { ActiveSide, Card } from "@uno-flip/shared";
import { useMemo } from "react";
import { type Camera, Euler, Quaternion, Vector3 } from "three";
import { CARD_DEPTH } from "../utils/constants.js";
import { Card3D } from "./Card3D.js";

// How many top cards to actually render
const MAX_VISIBLE = 10;
// Stack gap along card depth
const STACK_GAP = CARD_DEPTH;
// Max in-plane rotation per card (radians) — gives the "thrown messily" look
const MAX_SPIN = (35 * Math.PI) / 180;
// Max X/Y position jitter per card (card-local, before parent tilt)
const MAX_OFFSET = 0.45;

export interface DiscardConfig {
  screenLeft: number;
  screenTop: number;
  scale: number;
  tiltX: number;
  tiltY: number;
  tiltZ: number;
}

export const DEFAULT_DISCARD_CONFIG: DiscardConfig = {
  screenLeft: 50,
  screenTop: 50,
  scale: 1.0,
  // Match hand/deck tilt so discard faces camera the same way
  tiltX: -1.5,
  tiltY: 0,
  tiltZ: 0,
};

// Project the configured discard screen position onto the Y=0 world plane.
// Shared by the pile renderer and the throw-target computation so both agree.
export function getDiscardWorldPos(
  camera: Camera,
  config: DiscardConfig,
): { x: number; z: number } {
  const ndcX = (config.screenLeft / 100) * 2 - 1;
  const ndcY = -((config.screenTop / 100) * 2 - 1);
  const ndc = new Vector3(ndcX, ndcY, 0.5);
  ndc.unproject(camera);
  const dir = ndc.sub(camera.position).normalize();
  if (Math.abs(dir.y) < 1e-6) return { x: 0, z: 0 };
  const t = -camera.position.y / dir.y;
  const hit = camera.position.clone().add(dir.multiplyScalar(t));
  return { x: hit.x, z: hit.z };
}

// Deterministic per-card jitter so every thrown card ends up in the exact
// slot the pile renderer will draw it at.
function cardJitter(cardId: number) {
  const spin = (((cardId * 137.5) % 30) - 15) * (MAX_SPIN / 15);
  const offX = (((cardId * 73.3) % 20) - 10) * (MAX_OFFSET / 10);
  const offY = (((cardId * 199.7) % 20) - 10) * (MAX_OFFSET / 10);
  return { spin, offX, offY };
}

// World-space pose a card lands at when it reaches the top of the pile.
// `incomingIndex` is the index that card will occupy in the visible slice
// once committed (typically Math.min(currentPileLength, MAX_VISIBLE - 1)).
// The card rotates 180° around its local Y in dark mode so the correct face
// (matching the currently-active side) points toward the camera.
export function getDiscardTopTransform(
  card: Card,
  incomingIndex: number,
  config: DiscardConfig,
  worldPos: { x: number; z: number },
  activeSide: ActiveSide = "light",
): { position: Vector3; quaternion: Quaternion; scale: number } {
  const { spin, offX, offY } = cardJitter(card.id);
  const groupQuat = new Quaternion().setFromEuler(
    new Euler(config.tiltX, config.tiltY, config.tiltZ),
  );
  const localPos = new Vector3(
    offX,
    offY,
    incomingIndex * STACK_GAP,
  ).multiplyScalar(config.scale);
  const sideY = activeSide === "dark" ? Math.PI : 0;
  const cardQuat = new Quaternion().setFromEuler(new Euler(0, sideY, spin));
  const position = new Vector3(worldPos.x, 0, worldPos.z).add(
    localPos.applyQuaternion(groupQuat),
  );
  const quaternion = groupQuat.clone().multiply(cardQuat);
  return { position, quaternion, scale: config.scale };
}

// Index the next thrown card will occupy in the visible slice
export function getNextDiscardSlot(currentPileLength: number): number {
  return Math.min(currentPileLength, MAX_VISIBLE - 1);
}

export function DiscardPile3D({
  cards,
  activeSide,
  config = DEFAULT_DISCARD_CONFIG,
}: {
  cards: Card[];
  activeSide: ActiveSide;
  config?: DiscardConfig;
}) {
  const { scale, tiltX, tiltY, tiltZ } = config;
  const { camera } = useThree();

  const worldPos = useMemo(
    () => getDiscardWorldPos(camera, config),
    [camera, config],
  );

  if (cards.length === 0) return null;

  const visibleCards = cards.slice(-MAX_VISIBLE);

  return (
    <group
      position={[worldPos.x, 0, worldPos.z]}
      rotation={[tiltX, tiltY, tiltZ]}
      scale={scale}
    >
      {visibleCards.map((card, i) => {
        const { spin, offX, offY } = cardJitter(card.id);
        const sideY = activeSide === "dark" ? Math.PI : 0;
        return (
          <Card3D
            key={card.id}
            card={card}
            activeSide={activeSide}
            position={[offX, offY, i * STACK_GAP]}
            rotation={[0, sideY, spin]}
          />
        );
      })}
    </group>
  );
}
