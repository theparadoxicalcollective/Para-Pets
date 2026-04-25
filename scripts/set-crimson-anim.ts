import { db } from "../server/db";
import { petTemplates } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  const matches = await db
    .select({ id: petTemplates.id, name: petTemplates.name, current: petTemplates.animationOverrides })
    .from(petTemplates)
    .where(sql`lower(${petTemplates.name}) = 'crimson dragon'`);

  if (matches.length === 0) {
    console.log("No pet template named 'Crimson Dragon' found.");
    process.exit(1);
  }
  if (matches.length > 1) {
    console.log(`WARNING: ${matches.length} matches found:`, matches.map(m => `${m.name} (${m.id})`).join(", "));
  }

  for (const m of matches) {
    console.log(`BEFORE: ${m.name} (${m.id}) animationOverrides =`, JSON.stringify(m.current));
    await db
      .update(petTemplates)
      .set({ animationOverrides: { idle: { headScalesWithBody: true, mouthBreath: true } } })
      .where(eq(petTemplates.id, m.id));
    const [after] = await db
      .select({ animationOverrides: petTemplates.animationOverrides })
      .from(petTemplates)
      .where(eq(petTemplates.id, m.id));
    console.log(`AFTER:  ${m.name} (${m.id}) animationOverrides =`, JSON.stringify(after?.animationOverrides));
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
