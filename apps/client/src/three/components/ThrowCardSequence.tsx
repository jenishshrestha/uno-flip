import { useFrame } from "@react-three/fiber";
import type { ActiveSide, Card } from "@uno-flip/shared";
import { useRef } from "react";
import { type Group, Quaternion, Vector3 } from "three";
import { Card3D } from "./Card3D.js";

export interface ThrowPose {
  position: Vector3;
  quaternion: Quaternion;
  scale: number;
}

// Defaults — callers can override for different "feels" (e.g. draw vs throw)
const DEFAULT_DURATION = 0.55;
const DEFAULT_ARC_HEIGHT = 1.6;
const DEFAULT_EXTRA_SPIN = Math.PI * 1.25;

// Cubic ease-out for position, so the card decelerates on landing.
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

// Scratch objects reused each frame to avoid GC pressure
const tmpPos = new Vector3();
const tmpQuatA = new Quaternion();
const tmpSpinQuat = new Quaternion();
const tmpSpinAxis = new Vector3(0, 0, 1);

export function ThrowCardSequence({
  card,
  activeSide,
  from,
  to,
  onComplete,
  duration = DEFAULT_DURATION,
  arcHeight = DEFAULT_ARC_HEIGHT,
  extraSpin = DEFAULT_EXTRA_SPIN,
  chosenColorHex,
}: {
  card: Card;
  activeSide: ActiveSide;
  from: ThrowPose;
  to: ThrowPose;
  onComplete: () => void;
  duration?: number;
  arcHeight?: number;
  extraSpin?: number;
  // For wild throws — paints the wild's black background to this hex during
  // flight so the landing tint doesn't pop in.
  chosenColorHex?: string;
}) {
  const ref = useRef<Group>(null);
  const elapsedRef = useRef(0);
  const doneRef = useRef(false);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group || doneRef.current) return;

    elapsedRef.current += delta;
    const rawT = Math.min(1, elapsedRef.current / duration);
    const t = easeOut(rawT);

    // Position: straight lerp plus a parabolic arc upward (sin peak at t=0.5)
    tmpPos.lerpVectors(from.position, to.position, t);
    tmpPos.y += arcHeight * Math.sin(Math.PI * t);
    group.position.copy(tmpPos);

    // Orientation: slerp from hand pose to landing pose, then add a mid-flight
    // spin around the card's local Z. Extra spin fades to 0 at landing so
    // the final quaternion matches `to` exactly.
    tmpQuatA.slerpQuaternions(from.quaternion, to.quaternion, t);
    const spinAngle = extraSpin * (1 - t);
    tmpSpinQuat.setFromAxisAngle(tmpSpinAxis, spinAngle);
    tmpQuatA.multiply(tmpSpinQuat);
    group.quaternion.copy(tmpQuatA);

    // Scale lerp
    const s = from.scale + (to.scale - from.scale) * t;
    group.scale.setScalar(s);

    if (rawT >= 1) {
      doneRef.current = true;
      onComplete();
    }
  });

  return (
    <group ref={ref}>
      <Card3D
        card={card}
        activeSide={activeSide}
        chosenColorHex={chosenColorHex}
      />
    </group>
  );
}
