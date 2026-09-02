import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, rewardBundles, userRewards, rewardBundleItems, shopItems } from "@shared/schema";

type WelcomeConfig = { coinAmount: number; message: string; items: { name: string; qty: number }[] };

/** One complete bundle per player, even when signup and login retry together. */
export async function grantWelcomeBundle(userId: string, config: WelcomeConfig): Promise<void> {
  await db.transaction(async tx => {
    const [user] = await tx.select({ sent: users.welcomeV2Sent }).from(users).where(eq(users.id, userId)).for("update");
    if (!user || user.sent) return;
    const [bundle] = await tx.insert(rewardBundles).values({
      name: "Welcome to the Realm!", coinAmount: config.coinAmount, message: config.message,
    }).returning();
    const catalog = await tx.select({ id: shopItems.id, name: shopItems.name }).from(shopItems);
    for (const { name, qty } of config.items) {
      const item = catalog.find(item => item.name.toLowerCase() === name.toLowerCase());
      if (!item) continue;
      for (let i = 0; i < qty; i++) {
        await tx.insert(rewardBundleItems).values({ bundleId: bundle.id, shopItemId: item.id });
      }
    }
    await tx.insert(userRewards).values({ userId, bundleId: bundle.id });
    await tx.update(users).set({ welcomeV2Sent: true }).where(eq(users.id, userId));
  });
}
