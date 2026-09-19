import oneStarBorder from "@assets/uploads/1StarBorder.png";
import twoStarBorder from "@assets/uploads/2StarBorder.png";
import threeStarBorder from "@assets/uploads/3StarBorder.png";
import fourStarBorder from "@assets/uploads/4StarBorder.png";
import fiveStarBorder from "@assets/uploads/5StarBorder.png";

export type CardRarity = 1 | 2 | 3 | 4 | 5;
export type CardLayoutField = "name" | "description" | "stars";

export interface CardDefinition {
  id: string;
  name: string;
  description: string;
  secondDescription: string;
  artworkUrl: string;
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
