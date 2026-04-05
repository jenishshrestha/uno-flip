import { animated, useSpring } from "@react-spring/three";
import type { ActiveSide } from "@uno-flip/shared";

// Flat table surface — a large plane that fills the camera view
// The "table" look comes from the background gradient + a subtle circular indicator
export function Table({ activeSide }: { activeSide: ActiveSide }) {
  const { color } = useSpring({
    color: activeSide === "light" ? "#1a3a2a" : "#2a1a3e",
    config: { tension: 120, friction: 14 },
  });

  const { ringColor } = useSpring({
    ringColor: activeSide === "light" ? "#2a5a3a" : "#3a2a5e",
    config: { tension: 120, friction: 14 },
  });

  return (
    <group>
      {/* Background plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[30, 30]} />
        {/* @ts-expect-error animated color */}
        <animated.meshStandardMaterial
          color={color}
          roughness={0.9}
          metalness={0}
        />
      </mesh>

      {/* Direction circle indicator (like the UNO mobile swirl) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[3.5, 4, 64]} />
        {/* @ts-expect-error animated color */}
        <animated.meshStandardMaterial
          color={ringColor}
          transparent
          opacity={0.2}
          roughness={1}
        />
      </mesh>

      {/* Inner ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[2, 2.3, 64]} />
        {/* @ts-expect-error animated color */}
        <animated.meshStandardMaterial
          color={ringColor}
          transparent
          opacity={0.15}
          roughness={1}
        />
      </mesh>
    </group>
  );
}
