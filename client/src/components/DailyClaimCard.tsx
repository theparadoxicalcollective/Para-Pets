import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { chestAssets } from "@/lib/chestAssets";

import { currencyAssets } from "@/lib/currencyAssets";
import pvpTicketIcon   from "@assets/Photoroom_20260415_83701_PM_1776304592941.png";
import raidTicketIcon  from "@assets/Photoroom_20260714_43330_PM_1784076584992.png";

interface ClaimStatus {
  canClaim: boolean;
  nextClaimAt: string | null;
  lastClaimedAt: string | null;
}

interface DailyRewardItem {
  id: string;
  name: string;
  type: string;
  imageUrl: string | null;
}

interface DailyRewardConfig {
  coinAmount: number;
  essenceAmount: number;
  itemIds: string[];
  items: DailyRewardItem[];
  pvpTickets: number;
  raidTickets: number;
}

const DEFAULT_REWARDS: DailyRewardConfig = {
  coinAmount: 100,
  essenceAmount: 100,
  itemIds: [],
  items: [],
  pvpTickets: 5,
  raidTickets: 5,
};

function parseUtc(ts: string | null): number | null {
  if (!ts) return null;
  const utcStr = /Z|[+-]\d{2}:\d{2}$/.test(ts) ? ts : ts.replace(" ", "T") + "Z";
  return new Date(utcStr).getTime();
}

function useCountdown(nextClaimAt: string | null): { label: string; done: boolean } {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!nextClaimAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [nextClaimAt]);

  const target = parseUtc(nextClaimAt);
  if (target == null) return { label: "", done: true };
  const ms = target - Date.now();
  if (ms <= 0) return { label: "", done: true };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  void tick;
  return { label: `${h}h ${m}m`, done: false };
}

function ClaimBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      className="fixed inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 99999 }}
    >
      <div
        style={{
          background: "radial-gradient(ellipse at center, rgba(127,191,176,0.45) 0%, transparent 70%)",
          width: 320, height: 320, borderRadius: "50%",
          animation: "burst-expand 1.4s ease-out forwards",
          position: "absolute",
        }}
      />
      <img
        src={chestAssets.opened}
        alt=""
        style={{
          width: 120, height: 120, objectFit: "contain",
          animation: "burst-pop 1.4s ease-out forwards",
          filter: "drop-shadow(0 0 30px rgba(127,191,176,0.85))",
          position: "relative",
        }}
      />
    </div>
  );
}

export default function DailyClaimCard({
  user,
  onSignInRequest,
}: {
  user: { id: string; isAdmin?: boolean } | null | undefined;
  onSignInRequest?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showBurst, setShowBurst] = useState(false);

  const { data: configuredRewards } = useQuery<DailyRewardConfig>({
    queryKey: ["/api/daily-claim/config"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/daily-claim/config");
      return response.json();
    },
  });
  const rewards = configuredRewards ?? DEFAULT_REWARDS;

  const dailyStatusKey = ["/api/daily-claim/status", user?.id ?? "guest"] as const;
  const { data: status } = useQuery<ClaimStatus>({
    queryKey: dailyStatusKey,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/daily-claim/status");
      return response.json();
    },
    enabled: !!user,
    retry: false,
  });

  const claimMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/daily-claim"),
    onSuccess: async (res) => {
      const data = await res.json();
      qc.setQueryData<ClaimStatus>(dailyStatusKey, {
        canClaim: false,
        lastClaimedAt: data.lastClaimedAt ?? null,
        nextClaimAt: data.nextClaimAt ?? null,
      });
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      await qc.invalidateQueries({ queryKey: ["/api/pvp/tickets"] });
      setShowBurst(true);

      const pvpGranted = data.pvpTickets ?? 0;
      const raidGranted = data.raidTickets ?? 0;
      const pvpPart = pvpGranted > 0 ? ` · +${pvpGranted} PvP tickets` : " · PvP tickets full (100/100)";
      const raidPart = raidGranted > 0 ? ` · +${raidGranted} Raid tickets` : " · Raid tickets full (25/25)";
      const itemPart = Array.isArray(data.items) && data.items.length > 0
        ? ` · ${data.items.map((item: DailyRewardItem) => item.name).join(" + ")}`
        : "";
      toast({
        title: "Daily Reward Claimed!",
        description: `+${data.coinAmount ?? rewards.coinAmount} coins · +${data.essenceAmount ?? rewards.essenceAmount} essence${itemPart}${pvpPart}${raidPart}`,
      });
    },
    onError: (err: any) => {
      const msg = err?.message?.includes(":")
        ? err.message.split(": ").slice(1).join(": ")
        : err.message;
      let parsed: any = {};
      try { parsed = JSON.parse(msg); } catch {}
      toast({
        title: "Cannot Claim",
        description: parsed.message || "Come back later.",
        variant: "destructive",
      });
    },
  });

  const { label: countdownLabel, done } = useCountdown(status?.nextClaimAt ?? null);
  const canClaim  = !!status && (status.canClaim || done);
  const claimed   = !!status && !status.canClaim && !done;
  const activeImg = (claimed || showBurst) ? chestAssets.opened : chestAssets.closed;

  return (
    <div
      data-testid="card-daily-claim"
      className="rounded-2xl mb-3 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(8,40,28,0.92) 0%, rgba(12,55,42,0.88) 60%, rgba(8,30,22,0.92) 100%)",
        border: "1px solid rgba(127,191,176,0.25)",
        boxShadow: "0 0 24px rgba(127,191,176,0.12) inset, 0 4px 18px rgba(0,0,0,0.35)",
      }}
    >
      {showBurst && <ClaimBurst onDone={() => setShowBurst(false)} />}

      <div className="flex items-stretch p-3 gap-3">
        {/* Chest icon */}
        <div className="flex-shrink-0" style={{ width: 86, height: 86 }}>
          <img
            src={activeImg}
            alt="Daily reward chest"
            data-testid="img-daily-chest"
            className="w-full h-full object-contain"
            style={{
              WebkitMaskImage: "radial-gradient(circle at 50% 55%, rgba(0,0,0,1) 38%, rgba(0,0,0,0) 72%)",
              maskImage: "radial-gradient(circle at 50% 55%, rgba(0,0,0,1) 38%, rgba(0,0,0,0) 72%)",
              filter: canClaim
                ? "drop-shadow(0 0 10px rgba(127,191,176,0.55))"
                : claimed
                  ? "drop-shadow(0 0 6px rgba(127,191,176,0.3)) saturate(0.8) brightness(0.9)"
                  : "saturate(0.7) brightness(0.85)",
              transition: "filter 0.4s ease",
            }}
          />
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-center min-w-0 gap-1">
          <p
            className="font-fantasy text-[13px] tracking-wider"
            style={{ color: "#9fdcc9" }}
            data-testid="text-daily-claim-title"
          >
            Daily Rewards
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Coins */}
            <div className="flex items-center gap-1" data-testid="reward-coins">
              <img
                src={currencyAssets.coin}
                alt="Coins"
                className="w-5 h-5 object-contain"
                style={{ filter: "drop-shadow(0 0 4px rgba(255,200,80,0.5))" }}
              />
              <span className="font-fantasy text-[12px]" style={{ color: "#ffd773" }}>
                +{rewards.coinAmount}
              </span>
            </div>
            {/* Essence */}
            <div className="flex items-center gap-1" data-testid="reward-essence">
              <img
                src={currencyAssets.essenceToken}
                alt="Essence"
                className="w-5 h-5 object-contain"
                style={{ filter: "drop-shadow(0 0 4px rgba(127,191,176,0.55))" }}
              />
              <span className="font-fantasy text-[12px]" style={{ color: "#9fdcc9" }}>
                +{rewards.essenceAmount}
              </span>
            </div>
            {/* PvP tickets */}
            <div className="flex items-center gap-1" data-testid="reward-pvp-tickets">
              <img
                src={pvpTicketIcon}
                alt="PvP tickets"
                className="w-5 h-5 object-contain"
                style={{ filter: "drop-shadow(0 0 4px rgba(127,191,176,0.55))" }}
              />
              <span className="font-fantasy text-[12px]" style={{ color: "#cfe6dc" }}>
                +{rewards.pvpTickets}
              </span>
            </div>
            {/* Raid tickets */}
            <div className="flex items-center gap-1" data-testid="reward-raid-tickets">
              <img
                src={raidTicketIcon}
                alt="Raid tickets"
                className="w-5 h-5 object-contain"
                style={{ filter: "drop-shadow(0 0 4px rgba(240,160,40,0.55))" }}
              />
              <span className="font-fantasy text-[12px]" style={{ color: "#cfe6dc" }}>
                +{rewards.raidTickets}
              </span>
            </div>
            {rewards.items.map((item) => (
              <div key={item.id} className="flex items-center gap-1" data-testid={`reward-item-${item.id}`}>
                {item.imageUrl
                  ? <img src={item.imageUrl} alt={item.name} className="w-5 h-5 object-contain" />
                  : <span aria-hidden className="text-sm">📦</span>}
                <span className="font-fantasy text-[10px] max-w-[72px] truncate" style={{ color: "#e9d5ff" }}>
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Claim / countdown */}
        <div className="flex flex-col justify-center flex-shrink-0">
          {!user ? (
            <button
              data-testid="button-daily-sign-in"
              onClick={() => onSignInRequest?.()}
              className="font-fantasy text-[11px] tracking-wider px-3 py-2 rounded-lg"
              style={{
                background: "linear-gradient(135deg, rgba(127,191,176,0.38) 0%, rgba(60,160,130,0.34) 100%)",
                border: "1px solid rgba(127,191,176,0.62)",
                color: "#ecfff6",
                boxShadow: "0 0 12px rgba(127,191,176,0.3)",
                cursor: "pointer",
              }}
            >
              Sign In
            </button>
          ) : canClaim ? (
            <button
              data-testid="button-daily-claim"
              onClick={() => claimMut.mutate()}
              disabled={claimMut.isPending}
              className="font-fantasy text-[12px] tracking-wider px-4 py-2 rounded-lg"
              style={{
                background: claimMut.isPending
                  ? "rgba(127,191,176,0.18)"
                  : "linear-gradient(135deg, rgba(127,191,176,0.45) 0%, rgba(60,160,130,0.4) 100%)",
                border: "1px solid rgba(127,191,176,0.7)",
                color: "#ecfff6",
                boxShadow: claimMut.isPending ? "none" : "0 0 14px rgba(127,191,176,0.45)",
                cursor: claimMut.isPending ? "wait" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {claimMut.isPending ? "Claiming…" : "Claim"}
            </button>
          ) : (
            <div
              className="text-center px-3 py-2 rounded-lg"
              data-testid="text-daily-countdown"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(127,191,176,0.2)",
                minWidth: 88,
              }}
            >
              <p className="font-fantasy text-[9px] tracking-wider mb-0.5" style={{ color: "#7fbfb0" }}>
                NEXT IN
              </p>
              <p className="font-fantasy text-[12px]" style={{ color: "#cfe6dc" }}>
                {countdownLabel || "—"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
