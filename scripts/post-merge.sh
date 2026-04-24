#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# DO NOT add destructive database commands here. Specifically: NEVER add
# `npm run db:push`, `db:push --force`, `drizzle-kit push`, or any other
# command that synchronizes the schema file against the live Railway DB.
#
# History: an automatic `db:push` from this script (April 24, 2026) dropped
# the `media_blobs` table along with several runtime tables, destroying
# every shop-item, badge, pet-part, and house-bundle image stored on
# Railway. Restoring from a 20-day-old SQL backup recovered most — but not
# all — of the lost art. Re-introducing automated schema sync here would
# wipe the same data again.
#
# This script is intentionally a no-op. If you genuinely need a step here,
# limit it to additive, idempotent operations (e.g. `npm install`) and get
# explicit user approval before adding anything that touches the database.
# ──────────────────────────────────────────────────────────────────────────────
set -e
exit 0
