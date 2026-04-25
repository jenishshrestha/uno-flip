import type { ActiveSide, Card, CardSide } from "@uno-flip/shared";
import { forwardRef } from "react";
import type { Group } from "three";
import { useCardFaceTexture } from "../hooks/useCardTexture.js";
import { CARD_DEPTH, CARD_HEIGHT, CARD_WIDTH } from "../utils/constants.js";

// ─── Full card (both sides) — used for player hand, dealing, etc. ───
interface FullCardProps {
  card: Card;
  activeSide: ActiveSide;
  position?: [number, number, number];
  rotation?: [number, number, number];
  interactive?: boolean;
  playable?: boolean;
  onClick?: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  // For wild cards on top of the discard pile: paints the wild's 4-color
  // diamond and corner badges in this single hex (UNO Mobile style). Ignored
  // for non-wild cards.
  chosenColorHex?: string;
}

// ─── Single-face card — used for discard top (server only sends CardSide) ───
interface FaceOnlyProps {
  face: CardSide;
  activeSide: ActiveSide;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

type Card3DProps = FullCardProps | FaceOnlyProps;

// BoxGeometry material order: +X, -X, +Y, -Y, +Z (front), -Z (back)
// +Z = light side, -Z = dark side
// When activeSide is "light", light faces camera. When "dark", card is rotated 180°.
export const Card3D = forwardRef<Group, Card3DProps>(
  function Card3D(props, ref) {
    if ("card" in props) {
      return <FullCard ref={ref} {...props} />;
    }
    return <FaceOnlyCard ref={ref} {...props} />;
  },
);

// ─── Full card with both sides ───
const FullCard = forwardRef<Group, FullCardProps>(function FullCard(
  {
    card,
    activeSide,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    interactive = false,
    playable = false,
    onClick,
    onPointerEnter,
    onPointerLeave,
    chosenColorHex,
  },
  ref,
) {
  const lightTexture = useCardFaceTexture(card.light, "light", chosenColorHex);
  const darkTexture = useCardFaceTexture(card.dark, "dark", chosenColorHex);

  return (
    <group ref={ref} position={position} rotation={rotation}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Three.js mesh */}
      <mesh
        castShadow
        onClick={interactive ? onClick : undefined}
        onPointerEnter={interactive ? onPointerEnter : undefined}
        onPointerLeave={interactive ? onPointerLeave : undefined}
        cursor={interactive && playable ? "pointer" : undefined}
      >
        <boxGeometry args={[CARD_WIDTH, CARD_HEIGHT, CARD_DEPTH]} />
        <meshStandardMaterial attach="material-0" transparent opacity={0} />
        <meshStandardMaterial attach="material-1" transparent opacity={0} />
        <meshStandardMaterial attach="material-2" transparent opacity={0} />
        <meshStandardMaterial attach="material-3" transparent opacity={0} />
        {/* +Z = light side */}
        <meshBasicMaterial
          attach="material-4"
          map={lightTexture}
          transparent
          alphaTest={0.5}
        />
        {/* -Z = dark side */}
        <meshBasicMaterial
          attach="material-5"
          map={darkTexture}
          transparent
          alphaTest={0.5}
        />
      </mesh>
    </group>
  );
});

// ─── Single face (for discard top — server only sends the visible CardSide) ───
const FaceOnlyCard = forwardRef<Group, FaceOnlyProps>(function FaceOnlyCard(
  { face, activeSide, position = [0, 0, 0], rotation = [0, 0, 0] },
  ref,
) {
  const faceTexture = useCardFaceTexture(face, activeSide);

  return (
    <group ref={ref} position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[CARD_WIDTH, CARD_HEIGHT, CARD_DEPTH]} />
        <meshStandardMaterial attach="material-0" transparent opacity={0} />
        <meshStandardMaterial attach="material-1" transparent opacity={0} />
        <meshStandardMaterial attach="material-2" transparent opacity={0} />
        <meshStandardMaterial attach="material-3" transparent opacity={0} />
        {/* +Z = visible face */}
        <meshBasicMaterial
          attach="material-4"
          map={faceTexture}
          transparent
          alphaTest={0.5}
        />
        {/* -Z = same face (only one side known) */}
        <meshBasicMaterial
          attach="material-5"
          map={faceTexture}
          transparent
          alphaTest={0.5}
        />
      </mesh>
    </group>
  );
});
