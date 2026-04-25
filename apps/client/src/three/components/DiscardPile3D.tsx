import { useThree } from "@react-three/fiber";
import type { ActiveSide, Card } from "@uno-flip/shared";
import gsap from "gsap";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { type Camera, Euler, type Group, Quaternion, Vector3 } from "three";
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
// Duration of the per-card flip animation when an entry's `side` changes
const FLIP_ANIMATION_DURATION = 0.6;

// One card committed to the discard pile, frozen on the side it was played on.
// The `side` may change later (e.g., a Flip card animates to its other side
// once the flip mechanic resolves), but older entries keep their original side.
export interface DiscardEntry {
  card: Card;
  side: ActiveSide;
}

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

function sideToY(side: ActiveSide): number {
  return side === "dark" ? Math.PI : 0;
}

// World-space pose a card lands at when it reaches the top of the pile.
// `incomingIndex` is the index that card will occupy in the visible slice
// once committed (typically Math.min(currentPileLength, MAX_VISIBLE - 1)).
// `sidePlayedOn` decides which face is up at landing — the entry's stored
// side. This always matches what DiscardPile3D will subsequently render, so
// the throw lands cleanly with no orientation pop.
export function getDiscardTopTransform(
  card: Card,
  incomingIndex: number,
  config: DiscardConfig,
  worldPos: { x: number; z: number },
  sidePlayedOn: ActiveSide = "light",
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
  const cardQuat = new Quaternion().setFromEuler(
    new Euler(0, sideToY(sidePlayedOn), spin),
  );
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

// One card on the discard pile. Snaps to its initial side on mount; if the
// `side` prop changes later, animates a 180° Y flip (used for the Flip card
// resolving its mechanic — every other entry keeps its original side).
function DiscardCard({
  entry,
  position,
  spin,
  chosenColorHex,
}: {
  entry: DiscardEntry;
  position: [number, number, number];
  spin: number;
  // Set only on the top entry when the active wild card has a chosen color;
  // recolors the wild's center diamond to match (UNO Mobile style).
  chosenColorHex?: string;
}) {
  const ref = useRef<Group>(null);
  const prevSideRef = useRef<ActiveSide | null>(null);

  // Initial mount: snap rotation imperatively so we don't fight the GSAP
  // animation later (passing `rotation` as a prop would re-set it every render).
  useLayoutEffect(() => {
    const obj = ref.current;
    if (!obj || prevSideRef.current !== null) return;
    obj.rotation.set(0, sideToY(entry.side), spin);
    prevSideRef.current = entry.side;
  }, [entry.side, spin]);

  // On subsequent side changes (the flip mechanic), animate a Y rotation
  // toward the new side. The card visually flips in place.
  useEffect(() => {
    const obj = ref.current;
    if (!obj) return;
    if (prevSideRef.current === null || prevSideRef.current === entry.side)
      return;
    prevSideRef.current = entry.side;
    gsap.to(obj.rotation, {
      y: sideToY(entry.side),
      duration: FLIP_ANIMATION_DURATION,
      ease: "power2.inOut",
    });
  }, [entry.side]);

  return (
    <group ref={ref} position={position}>
      <Card3D
        card={entry.card}
        activeSide={entry.side}
        chosenColorHex={chosenColorHex}
      />
    </group>
  );
}

export function DiscardPile3D({
  cards,
  config = DEFAULT_DISCARD_CONFIG,
  chosenColorHex,
}: {
  cards: DiscardEntry[];
  config?: DiscardConfig;
  // When set and the top entry is a wild card, that card visually adopts
  // this color (matches UNO Mobile's "wild becomes the chosen color" look).
  chosenColorHex?: string;
}) {
  const { scale, tiltX, tiltY, tiltZ } = config;
  const { camera } = useThree();

  const worldPos = useMemo(
    () => getDiscardWorldPos(camera, config),
    [camera, config],
  );

  if (cards.length === 0) return null;

  const visibleCards = cards.slice(-MAX_VISIBLE);
  const topIndex = visibleCards.length - 1;

  return (
    <group
      position={[worldPos.x, 0, worldPos.z]}
      rotation={[tiltX, tiltY, tiltZ]}
      scale={scale}
    >
      {visibleCards.map((entry, i) => {
        const { spin, offX, offY } = cardJitter(entry.card.id);
        return (
          <DiscardCard
            key={entry.card.id}
            entry={entry}
            position={[offX, offY, i * STACK_GAP]}
            spin={spin}
            chosenColorHex={i === topIndex ? chosenColorHex : undefined}
          />
        );
      })}
    </group>
  );
}
