import type { PublicPlayer } from "@uno-flip/shared";
import { useSeatPositions } from "../hooks/useSeatPositions.js";
import { OpponentHand3D } from "./OpponentHand3D.js";

export function OpponentsRing({
  opponents,
  currentPlayerId,
}: {
  opponents: PublicPlayer[];
  currentPlayerId: string | undefined;
}) {
  const seats = useSeatPositions(opponents.length);

  return (
    <group>
      {opponents.map((opp, i) => {
        const seat = seats[i];
        if (!seat) return null;
        return (
          <OpponentHand3D
            key={opp.id}
            player={opp}
            seat={seat}
            isCurrent={opp.id === currentPlayerId}
          />
        );
      })}
    </group>
  );
}
