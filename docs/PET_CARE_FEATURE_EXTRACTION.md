# Pet Care feature extraction

The standalone Pet Care route now imports its care scene from `client/src/features/pet-care/FeedingOverlay.tsx` rather than importing `PetHousePage.tsx`.

## Production build verification

- Pet Care route chunk: `PetCarePage-BElcwEYa.js` (47,169 bytes)
- Pet Care feature chunk: `index-5omz4aQ0.js` (747,395 bytes)
- Pet House route chunk: `PetHousePage-BCHJzWK4.js` (50,889 bytes)

The exact hashed filenames may change between builds. The regression suite enforces the source-level dependency boundary.

## Behavior intentionally unchanged

- Pet Care visuals and responsive layout
- Drag-only edible and gift application
- Inventory stacking and consumption rules
- Pet stats, rewards, endpoints, and cache invalidation
- Safe-mode and iOS recovery behavior
