import type { ActiveSide, Card, CardValue } from "@uno-flip/shared";
import { getActiveFace } from "@uno-flip/shared";
import type { DeckState } from "./deck.js";
import { drawCard } from "./deck.js";

// ─── What changed after an action card was played ───
export interface ActionResult {
  skip: boolean; // skip the next player
  skipEveryone: boolean; // skip ALL other players (dark side Skip Everyone)
  reverse: boolean;
  drawCards: number; // how many cards the next player draws
  flip: boolean;
  needsColorChoice: boolean;
  isWildDraw: boolean; // true for wild_draw_two / wild_draw_color (challengeable)
}

// ─── Resolve what an action card does ───
export function resolveAction(value: CardValue): ActionResult {
  const result: ActionResult = {
    skip: false,
    skipEveryone: false,
    reverse: false,
    drawCards: 0,
    flip: false,
    needsColorChoice: false,
    isWildDraw: false,
  };

  switch (value) {
    case "skip":
      result.skip = true;
      break;

    case "skip_everyone":
      result.skipEveryone = true;
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
      result.isWildDraw = true;
      result.skip = true;
      result.drawCards = 2;
      break;

    case "wild_draw_color":
      result.needsColorChoice = true;
      result.isWildDraw = true;
      result.skip = true;
      result.drawCards = -1; // -1 = draw until color
      break;
  }

  return result;
}

// ─── Force a player to draw N cards ───
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
  const maxDraws = 50; // safety limit

  for (let i = 0; i < maxDraws; i++) {
    const card = drawCard(deck);
    if (!card) break;

    hand.push(card);
    drawn.push(card);

    const face = getActiveFace(card, activeSide);
    if (face.color === targetColor) break;
  }

  return drawn;
}
