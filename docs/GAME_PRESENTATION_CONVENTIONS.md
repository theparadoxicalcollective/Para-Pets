# Para Pets game-feel language

Para Pets uses semantic feedback consistently while allowing each world to retain its theme.

- **Healing:** green glow and rising sparkles with a soft positive cue.
- **Special/powerful action:** gold sparkle or burst, stronger impact, and a distinct magical cue.
- **Damage:** brief recoil/flash, restrained red or amber accent, and a short impact cue.
- **Success/reward:** warm gold pop and chime. Rare rewards use a richer, slightly longer version without blocking play.
- **Failure:** short low cue and restrained pulse or shake.
- **Interaction:** immediate pressed state and a quiet tap; animation never delays the action.
- **Level/power up:** the same gold success language at a larger, still mobile-safe intensity.

Sound is supplemental. Important state always remains visible. Repeated semantic sounds are throttled, effects are short-lived, and reduced-motion mode replaces movement with static glow/fade feedback.

## Clearing encounter lifecycle

Clearing threat is authoritative in the in-memory server session. Ten confirmed, uniquely rewarded regular defeats prepare one configured boss. During the 1.5-second warning, regular enemies are removed and the server rejects early boss attacks. A confirmed boss reward resets progress and resumes regular play. Existing transaction claim keys prevent duplicate rewards.

Leaving deletes the current session, so preparation or an active boss is safely abandoned without completion. Re-entry starts a fresh session. Player defeat does not call a completion or reset endpoint; the encounter remains only until the player leaves and session cleanup runs. Expired sessions reject combat and cannot grant completion.
