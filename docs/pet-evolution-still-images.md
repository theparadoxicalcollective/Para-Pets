# Evolution still images

In Administration → Add/Edit Pets, **Evo Image** is an optional still PNG upload
next to the egg and hatched images. Admins can preview, replace, or remove it.
Saving other fields preserves the current image. PNG uploads are limited to
20MB and processed through the existing media pipeline (maximum 2000 pixels per
dimension, no enlargement, transparency preserved).

`shop_items.evolution_image_url` stores the processed media URL for the species.
`user_inventory.is_evolved` is a server-owned flag for each individual pet copy;
it defaults to false for existing and newly acquired pets. Neither the catalog
upload nor an inventory request can set a player's evolution flag.

For a hatched pet whose `is_evolved` flag is true, owned-pet reads resolve
`hatchedImageUrl` to the evolution artwork when available. Otherwise, they keep
the normal hatched image and existing generic-image fallback. Eggs, other items,
catalog artwork, and animated template parts retain their existing behavior.
Resolution happens in the shared inventory read used by inventory, pet detail,
profiles, houses, and battle teams; world projections, evolution, and Soul
Exchange reads use the equivalent SQL expression without extra database calls.

## Final evolution integration

The final evolution action currently returns **Evolution Coming Soon**. This PR
does not unlock that action or change feeding, rewards, stats, or parts. Completing
six progress slots alone must not mark a pet evolved.

When the final action is implemented, its server transaction must validate the
owner and final evolution requirements and set `user_inventory.is_evolved = true`
for that inventory ID only, alongside the completed evolution. Refresh the owned
pet queries and world presence after that commit. The still-image readers added
here will then select the uploaded artwork automatically. Animated evolution
parts remain a separate integration.

## Validation

`test/petEvolutionStillImage.test.ts` covers per-copy selection, unchanged eggs
and parts, missing artwork, admin create/edit/remove/preserve behavior, rejected
uploads without catalog writes, and actual PNG processing with transparency.
