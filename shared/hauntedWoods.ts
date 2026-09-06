export const HAUNTED_WOODS_WORLD_ID = "haunted_woods";

export const LEGACY_SOUL_POND_LOCATION_ID = "e2f3a4b5-0003-4000-8000-000000000003";

export const SOUL_EXCHANGE_LOCATION = {
  id: "e2f3a4b5-0010-4000-8000-000000000010",
  worldId: HAUNTED_WOODS_WORLD_ID,
  name: "The Soul Exchange",
  type: "landmark",
  description:
    "A violet threshold where wandering souls gather. The Exchange is quiet for now, but its deeper purpose will be revealed later.",
  defaultPosition: { x: 50, y: 56 },
  defaultIconSize: 300,
  defaultSortOrder: 10,
  glowColor: "#8b5cf6",
  iconAssetPath: "worlds/haunted_woods/soul-exchange-portal-v4.svg",
  backgroundAssetPath: "worlds/haunted_woods/soul-exchange-background.jpg",
} as const;

export const HAUNTED_WOODS_FISHING_SPOTS = [
  {
    id: "e2f3a4b5-0011-4000-8000-000000000011",
    worldId: HAUNTED_WOODS_WORLD_ID,
    name: "Wraithwater Fishing Spot",
    type: "fishing",
    description: "A still stretch of black water where pale ripples move beneath the fog.",
    defaultPosition: { x: 18, y: 72 },
    defaultIconSize: 240,
    defaultSortOrder: 20,
    glowColor: "#6d5bd0",
  },
  {
    id: "e2f3a4b5-0012-4000-8000-000000000012",
    worldId: HAUNTED_WOODS_WORLD_ID,
    name: "Moonveil Fishing Spot",
    type: "fishing",
    description: "A moonlit pocket of haunted water tucked beneath the shadowed trees.",
    defaultPosition: { x: 76, y: 74 },
    defaultIconSize: 240,
    defaultSortOrder: 21,
    glowColor: "#5277b8",
  },
] as const;
