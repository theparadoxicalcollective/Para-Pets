import type { Express } from "express";

type PublicPetShowcaseStorage = Pick<
  typeof import("../storage").storage,
  "getAllShopItems"
>;

export interface PublicPetShowcaseRouteDependencies {
  storage: PublicPetShowcaseStorage;
}

/**
 * Public Hub pet showcase route.
 *
 * Preserves the existing public access, shop-item filtering/mapping, randomized
 * ordering, response shape, and fixed error message.
 */
export function registerPublicPetShowcaseRoute(
  app: Express,
  { storage }: PublicPetShowcaseRouteDependencies,
): void {
  app.get("/api/public/pets", async (_req, res) => {
    try {
      const allItems = await storage.getAllShopItems();
      const pets = allItems
        .filter((i: any) => i.type === "pet" && i.hatchedImageUrl)
        .map((i: any) => ({
          id: i.id,
          name: i.name,
          imageUrl: i.hatchedImageUrl,
        }))
        .sort(() => Math.random() - 0.5);
      return res.json(pets);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load pets" });
    }
  });
}
