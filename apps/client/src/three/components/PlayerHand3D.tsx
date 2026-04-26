import { useThree } from "@react-three/fiber";
import type { ActiveSide, Card } from "@uno-flip/shared";
import gsap from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Camera, Euler, type Group, Quaternion, Vector3 } from "three";
import { useFanFlipAnimation } from "../hooks/useAnimations.js";
import { projectNdcToY0 } from "../utils/screenProject.js";
import { Card3D } from "./Card3D.js";

export interface HandConfig {
  screenY: number;
  cardSpacing: number;
  tiltX: number;
  cardScale: number;
}

export const DEFAULT_HAND_CONFIG: HandConfig = {
  screenY: -0.8,
  cardSpacing: 0.5,
  tiltX: -1.5,
  cardScale: 1.0,
};

// Project hand's screen Y onto the Y=0 world plane. screenY is already
// in NDC space (-1 bottom, 1 top), screenX is centered on 0.
export function getHandWorldPos(
  camera: Camera,
  config: HandConfig,
): { x: number; z: number } {
  return projectNdcToY0(camera, 0, config.screenY);
}

// World pose for one card slot in the fan. Mirrors the internal layout math
// so a drawn card can land exactly where it'll live post-commit. The Y flip
// in dark mode keeps the drawn card showing the active side on arrival.
export function getHandSlotTransform(
  camera: Camera,
  config: HandConfig,
  slotIndex: number,
  totalCount: number,
  activeSide: ActiveSide = "light",
): { position: Vector3; quaternion: Quaternion; scale: number } {
  const { x: handX, z: handZ } = getHandWorldPos(camera, config);
  const n = Math.max(totalCount, 1);
  const spacing = Math.min(config.cardSpacing, 6 / n);
  const startX = handX - ((n - 1) * spacing) / 2;
  const position = new Vector3(
    startX + slotIndex * spacing,
    0.01 + slotIndex * 0.003,
    handZ,
  );
  const sideY = activeSide === "dark" ? Math.PI : 0;
  const quaternion = new Quaternion().setFromEuler(
    new Euler(config.tiltX, sideY, 0),
  );
  return { position, quaternion, scale: config.cardScale };
}

// How much the hovered card lifts
const HOVER_LIFT = 0.5;
// How much the hovered card scales
const HOVER_SCALE = 1.15;
// How much neighbors spread apart
const NEIGHBOR_SPREAD = 0.25;
// Falloff per step from hovered card
const SPREAD_FALLOFF = 0.6;

export function PlayerHand3D({
  cards,
  activeSide,
  config = DEFAULT_HAND_CONFIG,
  playableIds,
  // Default: 0.15 along the card's local +Y (up the card face). With the
  // standard tiltX that lands as roughly (0, 0.01, -0.15) in world, so
  // playable cards rise up on screen without any camera-depth change.
  playableTranslate = [0, 0.15, 0],
  onPlayCard,
}: {
  cards: Card[];
  activeSide: ActiveSide;
  config?: HandConfig;
  // Card IDs the player can legally play on the current discard top.
  // When undefined, all cards are treated as playable. Used only to gate
  // onClick — no visual difference is applied to unplayable cards.
  playableIds?: ReadonlySet<number>;
  // CSS-style [translateX, translateY, translateZ] applied in the card's
  // LOCAL frame (after its tilt). translateY moves along the card's top
  // edge (mostly -Z world = "up on screen"); translateZ moves along the
  // card's face normal (mostly +Y world = toward camera); translateX is
  // along world X since the card is only rotated around X.
  playableTranslate?: [number, number, number];
  onPlayCard?: (
    card: Card,
    fromPose: {
      position: Vector3;
      quaternion: Quaternion;
      scale: number;
    },
  ) => void;
}) {
  const { camera } = useThree();
  const { screenY, cardSpacing, tiltX, cardScale } = config;

  const cardRefs = useRef<(Group | null)[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handWorldPos = useMemo(
    () => projectNdcToY0(camera, 0, screenY),
    [camera, screenY],
  );

  const positions = useMemo(() => {
    const count = cards.length;
    if (count === 0) return [];

    const spacing = Math.min(cardSpacing, 6 / Math.max(count, 1));
    const totalWidth = (count - 1) * spacing;
    const startX = handWorldPos.x - totalWidth / 2;

    // Convert local-axis translate into a world offset using the card's
    // single X-axis rotation (rotation={[tiltX, 0, 0]}):
    //   worldX = localX
    //   worldY = cos(tiltX)*localY − sin(tiltX)*localZ
    //   worldZ = sin(tiltX)*localY + cos(tiltX)*localZ
    const [lx, ly, lz] = playableTranslate;
    const cos = Math.cos(tiltX);
    const sin = Math.sin(tiltX);
    const offX = lx;
    const offY = cos * ly - sin * lz;
    const offZ = sin * ly + cos * lz;

    return cards.map((card, i) => {
      const isPlayable = playableIds?.has(card.id) ?? false;
      return {
        x: startX + i * spacing + (isPlayable ? offX : 0),
        y: 0.01 + i * 0.003 + (isPlayable ? offY : 0),
        z: handWorldPos.z + (isPlayable ? offZ : 0),
      };
    });
  }, [cards, handWorldPos, cardSpacing, playableIds, playableTranslate, tiltX]);

  const getPositions = useCallback(() => positions, [positions]);
  useFanFlipAnimation(cardRefs, activeSide, getPositions);

  // Hover animation — lift hovered card, spread neighbors
  useEffect(() => {
    for (let i = 0; i < cards.length; i++) {
      const ref = cardRefs.current[i];
      const basePos = positions[i];
      if (!ref || !basePos) continue;

      if (hoveredIndex === null) {
        // No hover — slide each card to its baseline. Plain power2.out so a
        // playable-status change just translates; no spring/overshoot.
        gsap.to(ref.position, {
          x: basePos.x,
          y: basePos.y,
          z: basePos.z,
          duration: 0.25,
          ease: "power2.out",
        });
        gsap.to(ref.scale, {
          x: cardScale,
          y: cardScale,
          z: cardScale,
          duration: 0.25,
          ease: "power2.out",
        });
        continue;
      }

      const distance = i - hoveredIndex;

      if (distance === 0) {
        // Hovered card — lift up, scale up
        gsap.to(ref.position, {
          x: basePos.x,
          y: basePos.y + HOVER_LIFT,
          z: basePos.z - 0.2,
          duration: 0.2,
          ease: "power2.out",
        });
        gsap.to(ref.scale, {
          x: cardScale * HOVER_SCALE,
          y: cardScale * HOVER_SCALE,
          z: cardScale * HOVER_SCALE,
          duration: 0.2,
          ease: "power2.out",
        });
      } else {
        // Neighbor — push apart, falloff with distance
        const sign = distance > 0 ? 1 : -1;
        const absDistance = Math.abs(distance);
        const pushAmount =
          NEIGHBOR_SPREAD * SPREAD_FALLOFF ** (absDistance - 1);

        gsap.to(ref.position, {
          x: basePos.x + sign * pushAmount,
          y: basePos.y,
          z: basePos.z,
          duration: 0.25,
          ease: "power2.out",
        });
        gsap.to(ref.scale, {
          x: cardScale,
          y: cardScale,
          z: cardScale,
          duration: 0.25,
          ease: "power2.out",
        });
      }
    }
  }, [hoveredIndex, positions, cards.length, cardScale]);

  return (
    <group>
      {cards.map((card, i) => {
        const pos = positions[i];
        if (!pos) return null;
        const isPlayable = playableIds ? playableIds.has(card.id) : true;

        return (
          <group key={card.id}>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Three.js group */}
            <group
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              position={[pos.x, pos.y, pos.z]}
              rotation={[tiltX, 0, 0]}
              scale={cardScale}
              onPointerEnter={(e) => {
                e.stopPropagation();
                setHoveredIndex(i);
                document.body.style.cursor = "pointer";
              }}
              onPointerLeave={() => {
                setHoveredIndex(null);
                document.body.style.cursor = "default";
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isPlayable) return;
                const ref = cardRefs.current[i];
                if (!ref) return;
                const position = new Vector3();
                const quaternion = new Quaternion();
                ref.getWorldPosition(position);
                ref.getWorldQuaternion(quaternion);
                onPlayCard?.(card, {
                  position,
                  quaternion,
                  scale: cardScale,
                });
              }}
            >
              <Card3D card={card} activeSide={activeSide} />
            </group>
          </group>
        );
      })}
    </group>
  );
}
