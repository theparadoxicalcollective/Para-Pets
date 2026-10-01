import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import fishCommonIconWp from "@assets/generated_images/icon_fish_common.png";
import fishRodIconWp from "@assets/icon_fishing_pole.png";

interface PondFishEntry {
  id: string;
  locationId: string;
  shopItemId: string;
  createdAt: string;
  item: {
    id: string;
    name: string;
    imageUrl: string | null;
    starRarity: number | null;
  } | null;
}

interface FishingShopItem {
  id: string;
  name: string;
  imageUrl: string | null;
  starRarity: number | null;
  fishingType: string | null;
  type: string;
}

interface PondAdminModalProps {
  locationId: string;
  accent: string;
  onClose: () => void;
}

export default function PondAdminModal({
  locationId,
  accent,
  onClose,
}: PondAdminModalProps) {
  const [showPicker, setShowPicker] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: pondFish = [], isLoading } = useQuery<PondFishEntry[]>({
    queryKey: ["/api/admin/location", locationId, "pond-fish"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/location/${locationId}/pond-fish`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: allFishItems = [] } = useQuery<
    FishingShopItem[],
    Error,
    FishingShopItem[]
  >({
    queryKey: ["/api/admin/shop-items-all"],
    select: (data) =>
      (data as FishingShopItem[]).filter(
        (item) => item.type === "fishing" && item.fishingType === "fish",
      ),
    enabled: showPicker,
  });

  const addMutation = useMutation({
    mutationFn: async (shopItemId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/location/${locationId}/pond-fish`,
        { shopItemId },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/location", locationId, "pond-fish"],
      });
      setShowPicker(false);
      toast({ title: "Fish added", description: "Fish stocked in pond" });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Could not add fish",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (shopItemId: string) => {
      await apiRequest(
        "DELETE",
        `/api/admin/location/${locationId}/pond-fish/${shopItemId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/location", locationId, "pond-fish"],
      });
      toast({ title: "Removed", description: "Fish removed from pond" });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Could not remove fish",
        variant: "destructive",
      });
    },
  });

  const existingIds = new Set(pondFish.map((fish) => fish.shopItemId));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-[90%] max-w-sm rounded-lg overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(8,18,40,0.98) 0%, rgba(15,30,60,0.98) 100%)",
          border: `1px solid ${accent}55`,
          boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
          maxHeight: "calc(75*var(--vh))",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: `1px solid ${accent}25` }}
        >
          <h3
            className="font-fantasy text-sm tracking-widest"
            style={{ color: accent, textShadow: `0 0 10px ${accent}40` }}
          >
            <img
              src={fishRodIconWp}
              alt=""
              style={{
                width: 16,
                height: 16,
                objectFit: "contain",
                display: "inline-block",
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            Pond Stocking
          </h3>
          <button
            data-testid="button-close-pond-admin"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{
              background: `${accent}20`,
              border: `1px solid ${accent}40`,
              color: accent,
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            X
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="text-center py-6">
              <p
                className="font-fantasy text-xs animate-pulse"
                style={{ color: accent }}
              >
                Loading pond...
              </p>
            </div>
          ) : pondFish.length === 0 ? (
            <div className="text-center py-6">
              <img
                src={fishRodIconWp}
                alt=""
                style={{
                  width: 40,
                  height: 40,
                  objectFit: "contain",
                  margin: "0 auto 8px",
                  display: "block",
                  opacity: 0.7,
                }}
              />
              <p
                className="font-fantasy text-xs tracking-wider"
                style={{ color: `${accent}88` }}
              >
                Pond is empty — stock some fish!
              </p>
            </div>
          ) : (
            pondFish.map((entry) => (
              <div
                key={entry.id}
                data-testid={`pond-fish-entry-${entry.id}`}
                className="flex items-center gap-3 p-2 rounded-lg"
                style={{
                  background: `${accent}08`,
                  border: `1px solid ${accent}20`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: `1px solid ${accent}20`,
                  }}
                >
                  {entry.item?.imageUrl ? (
                    <img
                      src={entry.item.imageUrl}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={fishCommonIconWp}
                      alt=""
                      style={{
                        width: 24,
                        height: 24,
                        objectFit: "contain",
                        opacity: 0.6,
                      }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-fantasy text-xs truncate"
                    style={{ color: accent }}
                  >
                    {entry.item?.name || "Unknown Fish"}
                  </p>
                  {entry.item?.starRarity && (
                    <p
                      className="font-fantasy text-[8px]"
                      style={{ color: "#f0c040" }}
                    >
                      {"★".repeat(entry.item.starRarity)}
                    </p>
                  )}
                </div>
                <button
                  data-testid={`button-remove-pond-fish-${entry.shopItemId}`}
                  onClick={() => removeMutation.mutate(entry.shopItemId)}
                  disabled={removeMutation.isPending}
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(220,38,38,0.3)",
                    border: "1px solid rgba(220,38,38,0.4)",
                    cursor: "pointer",
                    color: "#fca5a5",
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div
          className="px-4 pb-4 pt-2 flex-shrink-0"
          style={{ borderTop: `1px solid ${accent}15` }}
        >
          {!showPicker ? (
            <button
              data-testid="button-add-fish-to-pond"
              onClick={() => setShowPicker(true)}
              className="w-full py-2.5 rounded-md font-fantasy text-xs tracking-wider flex items-center justify-center gap-2"
              style={{
                background: `${accent}15`,
                border: `1px solid ${accent}40`,
                color: accent,
                cursor: "pointer",
              }}
            >
              <Plus className="w-4 h-4" /> Add Fish to Pond
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p
                  className="font-fantasy text-[10px] tracking-wider"
                  style={{ color: `${accent}88` }}
                >
                  Select fish to stock:
                </p>
                <button
                  onClick={() => setShowPicker(false)}
                  className="font-fantasy text-[9px]"
                  style={{
                    color: `${accent}60`,
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                  }}
                >
                  Cancel
                </button>
              </div>
              {allFishItems.filter((fish) => !existingIds.has(fish.id)).length ===
              0 ? (
                <p
                  className="font-fantasy text-[10px] text-center py-2"
                  style={{ color: `${accent}60` }}
                >
                  All fish already stocked or none created yet
                </p>
              ) : (
                allFishItems
                  .filter((fish) => !existingIds.has(fish.id))
                  .map((fish) => (
                    <button
                      key={fish.id}
                      data-testid={`button-pick-pond-fish-${fish.id}`}
                      onClick={() => addMutation.mutate(fish.id)}
                      disabled={addMutation.isPending}
                      className="w-full flex items-center gap-2 p-2 rounded-lg disabled:opacity-50 text-left"
                      style={{
                        background: `${accent}08`,
                        border: `1px solid ${accent}20`,
                        cursor: "pointer",
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden"
                        style={{ background: "rgba(0,0,0,0.3)" }}
                      >
                        {fish.imageUrl ? (
                          <img
                            src={fish.imageUrl}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <img
                            src={fishCommonIconWp}
                            alt=""
                            className="w-full h-full object-contain opacity-60"
                          />
                        )}
                      </div>
                      <div>
                        <p
                          className="font-fantasy text-xs"
                          style={{ color: accent }}
                        >
                          {fish.name}
                        </p>
                        {fish.starRarity && (
                          <p
                            className="font-fantasy text-[8px]"
                            style={{ color: "#f0c040" }}
                          >
                            {"★".repeat(fish.starRarity)}
                          </p>
                        )}
                      </div>
                    </button>
                  ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
