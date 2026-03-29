import type { ActiveSide, Card, CardValue } from "@uno-flip/shared";
import type { DeckState } from "./deck.js";
import { drawCard } from "./deck.js";

// ─── What changed after an action card was played ───
export interface ActionResult {
  skip: boolean; // should the next player be skipped?
  reverse: boolean; // should direction reverse?
  drawCards: number; // how many cards does the next player draw?
  flip: boolean; // should the game flip to the other side?
  needsColorChoice: boolean; // does the player need to pick a color?
}

// ─── Resolve what an action card does ───
export function resolveAction(
  value: CardValue,
  _activeSide: ActiveSide,
): ActionResult {
  const result: ActionResult = {
    skip: false,
    reverse: false,
    drawCards: 0,
    flip: false,
    needsColorChoice: false,
  };

  switch (value) {
    case "skip":
      result.skip = true;
      break;

    case "reverse":
      result.reverse = true;
      break;

    case "draw_one":
      result.skip = true;
      result.drawCards = 1;
      break;

    case "draw_five":
      result.skip = true;
      result.drawCards = 5;
      break;

    case "flip":
      result.flip = true;
      break;

    case "wild":
      result.needsColorChoice = true;
      break;

    case "wild_draw_two":
      result.needsColorChoice = true;
      result.skip = true;
      result.drawCards = 2;
      break;

    case "wild_draw_color":
      result.needsColorChoice = true;
      result.skip = true;
      // drawCards handled separately — draw until they get the chosen color
      result.drawCards = -1; // -1 signals "draw until color"
      break;
  }

  return result;
}

// ─── Force a player to draw N cards from the deck ───
export function forceDrawCards(
  deck: DeckState,
  hand: Card[],
  count: number,
): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    const card = drawCard(deck);
    if (card) {
      hand.push(card);
      drawn.push(card);
    }
  }
  return drawn;
}

// ─── Draw until a specific color is found (Wild Draw Color) ───
export function drawUntilColor(
  deck: DeckState,
  hand: Card[],
  targetColor: string,
  activeSide: ActiveSide,
): Card[] {
  const drawn: Card[] = [];
  // Safety limit to prevent infinite loops
  const maxDraws = 50;

  for (let i = 0; i < maxDraws; i++) {
    const card = drawCard(deck);
    if (!card) break;

    hand.push(card);
    drawn.push(card);

    const face = activeSide === "light" ? card.light : card.dark;
    if (face.color === targetColor) break;
  }

  return drawn;
}
