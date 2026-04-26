import { getActiveFace } from "./constants/deck.js";
import type { ActiveSide, Card, CardSide } from "./types/card.js";

// ─── Can this card be played on the current discard top? ───
export function canPlayCard(
  card: Card,
  discardTop: CardSide,
  activeSide: ActiveSide,
  chosenColor: string | null,
): boolean {
  const cardFace = getActiveFace(card, activeSide);

  // Wild cards are always playable (but wild draw has restrictions checked separately)
  if (cardFace.color === "wild") {
    return true;
  }

  const activeColor = chosenColor ?? discardTop.color;

  // Same color
  if (cardFace.color === activeColor) {
    return true;
  }

  // Same value (number or action — e.g. skip on skip, reverse on reverse)
  if (cardFace.value === discardTop.value) {
    return true;
  }

  return false;
}

// ─── Can the player legally play a Wild Draw Two / Wild Draw Color? ───
// Official rule: only legal when player has NO cards matching the current discard COLOR.
// Having a matching number/symbol is fine — only color matters.
export function isWildDrawLegal(
  hand: Card[],
  discardTop: CardSide,
  activeSide: ActiveSide,
  chosenColor: string | null,
): boolean {
  const activeColor = chosenColor ?? discardTop.color;

  // If the discard is wild with no chosen color, wild draw is always legal
  if (activeColor === "wild") return true;

  // Check if the player has ANY card matching the active color
  for (const card of hand) {
    const face = getActiveFace(card, activeSide);
    if (face.color === activeColor) {
      return false; // has a matching color — wild draw is ILLEGAL
    }
  }

  return true; // no matching color cards — wild draw is legal
}
