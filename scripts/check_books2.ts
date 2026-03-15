import { db } from "../server/db";
import { shopItems } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const books = await db.select().from(shopItems).where(eq(shopItems.type, "power_up"));
  console.log("Sample book columns:", JSON.stringify(Object.keys(books[0] || {}), null, 2));
  console.log("First book:", JSON.stringify(books[0], null, 2).substring(0, 500));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
