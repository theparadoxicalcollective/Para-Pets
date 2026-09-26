import oneStarBorder from "@assets/uploads/CB1.png";
import twoStarBorder from "@assets/uploads/CB2.png";
import threeStarBorder from "@assets/uploads/CB3.png";
import fourStarBorder from "@assets/uploads/CB4.png";
import fiveStarBorder from "@assets/uploads/CB5.png";
import type { CardSpecialEffect } from "@shared/cardSpecialEffect";
import type { CardLabel } from "@shared/cardLabel";

export type CardRarity = 1 | 2 | 3 | 4 | 5;
export type CardLayoutField = "name" | "description" | "stars";

export interface CardDefinition {
  id: string;
  name: string;
  description: string;
  secondDescription: string;
  artworkUrl: string;
  effectColor?: string | null;
  specialEffect?: CardSpecialEffect | null;
  label?: CardLabel | null;
  rarity: CardRarity;
  createdAt: string;
  updatedAt: string;
}

export interface CardBorderLayout {
  rarity: CardRarity;
  nameX: number;
  nameY: number;
  nameWidth: number;
  nameHeight: number;
  nameFontSize: number;
  nameCurve?: number;
  descriptionX: number;
  descriptionY: number;
  descriptionWidth: number;
  descriptionHeight: number;
  descriptionFontSize: number;
  starX: number;
  starY: number;
  starWidth: number;
  updatedAt?: string;
}

export const CARD_RARITIES: readonly CardRarity[] = [1, 2, 3, 4, 5];

export const CARD_TITLE_COLORS: Record<CardRarity, string> = {
  1: "#4a4032",
  2: "#4a4032",
  3: "#4a4032",
  4: "#7f5528",
  5: "#7f5528",
};

/** Warm parchment surfaces matched to the blank title/name plaques in the rarity frames. */
export const CARD_BACK_SURFACE_COLORS: Record<CardRarity, string> = {
  1: "#eee4d1",
  2: "#eee4d1",
  3: "#ece3d6",
  4: "#f1e3c8",
  5: "#f3e5c8",
};

export const CARD_BORDER_ASSETS: Record<CardRarity, string> = {
  1: oneStarBorder,
  2: twoStarBorder,
  3: threeStarBorder,
  4: fourStarBorder,
  5: fiveStarBorder,
};

export function defaultCardBorderLayout(rarity: CardRarity): CardBorderLayout {
  return {
    rarity,
    nameX: 13,
    nameY: 6,
    nameWidth: 74,
    nameHeight: 10,
    nameFontSize: 14,
    nameCurve: 0,
    descriptionX: 13,
    descriptionY: 76,
    descriptionWidth: 74,
    descriptionHeight: 16,
    descriptionFontSize: 10,
    starX: 50 - rarity * 3.9,
    starY: 17.4,
    starWidth: rarity * 7.8,
  };
}

export function getCardBorderLayout(
  layouts: readonly CardBorderLayout[] | undefined,
  rarity: CardRarity,
): CardBorderLayout {
  return layouts?.find((layout) => layout.rarity === rarity)
    ?? defaultCardBorderLayout(rarity);
}

export interface OwnedCard extends CardDefinition {
  quantity: number;
  firstRewardClaimed: boolean;
}
export interface CardCollection {
  cards: OwnedCard[];
  totalCards: number;
  layouts: CardBorderLayout[];
}
