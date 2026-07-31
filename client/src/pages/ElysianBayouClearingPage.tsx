/**
 * Elysian Bayou Clearing — walk-around explore area.
 *
 * Loads the active pet, builds the location config, and passes everything
 * into the reusable WalkAroundScene component.
 *
 * Combat is enabled only by this location configuration and uses the existing
 * walk-around movement controller.
 */

import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import WalkAroundScene from "@/components/WalkAroundScene";
import type { WalkAroundLocationConfig } from "@/lib/exploreLocations";
import { ELYSIAN_BAYOU_CLEARING_ID } from "@/lib/exploreLocations";
import backgroundUrl from "@assets/uploads/ElysianClearingBackground.jpeg";

// ── Scene configuration ───────────────────────────────────────────────────────
//
// Edit walkableBounds to adjust the safe walking area without touching the
// scene component.  All values are fractions of the scene container (0–1).
//
//   xMin / xMax — left/right boundary
//   yMin / yMax — top/bottom boundary
//
// The background is a portrait bayou path image; the central dirt channel
// supports movement near the visible artwork edges while retaining a small safety inset.

const CLEARING_CONFIG: WalkAroundLocationConfig = {
  id:            ELYSIAN_BAYOU_CLEARING_ID,
  worldId:       "swamp",
  name:          "Elysian Bayou Clearing",
  route:         "/explore/elysian-bayou-clearing",
  backgroundUrl,
  sceneType:     "walk-around",
  showSceneTitle: false,

  walkableBounds: {
    xMin: 0.08,
    xMax: 0.92,
    yMin: 0.05,
    yMax: 0.94,
  },

  // Spawn near the lower-centre of the clearing
  spawnPoint: { x: 0.50, y: 0.70 },

  // Scene-fraction units per second (tweak to make movement feel right)
  movementSpeed: 0.17,

  // Source artwork is 2886×4331. Fit its full height and use a colour-matched
  // edge extension rather than cropping it with cover.
  petSize: 96,
  worldSize: { width: 1, height: 1 },
  aspectLayout: { imageAspect: 2886 / 4331, fit: "height-contain", colorFill: "#18251b", responsivePet: { min: 86, preferredVw: 24, max: 108 } },

  features: {
    movement:     true,
    enemies:      true,
    combat:       true,
    rewards:      true,
    interactions: false,
    // ── Future expansion slots ─────────────────────────────────────────────
    // enemySpawning:         false,
    // petAttackAnimations:   false,
    // hitboxes:              false,
    // healthSystem:          false,
    // enemyWaves:            false,
    // itemDrops:             false,
    // cooldowns:             false,
    // temporaryVisualEffects: false,
  },
};

// ── Page component ────────────────────────────────────────────────────────────

interface ElysianBayouClearingPageProps {
  user: { id: string; activePetId: string | null };
}

export default function ElysianBayouClearingPage({ user }: ElysianBayouClearingPageProps) {
  const [, navigate] = useLocation();

  // Inventory gives us the templateId for the active pet
  const { data: inventory = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
  });

  const activePet = user.activePetId
    ? inventory.find(
        (item: any) =>
          item.inventoryId === user.activePetId &&
          item.type === "pet" &&
          item.isHatched,
      )
    : null;

  const petTemplateId: string | null = activePet?.petTemplateId ?? null;

  const handleBack = () => {
    navigate("/world/swamp");
  };

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ touchAction: "none" }}>
      <WalkAroundScene
        config={CLEARING_CONFIG}
        petTemplateId={petTemplateId}
        activePet={activePet}
        onBack={handleBack}
      />
    </div>
  );
}
