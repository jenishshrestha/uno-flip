import gsap from "gsap";
import { useCallback, useEffect, useRef } from "react";
import type { Group, Object3D } from "three";

// ─── Flip Animation ───
// Rotates an object 180° around Y axis.
// Attach to any 3D object ref. Call `flip()` to trigger.
// Tracks cumulative rotation so multiple flips work correctly.
export function useFlipAnimation(
  ref: React.RefObject<Group | Object3D | null>,
  options: {
    duration?: number;
    ease?: string;
    axis?: "x" | "y" | "z";
  } = {},
) {
  const { duration = 0.6, ease = "power2.inOut", axis = "y" } = options;
  const targetRotation = useRef(0);

  const flip = useCallback(() => {
    if (!ref.current) return;
    targetRotation.current += Math.PI;
    gsap.to(ref.current.rotation, {
      [axis]: targetRotation.current,
      duration,
      ease,
    });
  }, [ref, duration, ease, axis]);

  return { flip };
}

// ─── Flip on prop change ───
// Automatically flips when `activeSide` changes.
// Attach to a card group ref.
export function useFlipOnSideChange(
  ref: React.RefObject<Group | Object3D | null>,
  activeSide: "light" | "dark",
  options: {
    duration?: number;
    ease?: string;
  } = {},
) {
  const { duration = 0.6, ease = "power2.inOut" } = options;
  const prevSide = useRef(activeSide);
  const targetRotation = useRef(0);

  useEffect(() => {
    if (!ref.current) return;
    if (prevSide.current === activeSide) return;

    prevSide.current = activeSide;
    targetRotation.current += Math.PI;

    gsap.to(ref.current.rotation, {
      y: targetRotation.current,
      duration,
      ease,
    });
  }, [ref, activeSide, duration, ease]);
}

// ─── Fan-Flip Animation ───
// For a hand of cards: fan → stack → flip 180° → fan back out.
// Each card rotates individually around its own Y axis (no group rotation).
//
// The hook owns `rotation.y` for every ref it's given. On first mount it
// snaps refs to the side-appropriate rotation (no animation) so the hand
// renders correctly even when the game begins in dark mode. When the cards
// array grows mid-game (card drawn), it snaps any new refs to match. On a
// true activeSide change it runs the stack → flip → fan animation.
//
// `baseY` is the Y rotation a card should have when `activeSide === "light"`.
// - PlayerHand3D: 0 (light face toward camera).
// - OpponentHand3D: Math.PI (dark face toward camera, because opponents show
//   their inactive side across the table).
export function useFanFlipAnimation(
  cardRefs: React.RefObject<(Group | null)[]>,
  activeSide: "light" | "dark",
  getPositions: () => Array<{ x: number; y: number; z: number }>,
  options: {
    baseY?: number;
    stackDuration?: number;
    flipDuration?: number;
    fanDuration?: number;
  } = {},
) {
  const {
    baseY = 0,
    stackDuration = 0.3,
    flipDuration = 0.5,
    fanDuration = 0.3,
  } = options;

  // `null` = not yet mounted. Lets us detect the first effect run so we
  // can set the initial rotation (the old code seeded this with `activeSide`
  // and therefore skipped the first run entirely).
  const prevSide = useRef<"light" | "dark" | null>(null);
  // Accumulates π each time we flip so repeated flips keep rotating
  // forward (0 → π → 2π → 3π …) rather than bouncing back and forth.
  const flipRotation = useRef(0);
  const isAnimating = useRef(false);

  useEffect(() => {
    const refs = cardRefs.current ?? [];

    // ── First mount ── seed rotation based on activeSide, no animation.
    if (prevSide.current === null) {
      prevSide.current = activeSide;
      flipRotation.current = baseY + (activeSide === "dark" ? Math.PI : 0);
      for (const card of refs) {
        if (card) card.rotation.y = flipRotation.current;
      }
      return;
    }

    // ── Same side, effect re-ran (e.g., a card was drawn) ──
    // Any ref whose rotation.y came from the JSX default (0) needs to be
    // snapped up to the current target so drawn cards don't flash the
    // wrong side while the rest of the hand is flipped.
    if (prevSide.current === activeSide) {
      for (const card of refs) {
        if (card && Math.abs(card.rotation.y - flipRotation.current) > 0.01) {
          card.rotation.y = flipRotation.current;
        }
      }
      return;
    }

    // ── Side change ── run the stack → flip → fan animation.
    if (isAnimating.current) return;

    prevSide.current = activeSide;
    isAnimating.current = true;
    flipRotation.current += Math.PI;

    const positions = getPositions();
    // Stack at the center of this hand's positions (not screen center)
    const midIndex = Math.floor(positions.length / 2);
    const centerX = positions[midIndex]?.x ?? 0;
    const centerZ = positions[midIndex]?.z ?? 0;

    const tl = gsap.timeline({
      onComplete: () => {
        isAnimating.current = false;
      },
    });

    // Phase 1: Fan → Stack (all cards slide to center)
    for (const card of refs) {
      if (!card) continue;
      tl.to(
        card.position,
        {
          x: centerX,
          z: centerZ,
          duration: stackDuration,
          ease: "power2.in",
        },
        0,
      );
    }

    // Phase 2: Flip each card around its own Y axis
    for (const card of refs) {
      if (!card) continue;
      tl.to(
        card.rotation,
        {
          y: flipRotation.current,
          duration: flipDuration,
          ease: "power2.inOut",
        },
        stackDuration,
      );
    }

    // Phase 3: Stack → Fan (cards spread back out)
    for (let i = 0; i < refs.length; i++) {
      const card = refs[i];
      const pos = positions[i];
      if (!card || !pos) continue;
      tl.to(
        card.position,
        {
          x: pos.x,
          z: pos.z,
          duration: fanDuration,
          ease: "power2.out",
        },
        stackDuration + flipDuration,
      );
    }
  }, [
    activeSide,
    cardRefs,
    getPositions,
    baseY,
    stackDuration,
    flipDuration,
    fanDuration,
  ]);
}

// ─── Deal Animation ───
// Cards start at a center point (deck position), then arc out to their
// fan positions one by one with a stagger delay.
export function useDealAnimation(
  cardRefs: React.RefObject<(Group | null)[]>,
  shouldDeal: boolean,
  getPositions: () => Array<{ x: number; y: number; z: number }>,
  options: {
    fromX?: number;
    fromY?: number;
    fromZ?: number;
    cardDuration?: number;
    staggerDelay?: number;
    arcHeight?: number;
  } = {},
) {
  const {
    fromX = 0,
    fromY = 2,
    fromZ = 0,
    cardDuration = 0.4,
    staggerDelay = 0.1,
    arcHeight = 1.5,
  } = options;

  const hasDealt = useRef(false);

  useEffect(() => {
    if (!shouldDeal) {
      hasDealt.current = false;
      return;
    }
    if (hasDealt.current) return;
    hasDealt.current = true;

    const refs = cardRefs.current ?? [];
    const positions = getPositions();

    // Set all cards to starting position (invisible at deck)
    for (const card of refs) {
      if (!card) continue;
      card.position.set(fromX, fromY, fromZ);
      card.scale.set(0.5, 0.5, 0.5);
      card.visible = true;
    }

    // Animate each card to its fan position with stagger
    for (let i = 0; i < refs.length; i++) {
      const card = refs[i];
      const pos = positions[i];
      if (!card || !pos) continue;

      const delay = i * staggerDelay;

      // Start position
      const startX = fromX;
      const startY = fromY;
      const startZ = fromZ;

      // Arc movement using progress proxy
      const progress = { t: 0 };
      gsap.to(progress, {
        t: 1,
        duration: cardDuration,
        delay,
        ease: "power2.out",
        onUpdate: () => {
          if (!card) return;
          const t = progress.t;
          card.position.x = startX + (pos.x - startX) * t;
          card.position.z = startZ + (pos.z - startZ) * t;
          // Arc: lift up then come down
          card.position.y =
            startY + (pos.y - startY) * t + arcHeight * 4 * t * (1 - t);
        },
      });

      // Scale up to full size
      gsap.to(card.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: cardDuration * 0.6,
        delay,
        ease: "power2.out",
      });
    }
  }, [
    shouldDeal,
    cardRefs,
    getPositions,
    fromX,
    fromY,
    fromZ,
    cardDuration,
    staggerDelay,
    arcHeight,
  ]);
}

// ─── Move Animation ───
// Moves an object from current position to target.
// Returns a `moveTo` function.
export function useMoveAnimation(
  ref: React.RefObject<Group | Object3D | null>,
  options: {
    duration?: number;
    ease?: string;
  } = {},
) {
  const { duration = 0.5, ease = "power2.out" } = options;

  const moveTo = useCallback(
    (
      target: { x?: number; y?: number; z?: number },
      overrides?: { duration?: number; ease?: string; onComplete?: () => void },
    ) => {
      if (!ref.current) return;
      gsap.to(ref.current.position, {
        ...target,
        duration: overrides?.duration ?? duration,
        ease: overrides?.ease ?? ease,
        onComplete: overrides?.onComplete,
      });
    },
    [ref, duration, ease],
  );

  return { moveTo };
}

// ─── Arc Move Animation ───
// Moves an object along a curved arc (lifts up in Y mid-flight).
// Good for card dealing / playing animations.
export function useArcMoveAnimation(
  ref: React.RefObject<Group | Object3D | null>,
  options: {
    duration?: number;
    ease?: string;
    arcHeight?: number;
  } = {},
) {
  const { duration = 0.6, ease = "power2.inOut", arcHeight = 2 } = options;

  const arcTo = useCallback(
    (
      target: { x: number; y: number; z: number },
      overrides?: {
        duration?: number;
        arcHeight?: number;
        onComplete?: () => void;
      },
    ) => {
      if (!ref.current) return;

      const start = {
        x: ref.current.position.x,
        y: ref.current.position.y,
        z: ref.current.position.z,
      };

      const h = overrides?.arcHeight ?? arcHeight;
      const d = overrides?.duration ?? duration;
      const progress = { t: 0 };

      gsap.to(progress, {
        t: 1,
        duration: d,
        ease,
        onUpdate: () => {
          if (!ref.current) return;
          const t = progress.t;
          // Linear interpolation for x and z
          ref.current.position.x = start.x + (target.x - start.x) * t;
          ref.current.position.z = start.z + (target.z - start.z) * t;
          // Parabolic arc for y
          ref.current.position.y =
            start.y + (target.y - start.y) * t + h * 4 * t * (1 - t);
        },
        onComplete: overrides?.onComplete,
      });
    },
    [ref, duration, ease, arcHeight],
  );

  return { arcTo };
}

// ─── Scale Pulse Animation ───
// Briefly scales up then back. Good for card selection / UNO call feedback.
export function useScalePulse(
  ref: React.RefObject<Group | Object3D | null>,
  options: {
    scale?: number;
    duration?: number;
  } = {},
) {
  const { scale = 1.2, duration = 0.3 } = options;

  const pulse = useCallback(() => {
    if (!ref.current) return;
    gsap
      .timeline()
      .to(ref.current.scale, {
        x: scale,
        y: scale,
        z: scale,
        duration: duration / 2,
        ease: "power2.out",
      })
      .to(ref.current.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: duration / 2,
        ease: "power2.in",
      });
  }, [ref, scale, duration]);

  return { pulse };
}
