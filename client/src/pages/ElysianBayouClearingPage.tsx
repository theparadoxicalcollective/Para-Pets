/**
 * Elysian Bayou Clearing — walk-around explore area.
 *
 * Loads the active pet, builds the location config, and passes everything
 * into the reusable WalkAroundScene component.
 *
 * Future: add enemy spawning, combat, item drops, and rewards here by
 * extending the config.features and adding handlers to WalkAroundScene.
 */

import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import WalkAroundScene from "@/components/WalkAroundScene";
import type { WalkAroundLocationConfig } from "@/lib/exploreLocations";
import { ELYSIAN_BAYOU_CLEARING_ID } from "@/lib/exploreLocations";
import backgroundUrl from "@assets/worlds/elysian-bayou/elysian-bayou-clearing/background.jpg";

// ── Scene configuration ───────────────────────────────────────────────────────
//
// Edit walkableBounds to adjust the safe walking area without touching the
// scene component.  All values are fractions of the scene container (0–1).
//
//   xMin / xMax — left/right boundary
//   yMin / yMax — top/bottom boundary
//
// The background is a portrait bayou path image; the central dirt channel
// runs vertically through roughly x 0.18–0.82, y 0.08–0.90.

const CLEARING_CONFIG: WalkAroundLocationConfig = {
  id:            ELYSIAN_BAYOU_CLEARING_ID,
  worldId:       "swamp",
  name:          "Elysian Bayou Clearing",
  route:         "/explore/elysian-bayou-clearing",
  backgroundUrl,
  sceneType:     "walk-around",

  walkableBounds: {
    xMin: 0.18,
    xMax: 0.82,
    yMin: 0.08,
    yMax: 0.90,
  },

  // Spawn near the lower-centre of the clearing
  spawnPoint: { x: 0.50, y: 0.70 },

  // Scene-fraction units per second (tweak to make movement feel right)
  movementSpeed: 0.26,

  features: {
    movement:     true,
    // ── Not yet implemented ───────────────────────────────────────────────
    enemies:      false,
    combat:       false,
    rewards:      false,
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
        onBack={handleBack}
      />
    </div>
  );
}
