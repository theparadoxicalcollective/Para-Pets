import { useCallback, useRef, useState } from "react";
import type { WorldLocationData } from "@/components/world/WorldLocations";

/**
 * Shared UI state for opening and closing world locations.
 *
 * This hook owns only location-overlay state. WorldPage still owns the actual
 * overlays, routing, sounds, queries and gameplay so extracting this state
 * cannot change how any world feature works.
 */
export function useWorldLocationUiState() {
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [showLocationView, setShowLocationView] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [fishingLocation, setFishingLocation] = useState<WorldLocationData | null>(null);
  const [showDangerWarning, setShowDangerWarning] = useState(false);
  const [showNoPetMessage, setShowNoPetMessage] = useState(false);
  const shopJustOpened = useRef<number>(0);

  const showFishing = fishingLocation !== null;

  const openFishingLocation = useCallback((location: WorldLocationData) => {
    setShowLocationView(false);
    setShowShop(false);
    setFishingLocation(location);
  }, []);

  const openShopLocation = useCallback(() => {
    setFishingLocation(null);
    setShowLocationView(false);
    setShowShop(true);
    shopJustOpened.current = Date.now();
  }, []);

  const openDangerLocation = useCallback(() => {
    setFishingLocation(null);
    setShowDangerWarning(true);
  }, []);

  const openScenicLocation = useCallback(() => {
    setFishingLocation(null);
    setShowShop(false);
    setShowLocationView(true);
  }, []);

  const showNoPetWarning = useCallback(() => {
    setShowNoPetMessage(true);
  }, []);

  const closeFishingLocation = useCallback(() => {
    setFishingLocation(null);
    setActiveLocationId(null);
  }, []);

  return {
    activeLocationId,
    setActiveLocationId,
    showLocationView,
    setShowLocationView,
    showShop,
    setShowShop,
    fishingLocation,
    setFishingLocation,
    showFishing,
    showDangerWarning,
    setShowDangerWarning,
    showNoPetMessage,
    setShowNoPetMessage,
    shopJustOpened,
    openFishingLocation,
    openShopLocation,
    openDangerLocation,
    openScenicLocation,
    showNoPetWarning,
    closeFishingLocation,
  };
}
