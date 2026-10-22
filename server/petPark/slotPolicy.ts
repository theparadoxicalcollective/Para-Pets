import { PET_PARK_SECOND_SLOT_PRICE, PET_PARK_THIRD_SLOT_PRICE } from "@shared/petParkAccrual";

/** Slot one is free. Only the next consecutive slot can be purchased. */
export function nextPetParkSlotPurchase(unlockedSlots: number, requestedSlot: number):
  | { kind: "already_unlocked"; unlockedSlots: number }
  | { kind: "invalid" }
  | { kind: "purchase"; cost: number; unlockedSlots: number } {
  if (!Number.isInteger(unlockedSlots) || unlockedSlots < 1 || unlockedSlots > 3 ||
      !Number.isInteger(requestedSlot) || requestedSlot < 2 || requestedSlot > 3) return { kind: "invalid" };
  if (requestedSlot <= unlockedSlots) return { kind: "already_unlocked", unlockedSlots };
  if (requestedSlot !== unlockedSlots + 1) return { kind: "invalid" };
  return {
    kind: "purchase",
    cost: requestedSlot === 2 ? PET_PARK_SECOND_SLOT_PRICE : PET_PARK_THIRD_SLOT_PRICE,
    unlockedSlots: requestedSlot,
  };
}
