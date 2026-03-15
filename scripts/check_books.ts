import { db } from "../server/db";
import { shopItems } from "../shared/schema";
import { eq, count } from "drizzle-orm";

async function main() {
  const total = await db.select({ count: count() }).from(shopItems);
  const powerUp = await db.select({ count: count() }).from(shopItems).where(eq(shopItems.type, "power_up"));
  const books = await db.select({ id: shopItems.id, name: shopItems.name, type: shopItems.type, worldId: shopItems.worldId }).from(shopItems).where(eq(shopItems.type, "power_up"));
  console.log("Total items:", total[0].count);
  console.log("Power-up items:", powerUp[0].count);
  console.log("Books:", JSON.stringify(books, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
