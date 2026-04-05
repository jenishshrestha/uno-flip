import { useMemo } from "react";
import {
  OPPONENT_ARC_END,
  OPPONENT_ARC_RADIUS_X,
  OPPONENT_ARC_RADIUS_Z,
  OPPONENT_ARC_START,
} from "../utils/constants.js";

export interface SeatPosition {
  x: number;
  y: number;
  z: number;
  angle: number;
}

// Distribute N opponents evenly along an arc at the far side of the table
export function useSeatPositions(count: number): SeatPosition[] {
  return useMemo(() => {
    if (count === 0) return [];

    return Array.from({ length: count }, (_, i) => {
      const angle =
        count === 1
          ? Math.PI * 1.5 // single opponent: top center
          : OPPONENT_ARC_START +
            (i / (count - 1)) * (OPPONENT_ARC_END - OPPONENT_ARC_START);

      return {
        x: Math.cos(angle) * OPPONENT_ARC_RADIUS_X,
        y: 0.15,
        z: Math.sin(angle) * OPPONENT_ARC_RADIUS_Z,
        angle,
      };
    });
  }, [count]);
}
