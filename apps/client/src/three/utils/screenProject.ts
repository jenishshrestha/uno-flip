import { type Camera, Vector3 } from "three";

// Project a screen-space point onto the world Y=0 plane. NDC math
// + ray-to-plane intersect. Used everywhere we anchor a 3D pile/hand
// to a percentage of the viewport.
//
// `ndcX` / `ndcY` are normalized device coords ([-1, 1], Y up).
// Returns world (x, z) on the Y=0 plane.
export function projectNdcToY0(
  camera: Camera,
  ndcX: number,
  ndcY: number,
): { x: number; z: number } {
  const ndc = new Vector3(ndcX, ndcY, 0.5);
  ndc.unproject(camera);
  const dir = ndc.sub(camera.position).normalize();
  // Camera nearly parallel to the ground would divide by ~0; bail out.
  if (Math.abs(dir.y) < 1e-6) return { x: 0, z: 0 };
  const t = -camera.position.y / dir.y;
  const hit = camera.position.clone().add(dir.multiplyScalar(t));
  return { x: hit.x, z: hit.z };
}

// Convenience for the common case: caller passes screen percentages
// (top-left origin, Y down) instead of raw NDC.
export function projectScreenPercentToY0(
  camera: Camera,
  screenLeft: number,
  screenTop: number,
): { x: number; z: number } {
  const ndcX = (screenLeft / 100) * 2 - 1;
  const ndcY = -((screenTop / 100) * 2 - 1);
  return projectNdcToY0(camera, ndcX, ndcY);
}
