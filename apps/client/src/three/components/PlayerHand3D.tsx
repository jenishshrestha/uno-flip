import { useThree } from "@react-three/fiber";
import type { ActiveSide, Card } from "@uno-flip/shared";
import gsap from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { Vector3 } from "three";
import { useFanFlipAnimation } from "../hooks/useAnimations.js";
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
  onPlayCard,
}: {
  cards: Card[];
  activeSide: ActiveSide;
  config?: HandConfig;
  onPlayCard?: (card: Card) => void;
}) {
  const { camera } = useThree();
  const { screenY, cardSpacing, tiltX, cardScale } = config;

  const cardRefs = useRef<(Group | null)[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handWorldPos = useMemo(() => {
    const ndc = new Vector3(0, screenY, 0.5);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const t = -camera.position.y / dir.y;
    const hit = camera.position.clone().add(dir.multiplyScalar(t));
    return { x: hit.x, z: hit.z };
  }, [camera, screenY]);

  const positions = useMemo(() => {
    const count = cards.length;
    if (count === 0) return [];

    const spacing = Math.min(cardSpacing, 6 / Math.max(count, 1));
    const totalWidth = (count - 1) * spacing;
    const startX = handWorldPos.x - totalWidth / 2;

    return cards.map((_, i) => ({
      x: startX + i * spacing,
      y: 0.01 + i * 0.003,
      z: handWorldPos.z,
    }));
  }, [cards, handWorldPos, cardSpacing]);

  const getPositions = useCallback(() => positions, [positions]);
  useFanFlipAnimation(cardRefs, activeSide, getPositions);

  // Hover animation — lift hovered card, spread neighbors
  useEffect(() => {
    for (let i = 0; i < cards.length; i++) {
      const ref = cardRefs.current[i];
      const basePos = positions[i];
      if (!ref || !basePos) continue;

      if (hoveredIndex === null) {
        // No hover — return all cards to base position
        gsap.to(ref.position, {
          x: basePos.x,
          y: basePos.y,
          z: basePos.z,
          duration: 0.35,
          ease: "back.out(1.4)",
        });
        gsap.to(ref.scale, {
          x: cardScale,
          y: cardScale,
          z: cardScale,
          duration: 0.35,
          ease: "back.out(1.4)",
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
                onPlayCard?.(card);
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
