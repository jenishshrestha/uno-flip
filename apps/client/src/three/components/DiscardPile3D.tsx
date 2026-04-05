import { useThree } from "@react-three/fiber";
import type { ActiveSide, Card } from "@uno-flip/shared";
import { useMemo } from "react";
import { Vector3 } from "three";
import { Card3D } from "./Card3D.js";

// Show the top few cards of the discard pile with slight random rotation
const MAX_VISIBLE = 5;

export function DiscardPile3D({
  cards,
  activeSide,
}: {
  cards: Card[];
  activeSide: ActiveSide;
}) {
  const { camera } = useThree();

  // Position at center of screen
  const worldPos = useMemo(() => {
    const ndc = new Vector3(0.15, 0, 0.5); // slightly right of center
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const t = -camera.position.y / dir.y;
    const hit = camera.position.clone().add(dir.multiplyScalar(t));
    return { x: hit.x, z: hit.z };
  }, [camera]);

  // Only render the top few cards
  const visibleCards = cards.slice(-MAX_VISIBLE);

  // Generate stable random rotations per card ID
  const rotations = useMemo(() => {
    return visibleCards.map((card) => {
      // Use card ID as seed for deterministic "random" rotation
      const seed = card.id * 137.5;
      return ((seed % 30) - 15) * (Math.PI / 180); // -15 to +15 degrees
    });
  }, [visibleCards]);

  if (visibleCards.length === 0) return null;

  return (
    <group>
      {visibleCards.map((card, i) => {
        const rot = rotations[i] ?? 0;
        return (
          <group
            key={card.id}
            position={[worldPos.x, 0.01 + i * 0.003, worldPos.z]}
            rotation={[-Math.PI / 2, rot, 0]}
            scale={0.8}
          >
            <Card3D card={card} activeSide={activeSide} />
          </group>
        );
      })}
    </group>
  );
}
