/**
 * Sample pet template + demo admin seeder.
 *
 * On a fresh dev database the `pet_templates`, `pet_template_parts`, and
 * `users` tables are all empty. That means /world, the home page, Pet Care,
 * PvP, and the Test Animator have nothing to render — every pet-related
 * surface looks broken until somebody manually builds a template through the
 * admin UI. Seeding a couple of representative templates (one grounded /
 * front-facing and one flying / side-facing) plus a demo admin who already
 * owns them lets any contributor verify pet rendering immediately after
 * cloning the project.
 *
 * Idempotency model (mirrors `seedPvpBots.ts`): every row this seeder
 * inserts uses a deterministic UUID and an `INSERT ... ON CONFLICT DO
 * NOTHING` style guard (we look up by id first, only insert if missing),
 * so it is safe — and cheap — to call on every server boot. We also leave
 * existing data alone if a contributor has manually edited any of these
 * rows: the seeder never updates rows that already exist, with the single
 * exception of (re)setting the demo admin's `activePetId` to the dragon
 * inventory row when it is currently NULL, so /world stays renderable
 * even if the row was accidentally cleared.
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  shopItems,
  petTemplates,
  petTemplateParts,
  userInventory,
} from "@shared/schema";

// ── Deterministic IDs ─────────────────────────────────────────────────────
// Using fixed UUIDs lets us cheaply check "does this row already exist?"
// without relying on name/email lookups (which a contributor might rename).
const SLIME_TEMPLATE_ID    = "00000000-0000-4000-a000-000000000101";
const DRAGON_TEMPLATE_ID   = "00000000-0000-4000-a000-000000000102";
const SLIME_SHOP_ITEM_ID   = "00000000-0000-4000-a000-000000000201";
const DRAGON_SHOP_ITEM_ID  = "00000000-0000-4000-a000-000000000202";
const DEMO_ADMIN_USER_ID   = "00000000-0000-4000-a000-000000000301";
const SLIME_INVENTORY_ID   = "00000000-0000-4000-a000-000000000401";
const DRAGON_INVENTORY_ID  = "00000000-0000-4000-a000-000000000402";

const SLIME_BODY_URL  = "/world-assets/germ_slime.png";
const DRAGON_BODY_URL = "/world-assets/fish_dragon.png";

// Inline SVG wings — keeps the seeder self-contained (no extra image files
// to track) and renders as a soft, semi-transparent ellipse so the wing
// shape is obvious without competing visually with the dragon body.
const wingSvg = (w: number, h: number, fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
      `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 4}" ry="${h / 2 - 4}" ` +
      `fill="${fill}" fill-opacity="0.78" stroke="#3a2a1a" stroke-width="3"/>` +
    `</svg>`
  )}`;

const BACK_WING_URL  = wingSvg(220, 320, "#7a5a32"); // darker — sits behind the body
const FRONT_WING_URL = wingSvg(220, 320, "#c89a55"); // lighter — sits in front

// Pet-template parts. Coordinates are in the editor's 1000x1000 canvas.
type SeedPart = {
  partType: string;
  view: "front" | "back";
  imageUrl: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  zIndex: number;
};

const SLIME_PARTS: SeedPart[] = [
  // Front-facing body — slimes don't have limbs, so one PNG centered in
  // the canvas is enough for the renderer to display + animate (idle bob).
  { partType: "body", view: "front", imageUrl: SLIME_BODY_URL,
    posX: 250, posY: 250, width: 500, height: 500, zIndex: 50 },
  // Side-facing (view="back") body so the grounded template can also be
  // viewed from the side — required by the seeder's done-criteria. Reuses
  // the same PNG since a slime has no real left/right asymmetry.
  { partType: "body", view: "back",  imageUrl: SLIME_BODY_URL,
    posX: 250, posY: 250, width: 500, height: 500, zIndex: 50 },
];

const DRAGON_PARTS: SeedPart[] = [
  // Body sits in the center; wings flank it. The animator layers parts
  // by `LAYER_ORDER` (back_wing < body < front_wing), so we don't need
  // to fight z-index manually for these standard part_type names.
  { partType: "body",         view: "back", imageUrl: DRAGON_BODY_URL,
    posX: 280, posY: 280, width: 440, height: 440, zIndex: 50 },
  { partType: "back_wing",    view: "back", imageUrl: BACK_WING_URL,
    posX: 110, posY: 260, width: 240, height: 340, zIndex: 42 },
  { partType: "back_wing_2",  view: "back", imageUrl: BACK_WING_URL,
    posX: 140, posY: 380, width: 200, height: 280, zIndex: 41 },
  { partType: "front_wing",   view: "back", imageUrl: FRONT_WING_URL,
    posX: 650, posY: 260, width: 240, height: 340, zIndex: 53 },
  { partType: "front_wing_2", view: "back", imageUrl: FRONT_WING_URL,
    posX: 660, posY: 380, width: 200, height: 280, zIndex: 52 },
];

type SeedTemplate = {
  id: string;
  name: string;
  facing: "front" | "back";
  canFly: boolean;
  parts: SeedPart[];
};

const TEMPLATES: SeedTemplate[] = [
  {
    id: SLIME_TEMPLATE_ID,
    name: "Demo Slime",
    facing: "front",
    canFly: false,
    parts: SLIME_PARTS,
  },
  {
    id: DRAGON_TEMPLATE_ID,
    name: "Demo Sky Dragon",
    facing: "back",
    canFly: true,
    parts: DRAGON_PARTS,
  },
];

type SeedShopItem = {
  id: string;
  templateId: string;
  name: string;
  imageUrl: string;
  rarity: number;
};

const SHOP_ITEMS: SeedShopItem[] = [
  { id: SLIME_SHOP_ITEM_ID,  templateId: SLIME_TEMPLATE_ID,
    name: "Demo Slime",      imageUrl: SLIME_BODY_URL,  rarity: 2 },
  { id: DRAGON_SHOP_ITEM_ID, templateId: DRAGON_TEMPLATE_ID,
    name: "Demo Sky Dragon", imageUrl: DRAGON_BODY_URL, rarity: 4 },
];

const DEMO_ADMIN = {
  id: DEMO_ADMIN_USER_ID,
  username: "demo_admin",
  email: "demo_admin@parapets.local",
  // Plain-text password used to derive the bcrypt hash. Document it loudly
  // in the boot log so contributors know how to log in on a fresh DB.
  password: "demo1234",
};

const DEMO_INVENTORY: { id: string; shopItemId: string }[] = [
  { id: SLIME_INVENTORY_ID,  shopItemId: SLIME_SHOP_ITEM_ID  },
  { id: DRAGON_INVENTORY_ID, shopItemId: DRAGON_SHOP_ITEM_ID },
];

/**
 * Idempotently create the demo pet templates, their backing shop items,
 * the demo admin user, and the user_inventory rows that hand the templates
 * to the demo admin so /world has something to render on first boot.
 *
 * Safe to call on every server boot — every step short-circuits if the
 * row already exists. We do NOT update existing rows (so contributor
 * tweaks aren't clobbered) except for restoring `activePetId` if it has
 * been cleared, which keeps the home/world pages from going blank again.
 */
export async function seedSampleTemplates(): Promise<void> {
  // Dev-only seeder. Skip entirely in production so we never create a
  // predictable admin account or sample shop items on a real deploy.
  // Allow an explicit override (`ENABLE_DEV_SAMPLE_SEED=true`) for the
  // rare case a contributor wants to seed a staging environment by hand.
  const isProduction = process.env.NODE_ENV === "production";
  const explicitlyEnabled = process.env.ENABLE_DEV_SAMPLE_SEED === "true";
  if (isProduction && !explicitlyEnabled) {
    console.log("[seedSampleTemplates] skipping: NODE_ENV=production");
    return;
  }

  // 1. Pet templates + parts
  for (const tpl of TEMPLATES) {
    const [existing] = await db
      .select({ id: petTemplates.id })
      .from(petTemplates)
      .where(eq(petTemplates.id, tpl.id))
      .limit(1);

    if (!existing) {
      await db.insert(petTemplates).values({
        id: tpl.id,
        name: tpl.name,
        facing: tpl.facing,
        canFly: tpl.canFly,
      });
      console.log(`[seedSampleTemplates] created template "${tpl.name}"`);
    }

    // Always reconcile parts: insert any (partType, view) combination from
    // the seed definition that doesn't yet exist on this template. We
    // don't UPDATE existing parts (so admin edits via the Pet Database
    // panel are preserved), but we DO add new ones — this lets us extend
    // the seed roster (new wing, new tail, etc.) and have contributors
    // pick them up on the next boot without wiping their database.
    let added = 0;
    for (const part of tpl.parts) {
      const [hasPart] = await db
        .select({ id: petTemplateParts.id })
        .from(petTemplateParts)
        .where(and(
          eq(petTemplateParts.templateId, tpl.id),
          eq(petTemplateParts.partType, part.partType),
          eq(petTemplateParts.view, part.view),
        ))
        .limit(1);
      if (!hasPart) {
        await db.insert(petTemplateParts).values({
          templateId: tpl.id,
          partType: part.partType,
          view: part.view,
          imageUrl: part.imageUrl,
          posX: part.posX,
          posY: part.posY,
          width: part.width,
          height: part.height,
          zIndex: part.zIndex,
        });
        added++;
      }
    }
    if (added > 0) {
      console.log(`[seedSampleTemplates] added ${added} part(s) to "${tpl.name}"`);
    }
  }

  // 2. Shop items that reference each template — required so a pet can sit
  //    in user_inventory (which FKs shop_item_id, not pet_template_id).
  for (const item of SHOP_ITEMS) {
    const [existing] = await db
      .select({ id: shopItems.id })
      .from(shopItems)
      .where(eq(shopItems.id, item.id))
      .limit(1);
    if (!existing) {
      await db.insert(shopItems).values({
        id: item.id,
        name: item.name,
        price: 0,
        type: "pet",
        worldId: "haunted_woods",
        locationId: null,
        imageUrl: item.imageUrl,
        rarity: item.rarity,
        hatchTime: 0,
        eggImageUrl: item.imageUrl,
        hatchedImageUrl: item.imageUrl,
        petTemplateId: item.templateId,
      });
      console.log(`[seedSampleTemplates] created shop item "${item.name}"`);
    }
  }

  // 3. Demo admin user. Password is stable across boots so anyone with the
  //    repo can log in on a brand-new DB. Loud log line on creation so
  //    contributors don't need to dig through code to find the credentials.
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, DEMO_ADMIN.id))
    .limit(1);

  if (!existingUser) {
    // Skip seeding the demo admin if either the username or email is
    // already taken by a real player — refuse to clobber real accounts.
    const [usernameTaken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, DEMO_ADMIN.username))
      .limit(1);
    const [emailTaken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DEMO_ADMIN.email))
      .limit(1);
    if (usernameTaken || emailTaken) {
      console.log(
        `[seedSampleTemplates] demo admin username/email already in use; skipping user + inventory seed`
      );
      return;
    }

    const passwordHash = await bcrypt.hash(DEMO_ADMIN.password, 10);
    await db.insert(users).values({
      id: DEMO_ADMIN.id,
      username: DEMO_ADMIN.username,
      email: DEMO_ADMIN.email,
      password: passwordHash,
      isAdmin: true,
      emailVerified: true,
      coins: 10000,
    });
    console.log(
      `[seedSampleTemplates] created demo admin "${DEMO_ADMIN.username}" (password: ${DEMO_ADMIN.password})`
    );
  }

  // 4. Inventory rows — give the demo admin one of each pet, already
  //    hatched so /world and the home page render them immediately.
  for (const inv of DEMO_INVENTORY) {
    const [existingInv] = await db
      .select({ id: userInventory.id })
      .from(userInventory)
      .where(eq(userInventory.id, inv.id))
      .limit(1);
    if (!existingInv) {
      await db.insert(userInventory).values({
        id: inv.id,
        userId: DEMO_ADMIN.id,
        shopItemId: inv.shopItemId,
        isHatched: true,
      });
    }
  }

  // 5. Active pet — point the demo admin at the flying dragon so the
  //    side-facing renderer + wing animation are exercised on first paint.
  //    Only set it if it's currently NULL so a contributor who switched
  //    their active pet doesn't get reset on every boot.
  const [demoUser] = await db
    .select({ activePetId: users.activePetId })
    .from(users)
    .where(eq(users.id, DEMO_ADMIN.id))
    .limit(1);
  if (demoUser && !demoUser.activePetId) {
    await db
      .update(users)
      .set({ activePetId: DRAGON_INVENTORY_ID })
      .where(eq(users.id, DEMO_ADMIN.id));
  }

  console.log("[seedSampleTemplates] done");
}
