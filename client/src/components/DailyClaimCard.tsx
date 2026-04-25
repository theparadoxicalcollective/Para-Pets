import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import chestIcon from "@assets/generated_images/icon_gift_treasure.png";
import coinIconImg from "@assets/icon_coin.png";
import pvpTicketIcon from "@assets/Photoroom_20260415_83701_PM_1776304592941.png";

interface ClaimStatus {
  canClaim: boolean;
  nextClaimAt: string | null;
  lastClaimedAt: string | null;
}

const REWARD_COINS = 100;
const REWARD_TICKETS = 10;

// Parse PG timestamp strings safely as UTC.
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
          background:
            "radial-gradient(ellipse at center, rgba(127,191,176,0.45) 0%, transparent 70%)",
          width: 320,
          height: 320,
          borderRadius: "50%",
          animation: "burst-expand 1.4s ease-out forwards",
          position: "absolute",
        }}
      />
      <img
        src={chestIcon}
        alt=""
        style={{
          width: 120,
          height: 120,
          objectFit: "contain",
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

  const { data: status } = useQuery<ClaimStatus>({
    queryKey: ["/api/daily-claim/status"],
    enabled: !!user,
    retry: false,
  });

  const claimMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/daily-claim"),
    onSuccess: async (res) => {
      const data = await res.json();
      // Use canonical post-claim status from the server response so the
      // UI flips to countdown instantly (no flash before refetch).
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
        description: `+${REWARD_COINS} coins · +${REWARD_TICKETS} PvP tickets`,
      });
    },
    onError: (err: any) => {
      const msg = err?.message?.includes(":")
        ? err.message.split(": ").slice(1).join(": ")
        : err.message;
      let parsed: any = {};
      try {
        parsed = JSON.parse(msg);
      } catch {}
      toast({
        title: "Cannot Claim",
        description: parsed.message || "Come back later.",
        variant: "destructive",
      });
    },
  });

  const { label: countdownLabel, done } = useCountdown(status?.nextClaimAt ?? null);
  const canClaim = !!user && !!status && (status.canClaim || done);
  const isLoggedOut = !user;

  return (
    <div
      data-testid="card-daily-claim"
      className="rounded-2xl mb-3 overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, rgba(8,40,28,0.92) 0%, rgba(12,55,42,0.88) 60%, rgba(8,30,22,0.92) 100%)",
        border: "1px solid rgba(127,191,176,0.25)",
        boxShadow:
          "0 0 24px rgba(127,191,176,0.12) inset, 0 4px 18px rgba(0,0,0,0.35)",
      }}
    >
      {showBurst && <ClaimBurst onDone={() => setShowBurst(false)} />}

      <div className="flex items-stretch p-3 gap-3">
        {/* Chest icon — no container frame; CSS mask fades the icon's
            dark scene edges into the card so there's no visible box. */}
        <div className="flex-shrink-0" style={{ width: 86, height: 86 }}>
          <img
            src={chestIcon}
            alt="Daily reward chest"
            data-testid="img-daily-chest"
            className="w-full h-full object-contain"
            style={{
              WebkitMaskImage:
                "radial-gradient(circle at 50% 55%, rgba(0,0,0,1) 38%, rgba(0,0,0,0) 72%)",
              maskImage:
                "radial-gradient(circle at 50% 55%, rgba(0,0,0,1) 38%, rgba(0,0,0,0) 72%)",
              filter: canClaim
                ? "drop-shadow(0 0 10px rgba(127,191,176,0.55))"
                : "saturate(0.7) brightness(0.85)",
              transition: "filter 0.4s ease",
            }}
          />
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <p
              className="font-fantasy text-[13px] tracking-wider"
              style={{ color: "#9fdcc9" }}
              data-testid="text-daily-claim-title"
            >
              Daily Reward
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              <div
                className="flex items-center gap-1"
                data-testid="reward-coins"
              >
                <img
                  src={coinIconImg}
                  alt="Coins"
                  className="w-6 h-6 object-contain"
                  style={{ filter: "drop-shadow(0 0 4px rgba(255,200,80,0.5))" }}
                />
                <span
                  className="font-fantasy text-[13px]"
                  style={{ color: "#ffd773" }}
                >
                  +{REWARD_COINS}
                </span>
              </div>
              <div
                className="flex items-center gap-1"
                data-testid="reward-pvp-tickets"
              >
                <img
                  src={pvpTicketIcon}
                  alt="PvP tickets"
                  className="w-7 h-7 object-contain"
                  style={{ filter: "drop-shadow(0 0 4px rgba(127,191,176,0.55))" }}
                />
                <span
                  className="font-fantasy text-[13px]"
                  style={{ color: "#cfe6dc" }}
                >
                  +{REWARD_TICKETS}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Claim / countdown / sign-in */}
        <div className="flex flex-col justify-center flex-shrink-0">
          {isLoggedOut ? (
            <button
              data-testid="button-daily-signin"
              onClick={() => onSignInRequest?.()}
              className="font-fantasy text-[11px] tracking-wider px-3 py-2 rounded-lg"
              style={{
                background:
                  "linear-gradient(135deg, rgba(127,191,176,0.25) 0%, rgba(80,150,135,0.18) 100%)",
                border: "1px solid rgba(127,191,176,0.55)",
                color: "#bfe8d8",
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
                boxShadow: claimMut.isPending
                  ? "none"
                  : "0 0 14px rgba(127,191,176,0.45)",
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
              <p
                className="font-fantasy text-[9px] tracking-wider mb-0.5"
                style={{ color: "#7fbfb0" }}
              >
                NEXT IN
              </p>
              <p
                className="font-fantasy text-[12px]"
                style={{ color: "#cfe6dc" }}
              >
                {countdownLabel || "—"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
