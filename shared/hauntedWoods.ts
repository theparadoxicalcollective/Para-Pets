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
