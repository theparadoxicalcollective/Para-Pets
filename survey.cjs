const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const p = new Pool({ connectionString: process.env.RAILWAY_DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  // Pull every item that needs an image
  const queries = [
    { table: "shop_items", col: "image_url", typeCol: "type" },
    { table: "shop_items", col: "egg_image_url", typeCol: "type" },
    { table: "shop_items", col: "hatched_image_url", typeCol: "type" },
    { table: "shop_items", col: "hookless_image_url", typeCol: "type" },
    { table: "badges", col: "image_url", typeCol: null },
    { table: "enemies", col: "image_url", typeCol: null },
    { table: "pet_templates", col: "sleeping_image_url", typeCol: null },
    { table: "pet_template_parts", col: "image_url", typeCol: "part_type" },
    { table: "house_bundles", col: "bg_image_url", typeCol: null },
    { table: "house_bundles", col: "shop_image_url", typeCol: null },
    { table: "location_enemies", col: "image_url", typeCol: null },
    { table: "gifts", col: "item_image_url", typeCol: null },
    { table: "player_market_listings", col: "item_image_url", typeCol: null },
  ];

  for (const q of queries) {
    const typeSel = q.typeCol ? `, ${q.typeCol} AS subtype` : ", NULL AS subtype";
    const r = await p.query(`SELECT id, name${typeSel}, ${q.col} AS url FROM ${q.table} WHERE ${q.col} IS NULL OR ${q.col} LIKE '/api/media/%'`);
    if (r.rows.length === 0) continue;
    const dead = r.rows.filter(x => x.url && x.url.startsWith('/api/media/'));
    const valid = r.rows.filter(x => x.url && x.url.startsWith('/api/media/')).filter(x =>
      r.rows.some(() => false) // placeholder
    );
    console.log(`\n── ${q.table}.${q.col} (${r.rows.length} need image) ──`);
    for (const row of r.rows) {
      const status = row.url ? "DEAD" : "NULL";
      const sub = row.subtype ? ` [${row.subtype}]` : "";
      console.log(`  ${status}  ${(row.name || '(no name)').padEnd(35)}${sub}`);
    }
  }
})().catch(e => console.error(e.message)).finally(() => p.end());
