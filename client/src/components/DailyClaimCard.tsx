import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import chestIcon       from "@assets/generated_images/icon_gift_treasure.png";
import chestOpenedIcon from "@assets/hub_chest_opened.png";
import coinIconImg     from "@assets/icon_coin.png";
import pvpTicketIcon   from "@assets/Photoroom_20260415_83701_PM_1776304592941.png";
import fishingPoleIcon from "@assets/icon_fishing_pole.png";

interface ClaimStatus {
  canClaim: boolean;
  nextClaimAt: string | null;
  lastClaimedAt: string | null;
}

const REWARD_COINS   = 500;
const REWARD_TICKETS = 10;

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
        src={chestOpenedIcon}
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
  onSignInRequest: _onSignInRequest,
}: {
  user: { id: string; isAdmin?: boolean } | null | undefined;
  onSignInRequest?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showBurst, setShowBurst] = useState(false);

  // Hide entirely for logged-out visitors
  if (!user) return null;

  const { data: status } = useQuery<ClaimStatus>({
    queryKey: ["/api/daily-claim/status"],
    enabled: !!user,
    retry: false,
  });

  const claimMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/daily-claim"),
    onSuccess: async (res) => {
      const data = await res.json();
      qc.setQueryData<ClaimStatus>(["/api/daily-claim/status"], {
        canClaim: false,
        lastClaimedAt: data.lastClaimedAt ?? null,
        nextClaimAt: data.nextClaimAt ?? null,
      });
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      setShowBurst(true);
      toast({
        title: "Daily Reward Claimed!",
        description: `+${REWARD_COINS} coins · Basic Fishing Rod · +${REWARD_TICKETS} PvP tickets`,
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
  const activeImg = (claimed || showBurst) ? chestOpenedIcon : chestIcon;

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
                src={coinIconImg}
                alt="Coins"
                className="w-5 h-5 object-contain"
                style={{ filter: "drop-shadow(0 0 4px rgba(255,200,80,0.5))" }}
              />
              <span className="font-fantasy text-[12px]" style={{ color: "#ffd773" }}>
                +{REWARD_COINS}
              </span>
            </div>
            {/* Fishing rod */}
            <div className="flex items-center gap-1" data-testid="reward-fishing-rod">
              <img
                src={fishingPoleIcon}
                alt="Basic Fishing Rod"
                className="w-5 h-5 object-contain"
                style={{ filter: "drop-shadow(0 0 4px rgba(127,191,176,0.45))" }}
              />
              <span className="font-fantasy text-[12px]" style={{ color: "#cfe6dc" }}>
                Rod
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
                +{REWARD_TICKETS}
              </span>
            </div>
          </div>
        </div>

        {/* Claim / countdown */}
        <div className="flex flex-col justify-center flex-shrink-0">
          {canClaim ? (
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
