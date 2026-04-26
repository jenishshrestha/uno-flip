import type { Direction } from "@uno-flip/shared";
import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, type Group, SRGBColorSpace } from "three";

// Two identical arrow icons sit at opposite corners of the table logo
// (top-left and bottom-right). The arrow PNG/SVG natively points up-and-to
// the right; we rotate each arrow around the table's vertical axis so the
// pair traces a circular flow:
//
//   Clockwise:        TL rot = 0       BR rot = π
//   Counter-clockwise: TL rot = π      BR rot = 0
//
// On every direction change each arrow animates to its new angle with a
// spring + a brief scale pulse for visual feedback.

const TEX = 256;
const TINT = "#FFD700";

function useArrowTexture(): CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TEX;
    canvas.height = TEX;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, []);

  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.clearRect(0, 0, TEX, TEX);
      ctx.drawImage(img, 0, 0, TEX, TEX);
      // Repaint solid pixels in the gold tint, keep transparency as-is.
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = TINT;
      ctx.fillRect(0, 0, TEX, TEX);
      ctx.globalCompositeOperation = "source-over";
      texture.needsUpdate = true;
    };
    img.src = "/images/top-right-arrow.svg";
  }, [texture]);

  return texture;
}

function Arrow({
  position,
  rotationY,
  flipX,
  size,
  texture,
  opacity,
}: {
  position: [number, number, number];
  rotationY: number;
  flipX: boolean;
  size: number;
  texture: CanvasTexture;
  opacity: number;
}) {
  // Outer group spins on Y to control which way the arrow points; inner
  // mesh has the fixed -π/2 X rotation that lays the plane flat on the
  // table. A separate flipRef applies horizontal mirroring (scale.x = -1)
  // independently of the spin so we can animate both transforms.
  //
  // We deliberately DO NOT pass rotation / scale as JSX props on the spin
  // and flip groups — if we did, R3F would sync the new value to the
  // object on every re-render, and GSAP would end up animating from the
  // target to itself (zero movement). Instead we snap on first mount and
  // tween on subsequent prop changes via refs.
  const spinRef = useRef<Group>(null);
  const flipRef = useRef<Group>(null);
  const lastRotationY = useRef<number | null>(null);
  const lastFlipX = useRef<boolean | null>(null);

  useEffect(() => {
    const obj = spinRef.current;
    if (!obj) return;
    if (lastRotationY.current === null) {
      obj.rotation.y = rotationY;
      lastRotationY.current = rotationY;
      return;
    }
    if (lastRotationY.current === rotationY) return;
    lastRotationY.current = rotationY;
    gsap.to(obj.rotation, {
      y: rotationY,
      duration: 0.55,
      ease: "back.inOut(1.6)",
    });
    gsap.fromTo(
      obj.scale,
      { x: 1, y: 1, z: 1 },
      {
        x: 1.18,
        y: 1.18,
        z: 1.18,
        duration: 0.25,
        yoyo: true,
        repeat: 1,
        ease: "power2.inOut",
      },
    );
  }, [rotationY]);

  useEffect(() => {
    const obj = flipRef.current;
    if (!obj) return;
    const target = flipX ? -1 : 1;
    if (lastFlipX.current === null) {
      obj.scale.x = target;
      lastFlipX.current = flipX;
      return;
    }
    if (lastFlipX.current === flipX) return;
    lastFlipX.current = flipX;
    gsap.to(obj.scale, {
      x: target,
      duration: 0.45,
      ease: "back.inOut(1.6)",
    });
  }, [flipX]);

  return (
    <group position={position}>
      <group ref={spinRef}>
        <group ref={flipRef}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[size, size]} />
            <meshBasicMaterial
              map={texture}
              transparent
              opacity={opacity}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function TableDirection({
  direction,
  // Logo footprint is roughly 4 × 2.7 world units centered on the origin.
  // Place each arrow just outside the corner.
  cornerOffsetX = 2.4,
  cornerOffsetZ = 1.6,
  size = 1.4,
  y = -0.98,
  opacity = 0.8,
}: {
  direction: Direction;
  cornerOffsetX?: number;
  cornerOffsetZ?: number;
  size?: number;
  y?: number;
  opacity?: number;
}) {
  const texture = useArrowTexture();
  const isClockwise = direction === "clockwise";

  // Camera at (0, 12, 3) looking at origin: -Z is "top of screen", +X is
  // "right of screen". Top-left of the logo on screen = (-X, -Z).
  const topLeftPos: [number, number, number] = [-cornerOffsetX, y, -cornerOffsetZ];
  const bottomRightPos: [number, number, number] = [cornerOffsetX, y, cornerOffsetZ];

  // CCW state uses Figma-derived transform: flip horizontally + rotate -150°.
  // CW state stays at the natural arrow orientation per corner.
  const ccwRotationY = (-150 * Math.PI) / 180;

  return (
    <>
      <Arrow
        position={topLeftPos}
        rotationY={isClockwise ? 0 : ccwRotationY}
        flipX={!isClockwise}
        size={size}
        texture={texture}
        opacity={opacity}
      />
      <Arrow
        position={bottomRightPos}
        rotationY={isClockwise ? Math.PI : ccwRotationY}
        flipX={!isClockwise}
        size={size}
        texture={texture}
        opacity={opacity}
      />
    </>
  );
}
