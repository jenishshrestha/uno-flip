import { Text } from "@react-three/drei";
import { RigidBody } from "@react-three/rapier";
import { useCardBackTexture } from "../hooks/useCardTexture.js";
import { CARD_DEPTH, CARD_HEIGHT, CARD_WIDTH } from "../utils/constants.js";

// Gap between cards in the stack
const STACK_GAP = CARD_DEPTH + 0.001;

export function DeckPile({
  position,
  count,
  canDraw,
  onDraw,
}: {
  position: [number, number, number];
  count: number;
  canDraw: boolean;
  onDraw: () => void;
}) {
  const backTexture = useCardBackTexture();

  return (
    <group position={position}>
      {/* Each card is a real physics body, stacked and sleeping */}
      {Array.from({ length: count }).map((_, i) => (
        <RigidBody
          // biome-ignore lint/suspicious/noArrayIndexKey: deck cards are identical
          key={i}
          type="dynamic"
          position={[0, i * STACK_GAP + STACK_GAP, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          colliders="cuboid"
          friction={0.3}
          restitution={0.0}
          linearDamping={0.8}
          angularDamping={0.8}
          canSleep
        >
          <mesh castShadow>
            <boxGeometry args={[CARD_WIDTH, CARD_HEIGHT, CARD_DEPTH]} />
            <meshStandardMaterial attach="material-0" transparent opacity={0} />
            <meshStandardMaterial attach="material-1" transparent opacity={0} />
            <meshStandardMaterial attach="material-2" transparent opacity={0} />
            <meshStandardMaterial attach="material-3" transparent opacity={0} />
            <meshPhysicalMaterial
              attach="material-4"
              map={backTexture}
              transparent
              alphaTest={0.5}
              clearcoat={0.2}
              roughness={0.4}
            />
            <meshPhysicalMaterial
              attach="material-5"
              map={backTexture}
              transparent
              alphaTest={0.5}
              clearcoat={0.2}
              roughness={0.4}
            />
          </mesh>
        </RigidBody>
      ))}

      {/* Clickable hit area on top of stack */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Three.js mesh */}
      <mesh
        position={[0, count * STACK_GAP + 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={canDraw ? onDraw : undefined}
        onPointerEnter={
          canDraw
            ? (e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
              }
            : undefined
        }
        onPointerLeave={() => {
          document.body.style.cursor = "default";
        }}
      >
        <planeGeometry args={[CARD_WIDTH, CARD_HEIGHT]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Card count */}
      <Text
        position={[0, 0.01, CARD_HEIGHT / 2 + 0.25]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.2}
        color="#aaaaaa"
        anchorX="center"
        anchorY="top"
      >
        {String(count)}
      </Text>
    </group>
  );
}
