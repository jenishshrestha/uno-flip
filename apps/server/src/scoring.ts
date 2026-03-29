import type { ActiveSide, Card } from "@uno-flip/shared";
import { CARD_POINTS } from "@uno-flip/shared";

// ─── Calculate points for cards left in a player's hand ───
// The winner scores points based on what's stuck in OTHER players' hands.
// Uses the active side's value for scoring.
export function calculateHandPoints(
  hand: Card[],
  activeSide: ActiveSide,
): number {
  return hand.reduce((total, card) => {
    const face = activeSide === "light" ? card.light : card.dark;
    return total + (CARD_POINTS[face.value] ?? 0);
  }, 0);
}

// ─── Calculate round scores for all players ───
// Returns points the winner earns from each other player's hand
export function calculateRoundScores(
  hands: Map<string, Card[]>,
  winnerId: string,
  activeSide: ActiveSide,
): Record<string, number> {
  const scores: Record<string, number> = {};

  for (const [playerId, hand] of hands) {
    if (playerId === winnerId) {
      scores[playerId] = 0;
      continue;
    }
    scores[playerId] = calculateHandPoints(hand, activeSide);
  }

  return scores;
}

// ─── Total points the winner earns this round ───
export function totalWinnerPoints(roundScores: Record<string, number>): number {
  return Object.values(roundScores).reduce((sum, pts) => sum + pts, 0);
}
