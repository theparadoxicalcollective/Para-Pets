# Game Cohesion Report

## Elysian Clearing reconciliation

The current Clearing keeps the natural roaming, curved steering, alert beat, targeting, hit response, healing burst, and special burst introduced in PR #147. Boss progression is layered around that simulation instead of replacing it.

The server counts unique regular defeats and owns the regular → preparing → active lifecycle. At the configured threshold it suppresses ordinary respawns, waits through the warning beat, and permits exactly one configured boss. A completed boss encounter resets progress and creates a fresh regular population. Existing transactional reward/chest idempotency remains the reward boundary.

Audio now uses semantic synthesized cues through the existing shared sound module. Per-event throttling limits repeated combat and pickup polyphony. No second general feedback animation system was added: `ClearingMagicEffect` remains the single Clearing magical-effect primitive.
