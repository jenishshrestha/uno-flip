import { useThree } from "@react-three/fiber";
import type { ActiveSide, Card } from "@uno-flip/shared";
import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { projectScreenPercentToY0 } from "../utils/screenProject.js";
import { Card3D } from "./Card3D.js";

interface PlayerTarget {
  id: string;
  screenX: number;
  screenY: number;
  isMe: boolean;
  cards: Card[]; // actual cards dealt to this player
}

interface FlyingCard {
  id: number;
  playerIndex: number;
  round: number;
  card: Card;
  isMe: boolean;
}

export function DealSequence({
  players,
  activeSide,
  active,
  onComplete,
}: {
  players: PlayerTarget[];
  activeSide: ActiveSide;
  active: boolean;
  onComplete?: () => void;
}) {
  const { camera } = useThree();
  const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
  const cardRefs = useRef<Map<number, Group>>(new Map());
  const hasStarted = useRef(false);

  const worldTargets = useMemo(() => {
    return players.map((p) => {
      const { x, z } = projectScreenPercentToY0(camera, p.screenX, p.screenY);
      return { ...p, worldX: x, worldZ: z };
    });
  }, [camera, players]);

  useEffect(() => {
    if (!active || hasStarted.current) return;
    hasStarted.current = true;

    // Build round-robin order with actual card data
    const allCards: FlyingCard[] = [];
    const cardsPerPlayer = players[0]?.cards.length ?? 7;
    let cardId = 0;

    for (let round = 0; round < cardsPerPlayer; round++) {
      for (let p = 0; p < players.length; p++) {
        const player = players[p];
        const card = player?.cards[round];
        if (!player || !card) continue;
        allCards.push({
          id: cardId++,
          playerIndex: p,
          round,
          card,
          isMe: player.isMe,
        });
      }
    }

    setFlyingCards(allCards);

    const staggerDelay = 0.12;
    const cardDuration = 0.35;
    const arcHeight = 1.5;

    requestAnimationFrame(() => {
      for (let i = 0; i < allCards.length; i++) {
        const fc = allCards[i];
        if (!fc) continue;
        const target = worldTargets[fc.playerIndex];
        if (!target) continue;

        const ref = cardRefs.current.get(fc.id);
        if (!ref) continue;

        const delay = i * staggerDelay;

        // Fan offset at target position
        const fanSpacing = target.isMe ? 0.5 : 0.15;
        const fanWidth = (cardsPerPlayer - 1) * fanSpacing;
        const fanOffset = -fanWidth / 2 + fc.round * fanSpacing;
        const targetX = target.worldX + fanOffset;
        const targetZ = target.worldZ;
        const targetScale = target.isMe ? 1.0 : 0.5;

        // Start at center, small
        ref.position.set(0, 2, 0);
        ref.scale.set(0.3, 0.3, 0.3);

        // Arc movement
        const progress = { t: 0 };
        gsap.to(progress, {
          t: 1,
          duration: cardDuration,
          delay,
          ease: "power2.out",
          onUpdate: () => {
            const t = progress.t;
            ref.position.x = t * targetX;
            ref.position.z = t * targetZ;
            ref.position.y = 2 + (0 - 2) * t + arcHeight * 4 * t * (1 - t);
          },
        });

        // Scale up
        gsap.to(ref.scale, {
          x: targetScale,
          y: targetScale,
          z: targetScale,
          duration: cardDuration * 0.7,
          delay,
          ease: "power2.out",
        });
      }

      // Complete after all cards land
      const totalDuration =
        (allCards.length - 1) * staggerDelay + cardDuration + 0.1;
      setTimeout(() => {
        setFlyingCards([]);
        hasStarted.current = false;
        onComplete?.();
      }, totalDuration * 1000);
    });
  }, [active, players, worldTargets, onComplete]);

  useEffect(() => {
    if (!active) {
      hasStarted.current = false;
    }
  }, [active]);

  return (
    <group>
      {flyingCards.map((fc) => {
        const tiltX = fc.isMe ? -1.5 : -1.2;
        return (
          <group
            key={fc.id}
            ref={(el) => {
              if (el) cardRefs.current.set(fc.id, el);
              else cardRefs.current.delete(fc.id);
            }}
            position={[0, 2, 0]}
            rotation={[tiltX, 0, 0]}
            scale={0.3}
          >
            <Card3D card={fc.card} activeSide={activeSide} />
          </group>
        );
      })}
    </group>
  );
}
