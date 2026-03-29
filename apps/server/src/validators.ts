import type { ActiveSide, Card, CardSide } from "@uno-flip/shared";

// ─── Can this card be played on the current discard top? ───
// Rules:
// 1. Wild cards can always be played
// 2. Same color = playable
// 3. Same value = playable (e.g. red 5 on blue 5)
export function canPlayCard(
  card: Card,
  discardTop: CardSide,
  activeSide: ActiveSide,
  chosenColor: string | null, // color chosen after a wild card
): boolean {
  const cardFace = activeSide === "light" ? card.light : card.dark;

  // Wild cards are always playable
  if (cardFace.color === "wild") {
    return true;
  }

  // Match against chosen color (if a wild was played before)
  const activeColor = chosenColor ?? discardTop.color;

  // Same color
  if (cardFace.color === activeColor) {
    return true;
  }

  // Same value (number or action)
  if (cardFace.value === discardTop.value) {
    return true;
  }

  return false;
}
