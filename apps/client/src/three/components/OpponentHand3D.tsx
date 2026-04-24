import { useThree } from "@react-three/fiber";
import type { ActiveSide, Card } from "@uno-flip/shared";
import gsap from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { Vector3 } from "three";
import { useFanFlipAnimation } from "../hooks/useAnimations.js";
import { Card3D } from "./Card3D.js";

const CARD_SPACING = 0.15;
const CARD_SCALE = 0.5;

// Subtle hover for opponent cards
const HOVER_LIFT = 0.15;
const HOVER_SCALE_FACTOR = 1.08;
const NEIGHBOR_SPREAD = 0.08;
const SPREAD_FALLOFF = 0.5;

export function OpponentHand3D({
  cards,
  activeSide,
  screenLeft,
  screenTop,
}: {
  cards: Card[];
  activeSide: ActiveSide;
  screenLeft: number;
  screenTop: number;
}) {
  const { camera } = useThree();
  const cardRefs = useRef<(Group | null)[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const worldPos = useMemo(() => {
    const ndcX = (screenLeft / 100) * 2 - 1;
    const ndcY = -((screenTop / 100) * 2 - 1);
    const ndc = new Vector3(ndcX, ndcY, 0.5);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const t = -camera.position.y / dir.y;
    const hit = camera.position.clone().add(dir.multiplyScalar(t));
    return { x: hit.x, z: hit.z };
  }, [camera, screenLeft, screenTop]);

  const positions = useMemo(() => {
    const count = cards.length;
    if (count === 0) return [];

    const spacing = Math.min(CARD_SPACING, 2 / Math.max(count, 1));
    const totalWidth = (count - 1) * spacing;
    const startX = worldPos.x - totalWidth / 2;

    return Array.from({ length: count }, (_, i) => ({
      x: startX + i * spacing,
      y: 0.01 + i * 0.002,
      z: worldPos.z + 0.8,
    }));
  }, [cards.length, worldPos]);

  // Fan-flip animation: stack → flip → fan (same as player hand).
  // baseY = π because opponents show their INACTIVE side across the table
  // (they hold cards light-side-toward-themselves, so in light mode we see
  // the dark back; in dark mode we see the light back).
  const getPositions = useCallback(() => positions, [positions]);
  useFanFlipAnimation(cardRefs, activeSide, getPositions, { baseY: Math.PI });

  // Hover animation
  useEffect(() => {
    for (let i = 0; i < cards.length; i++) {
      const ref = cardRefs.current[i];
      const basePos = positions[i];
      if (!ref || !basePos) continue;

      if (hoveredIndex === null) {
        gsap.to(ref.position, {
          x: basePos.x,
          y: basePos.y,
          z: basePos.z,
          duration: 0.35,
          ease: "back.out(1.4)",
        });
        gsap.to(ref.scale, {
          x: CARD_SCALE,
          y: CARD_SCALE,
          z: CARD_SCALE,
          duration: 0.35,
          ease: "back.out(1.4)",
        });
        continue;
      }

      const distance = i - hoveredIndex;

      if (distance === 0) {
        gsap.to(ref.position, {
          x: basePos.x,
          y: basePos.y + HOVER_LIFT,
          z: basePos.z - 0.1,
          duration: 0.2,
          ease: "power2.out",
        });
        gsap.to(ref.scale, {
          x: CARD_SCALE * HOVER_SCALE_FACTOR,
          y: CARD_SCALE * HOVER_SCALE_FACTOR,
          z: CARD_SCALE * HOVER_SCALE_FACTOR,
          duration: 0.2,
          ease: "power2.out",
        });
      } else {
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
          x: CARD_SCALE,
          y: CARD_SCALE,
          z: CARD_SCALE,
          duration: 0.25,
          ease: "power2.out",
        });
      }
    }
  }, [hoveredIndex, positions, cards.length]);

  return (
    <group>
      {cards.map((card, i) => {
        const pos = positions[i];
        if (!pos) return null;

        return (
          <group
            key={card.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            position={[pos.x, pos.y, pos.z]}
            rotation={[-1.5, 0, 0]}
            scale={CARD_SCALE}
            onPointerEnter={(e) => {
              e.stopPropagation();
              setHoveredIndex(i);
              document.body.style.cursor = "pointer";
            }}
            onPointerLeave={() => {
              setHoveredIndex(null);
              document.body.style.cursor = "default";
            }}
          >
            <Card3D card={card} activeSide={activeSide} />
          </group>
        );
      })}
    </group>
  );
}
