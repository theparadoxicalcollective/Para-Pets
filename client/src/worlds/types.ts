import type { WorldId } from "@shared/worlds/worldRegistry";

export interface WorldPresentation {
  worldId: WorldId;
  shopIcon: string;
  accent: string;
  bgGradient: string;
}

export type ClientWorldDestination =
  | { kind: "route"; route: string }
  | { kind: "notice"; title: string; description: string }
  | { kind: "scenic" };

export interface ClientWorldModule {
  worldId: WorldId;
  presentation: WorldPresentation;
  resolveDestination?: (locationId: string) => ClientWorldDestination | undefined;
}
