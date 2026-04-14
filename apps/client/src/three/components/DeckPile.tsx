import { useThree } from "@react-three/fiber";
import type { ActiveSide, Card } from "@uno-flip/shared";
import { useMemo } from "react";
import { type Camera, Euler, Quaternion, Vector3 } from "three";
import { CARD_DEPTH } from "../utils/constants.js";
import { Card3D } from "./Card3D.js";

const STACK_VISIBLE = 50;
const STACK_GAP = CARD_DEPTH;

export interface DeckConfig {
  screenLeft: number;
  screenTop: number;
  scale: number;
  tiltX: number;
  tiltY: number;
  tiltZ: number;
}

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  screenLeft: 82,
  screenTop: 90,
  scale: 1.0,
  // Match PlayerHand3D default tiltX so deck cards face camera the same way
  tiltX: -1.5,
  tiltY: 0,
  tiltZ: 0,
};

// Project the deck's screen position onto the Y=0 world plane.
export function getDeckWorldPos(
  camera: Camera,
  config: DeckConfig,
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

// World pose of the top card on the deck (the one that gets drawn next).
// `visibleCount` is the number of cards currently rendered in the stack
// (up to STACK_VISIBLE); the top card sits at local z = -(visibleCount-1)*gap.
export function getDeckTopTransform(
  config: DeckConfig,
  worldPos: { x: number; z: number },
  visibleCount: number,
): { position: Vector3; quaternion: Quaternion; scale: number } {
  const clampedCount = Math.min(visibleCount, STACK_VISIBLE);
  const groupQuat = new Quaternion().setFromEuler(
    new Euler(config.tiltX, config.tiltY, config.tiltZ),
  );
  const localPos = new Vector3(
    0,
    0,
    -(clampedCount - 1) * STACK_GAP,
  ).multiplyScalar(config.scale);
  const position = new Vector3(worldPos.x, 0, worldPos.z).add(
    localPos.applyQuaternion(groupQuat),
  );
  return { position, quaternion: groupQuat, scale: config.scale };
}

export function DeckPile({
  cards,
  activeSide,
  config = DEFAULT_DECK_CONFIG,
  onClick,
}: {
  cards: Card[];
  activeSide: ActiveSide;
  config?: DeckConfig;
  onClick?: () => void;
}) {
  const { screenLeft, screenTop, scale, tiltX, tiltY, tiltZ } = config;
  const { camera } = useThree();

  const worldPos = useMemo(() => {
    const ndcX = (screenLeft / 100) * 2 - 1;
    const ndcY = -((screenTop / 100) * 2 - 1);
    const ndc = new Vector3(ndcX, ndcY, 0.5);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    if (Math.abs(dir.y) < 1e-6) return { x: 0, z: 0 };
    const t = -camera.position.y / dir.y;
    const hit = camera.position.clone().add(dir.multiplyScalar(t));
    return { x: hit.x, z: hit.z };
  }, [camera, screenLeft, screenTop]);

  if (cards.length === 0) return null;

  const visibleCards = cards.slice(-STACK_VISIBLE);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Three.js group
    <group
      position={[worldPos.x, 0, worldPos.z]}
      rotation={[tiltX, tiltY, tiltZ]}
      scale={scale}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      onPointerEnter={
        onClick
          ? () => {
              document.body.style.cursor = "pointer";
            }
          : undefined
      }
      onPointerLeave={
        onClick
          ? () => {
              document.body.style.cursor = "default";
            }
          : undefined
      }
    >
      {visibleCards.map((card, i) => (
        <Card3D
          key={card.id}
          card={card}
          activeSide={activeSide}
          position={[0, 0, -i * STACK_GAP]}
        />
      ))}
    </group>
  );
}
