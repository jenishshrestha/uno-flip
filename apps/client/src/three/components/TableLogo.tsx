import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";

// Logo aspect ratio from the SVG viewBox (632.67 × 425.04)
const LOGO_ASPECT = 632.67 / 425.04;

// Rasterized texture dimensions — large enough to stay crisp when scaled up
const TEX_WIDTH = 1024;
const TEX_HEIGHT = Math.round(TEX_WIDTH / LOGO_ASPECT);

function useLogoTexture(): CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_WIDTH;
    canvas.height = TEX_HEIGHT;
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
      ctx.clearRect(0, 0, TEX_WIDTH, TEX_HEIGHT);
      ctx.drawImage(img, 0, 0, TEX_WIDTH, TEX_HEIGHT);
      texture.needsUpdate = true;
    };
    img.src = "/images/logo.svg";
  }, [texture]);

  return texture;
}

export function TableLogo({
  width = 4,
  opacity = 0.85,
  y = -1.0,
}: {
  width?: number;
  opacity?: number;
  y?: number;
}) {
  const texture = useLogoTexture();
  const height = width / LOGO_ASPECT;

  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}
