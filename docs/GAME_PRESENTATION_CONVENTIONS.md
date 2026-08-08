# Game Presentation Conventions

## Semantic audio

Gameplay code should request an event by meaning through `playGameSound` rather than create a separate audio system. Short, repeated cues are throttled by semantic event to protect mobile speakers and limit polyphony. Clearing uses attack, hit, pet-damage, heal, special-cast, defeat, boss-warning, boss-defeat, reward, and pickup cues.

## Feedback effects

Clearing-specific magical feedback belongs in `ClearingMagicEffect`. It is CSS-only, honors reduced motion, and has parent-owned cleanup. Add a shared effect component only when at least one non-Clearing feature needs the same visual language; do not maintain parallel effect systems for identical bursts.

## Encounter beats

Important transitions should use a brief readable message and one restrained cue. Presentation may reflect server state but must never originate progression, rewards, or encounter eligibility.
