import { db } from "../server/db";
import { petTemplateParts, petTemplates } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [t] = await db.select().from(petTemplates).where(eq(petTemplates.id, 'f23ba65b-9cea-46fd-bc22-765a36f7066b'));
  console.log("Template:", t?.name, "view facing:", t?.facing, "canFly:", t?.canFly);
  const parts = await db.select({
    partType: petTemplateParts.partType,
    view: petTemplateParts.view,
    posX: petTemplateParts.posX,
    posY: petTemplateParts.posY,
    width: petTemplateParts.width,
    height: petTemplateParts.height,
    pivotX: petTemplateParts.pivotX,
    pivotY: petTemplateParts.pivotY,
    zIndex: petTemplateParts.zIndex,
  }).from(petTemplateParts).where(eq(petTemplateParts.templateId, 'f23ba65b-9cea-46fd-bc22-765a36f7066b'));
  console.table(parts);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
