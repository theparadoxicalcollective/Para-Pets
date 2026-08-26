export interface PowerUpItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  statBoostType: string | null;
  statBoostAmount: number | null;
  specialType: string | null;
  specialAmount: number | null;
  quantity: number;
}

export interface PetUpgradeModalProps {
  petName: string;
  petImage: string | null;
  petTemplateId: string | null;
  rarity: number;
  petLevel: number;
  petAtk: number;
  petDef: number;
  petHealth: number;
  itemsRemaining: number;
  items: PowerUpItem[];
  isPending: boolean;
  title?: string;
  subtitle?: string;
  showBuyButton?: boolean;
  successEffect?: { type: "stat" | "level" | "hatch"; label: string } | null;
  onUseItem: (item: PowerUpItem) => void;
  onSuccessAnimEnd: () => void;
  onClose: () => void;
}
