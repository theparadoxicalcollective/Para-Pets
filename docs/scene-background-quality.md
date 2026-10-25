# Scene background upload quality

World/map/location scenery and home exterior/interior still uploads now use
full-colour lossless WebP, bounded to 4096 pixels on the longest side. Images
retain their aspect ratio and are never enlarged. This retains more source
detail for high-density tablets while bounding texture dimensions.

Previously, world/interior still uploads were limited to 2000 pixels and home
exteriors to 3000. The shared `.png({ quality: 90 })` encoder also selected a
reduced-colour palette. Pixel tests reproduce that loss without resizing.
The new encoder follows the existing build optimizer's lossless WebP approach.

Only callers explicitly marked as backgrounds use this path. Icons, shop
thumbnails, decor, pets and other item uploads retain their existing encoding
and dimensions. GIF backgrounds retain their existing animated processing and
per-route size limit. Existing validation, media storage URLs and MIME serving
remain in place.

## Existing artwork and rollout

Deploying this change does not rewrite stored images or production settings.
To benefit, replace a reduced background through its current admin upload
control using the highest-resolution original available. A small image uploaded
again remains small; this change cannot recreate discarded detail.

The bundled main map is 941×1672 and several bundled worlds are 896×1280. Those
source limitations remain. The existing blurred Home camera extensions and map
layout proportions also remain pending a separate visual review. Changing them
without checking artwork and saved placements could alter scene composition.

## Verification

- Real Sharp encode/decode tests check exact RGBA preservation, unchanged small
  dimensions, retention of a 2400×3200 source and proportional bounding of an
  oversized image. Existing Home route tests check background opt-in while
  retaining thumbnail behavior and placement clamps.
- Chromium decoded and displayed the resulting 2400×3200 WebP at phone
  (390×844, DPR 3), tablet (834×1194, DPR 2) and desktop (1440×900, DPR 1) sizes.
  This is an isolated image check, not physical-device or authenticated-game QA.
- App/test type checks and the full automated test suite passed. The production
  build must also pass before merging. Verify a replacement background through
  the admin upload on a live QA profile after deployment; check panning and
  decor/NPC alignment before treating the visual issue as resolved.
