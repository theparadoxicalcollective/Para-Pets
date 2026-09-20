import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { npcNamesMatch } from "@/lib/npcMetadata";

type QuestStatus = "locked" | "available" | "accepted" | "completed" | "claimed";
interface Quest {
  questKey: "catch_fish" | "sell_fish" | "daily_catch_fish";
  title: string;
  description: string;
  targetCount: number;
  progress: number;
  status: QuestStatus;
  coinReward: number;
  rewardItemName: string | null;
  rewardItemQuantity: number;
}
interface JansonState { quests: Quest[]; dailyQuest: Quest; marketUnlocked: boolean }
interface WorldNpc { id: string; name: string; type: string; iconUrl?: string | null }
const API = "/api/quests/janson";
const WORLD = "swamp";

function QuestCard({ quest, busy, onGo, onClaim }: {
  quest: Quest; busy: boolean; onGo: () => void; onClaim: () => void;
}) {
  return <div data-testid={`quest-card-janson-${quest.questKey}`} style={{ border: "1px solid rgba(99,143,73,.52)", borderRadius: 7, padding: 9, background: quest.status === "completed" ? "rgba(120,80,10,.18)" : "rgba(28,76,50,.13)", color: "#492b13", fontFamily: "Lora,serif" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 7, alignItems: "center" }}>
      <div>
        <span style={{ display: "block", fontSize: 7, textTransform: "uppercase", letterSpacing: ".13em" }}>{quest.questKey === "daily_catch_fish" ? "Daily · Janson" : "One-Time · Janson"}</span>
        <strong style={{ fontSize: 11 }}>{quest.title}</strong>
      </div>
      {quest.status === "completed" ? <button type="button" disabled={busy} onClick={onClaim} data-testid={`button-claim-janson-${quest.questKey}`} style={actionStyle}>{busy ? "…" : "CLAIM"}</button>
        : <button type="button" onClick={onGo} data-testid={`button-go-janson-${quest.questKey}`} style={actionStyle}>{quest.status === "available" ? "GO" : "GUIDE"}</button>}
    </div>
    <div style={{ fontSize: 9, marginTop: 4 }}>{quest.description} · {Math.min(quest.progress, quest.targetCount)}/{quest.targetCount}</div>
    {(quest.coinReward > 0 || quest.rewardItemName) && <div style={{ fontSize: 8, marginTop: 3 }}>Reward: {quest.coinReward > 0 ? `${quest.coinReward} coins` : ""}{quest.rewardItemName ? ` ${quest.rewardItemQuantity} × ${quest.rewardItemName}` : ""}</div>}
  </div>;
}

const actionStyle: CSSProperties = { flexShrink: 0, padding: "5px 8px", borderRadius: 6, border: "1px solid #d7b469", background: "#386143", color: "#fff4d8", fontSize: 9, fontWeight: 800, cursor: "pointer" };

export default function JansonQuestOverlay() {
  const [pathname, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [npcMount, setNpcMount] = useState<HTMLElement | null>(null);
  const [questListMount, setQuestListMount] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data: user } = useQuery<{ id: string; isAdmin: boolean } | null>({
    queryKey: ["/api/auth/me"], retry: false, staleTime: 5_000,
    queryFn: async () => {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Session unavailable");
      return response.json();
    },
  });
  const { data: state } = useQuery<JansonState>({
    queryKey: [API], enabled: Boolean(user), staleTime: 2_000, refetchOnWindowFocus: true,
    refetchInterval: query => query.state.data?.quests.some(quest => quest.status === "accepted") || query.state.data?.dailyQuest?.status === "accepted" ? 5_000 : 60_000,
    queryFn: async () => (await apiRequest("GET", API)).json(),
  });
  const inBayou = pathname.startsWith(`/world/${WORLD}`);
  const { data: locations = [] } = useQuery<WorldNpc[]>({
    queryKey: ["/api/world", WORLD, "locations"], enabled: Boolean(user && inBayou), staleTime: 5_000,
    queryFn: async () => {
      const response = await fetch(`/api/world/${WORLD}/locations`, { credentials: "include" });
      return response.ok ? response.json() : [];
    },
  });
  const janson = useMemo(() => locations.find(location => location.type === "npc" && npcNamesMatch(location.name, "Janson")) ?? null, [locations]);

  useEffect(() => {
    if (!inBayou || !janson) { setNpcMount(null); return; }
    const refresh = () => setNpcMount(document.querySelector<HTMLElement>(`[data-testid="location-${janson.id}"]`));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [inBayou, janson?.id]);

  useEffect(() => {
    const refresh = () => {
      const heading = Array.from(document.querySelectorAll("h3")).find(node => node.textContent?.trim() === "QUESTS");
      setQuestListMount(heading?.parentElement?.parentElement?.querySelector<HTMLElement>(".overflow-y-auto") ?? null);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const start = useMutation({
    mutationFn: async (key: Quest["questKey"]) => (await apiRequest("POST", `${API}/${key}/start`, {})).json() as Promise<JansonState>,
    onSuccess: (data, key) => {
      queryClient.setQueryData([API], data);
      setMessage(null);
      if (key === "catch_fish" || key === "daily_catch_fish") {
        setDialogOpen(false);
        if (inBayou) window.dispatchEvent(new Event("para:show-fishing-spots"));
        else navigate(`/world/${WORLD}?fishHint=1`);
      }
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const claim = useMutation({
    mutationFn: async (key: Quest["questKey"]) => (await apiRequest("POST", `${API}/${key}/claim`, {})).json() as Promise<JansonState & { newCoinBalance: number; coinsGranted: number; itemGranted: string | null }>,
    onSuccess: data => {
      queryClient.setQueryData([API], data);
      queryClient.setQueryData(["/api/auth/me"], (current: any) => current ? { ...current, coins: data.newCoinBalance } : current);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setMessage(data.coinsGranted > 0 || data.itemGranted
        ? "Reward claimed!" + (data.coinsGranted > 0 ? " +" + data.coinsGranted + " coins" : "") + (data.itemGranted ? " · " + data.itemGranted : "")
        : "Reward claimed!");
    },
    onError: (error: Error) => setMessage(error.message),
  });

  if (!user || !state) return null;
  const firstTime = state.quests.find(quest => quest.status !== "claimed" && quest.status !== "locked");
  const repeatable = state.marketUnlocked ? state.dailyQuest : null;
  const current = firstTime ?? (repeatable?.status !== "locked" && repeatable?.status !== "claimed" ? repeatable : null);
  // A fresh daily offer belongs to Janson; the log appears only after accepting it.
  const logQuest = firstTime?.status === "accepted" || firstTime?.status === "completed"
    ? firstTime
    : repeatable?.status === "accepted" || repeatable?.status === "completed" ? repeatable : null;
  const openMarket = () => {
    if (!state.marketUnlocked || !inBayou) return;
    setDialogOpen(false);
    window.dispatchEvent(new Event("para:open-fish-market"));
  };
  const onQuestGo = (quest: Quest) => {
    setDialogOpen(false);
    if (quest.questKey === "catch_fish" || quest.questKey === "daily_catch_fish") {
      if (inBayou) window.dispatchEvent(new Event("para:show-fishing-spots"));
      else navigate(`/world/${WORLD}?fishHint=1`);
    } else if (quest.status === "available") navigate(`/world/${WORLD}`);
    else if (state.marketUnlocked && inBayou) openMarket();
    else navigate(`/world/${WORLD}`);
  };

  return <>
    {npcMount && createPortal(
      <button type="button" data-testid="button-talk-janson" aria-label={state.marketUnlocked && repeatable?.status === "claimed" ? "Open Janson's fish market" : "Talk to Janson"}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.preventDefault(); event.stopPropagation(); setMessage(null);
          if (state.marketUnlocked && repeatable?.status === "claimed") openMarket();
          else setDialogOpen(true);
        }}
        style={{ position: "absolute", inset: user.isAdmin ? "-10%" : "4%", zIndex: 32, background: "transparent", border: 0, cursor: "pointer", touchAction: "manipulation" }}>
        <span aria-hidden style={{ position: "absolute", left: "50%", top: "-8%", transform: "translate(-50%,-50%)", display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "50%", background: state.marketUnlocked && repeatable?.status === "claimed" ? "#245a54" : "#775226", border: "2px solid #f6d587", color: "#fff8d4", fontSize: 23, boxShadow: "0 0 15px rgba(255,211,107,.65)", pointerEvents: "none" }}>{state.marketUnlocked && repeatable?.status === "claimed" ? "🐟" : current?.status === "completed" ? "✓" : "!"}</span>
      </button>, npcMount)}
    {questListMount && logQuest && createPortal(<QuestCard quest={logQuest} busy={claim.isPending} onGo={() => onQuestGo(logQuest)} onClaim={() => claim.mutate(logQuest.questKey)} />, questListMount)}
    {dialogOpen && inBayou && <div className="fixed inset-0 z-[2147482000] flex items-center justify-center p-3" style={{ background: "rgba(2,10,7,.82)" }} onClick={() => setDialogOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Janson's fishing quests" data-testid="janson-quest-dialog" onClick={event => event.stopPropagation()}
        style={{ width: "min(94vw,410px)", padding: 18, borderRadius: 18, border: "1px solid rgba(184,219,142,.65)", background: "linear-gradient(#163528,#081b16)", boxShadow: "0 16px 45px #000a", color: "#f5ead0", fontFamily: "Lora,serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {janson?.iconUrl && <img src={janson.iconUrl} alt="" style={{ width: 66, height: 66, objectFit: "contain" }} />}
          <div style={{ flex: 1 }}><strong style={{ color: "#f3d88b", fontSize: 18 }}>Janson</strong>
            <p style={{ fontSize: 12, lineHeight: 1.45, margin: "5px 0" }}>
              {state.quests[0]?.status === "available" ? "The Bayou has plenty of fish. Catch a few and I'll show you the trade." :
                state.quests[0]?.status === "accepted" ? "Try your luck at a fishing spot. Come back when you've caught enough." :
                  state.quests[0]?.status === "completed" ? "Nice catch! Claim Gone Fishing here or in your quest log, then I'll teach you to sell." :
                    state.quests[1]?.status === "available" ? "Ready for the next step? Sell your catch here at the fish market." :
                      state.quests[1]?.status === "accepted" ? "Open my fish market and sell your catch." :
                        state.quests[1]?.status === "completed" ? "Well done! Claim your Sell Fish reward here or in your quest log." :
                        repeatable?.status === "available" ? "Choose today’s Gone Fishing quest, or open the fish market now. You can come back for the quest later today." :
                        repeatable?.status === "accepted" ? "Find a fishing spot and bring back your catch for today's Gone Fishing quest." :
                        repeatable?.status === "completed" ? "Nice work! Claim today's Gone Fishing reward here or in your quest log." :
                        "The fish market is open. Come back tomorrow for another Gone Fishing quest."}
            </p>
          </div>
          <button type="button" aria-label="Close Janson dialog" onClick={() => setDialogOpen(false)} style={{ alignSelf: "flex-start", border: 0, background: "transparent", color: "#fff", fontSize: 24 }}>×</button>
        </div>
        {current?.status === "available" && <button type="button" data-testid={`button-start-janson-${current.questKey}`} disabled={start.isPending} onClick={() => start.mutate(current.questKey)} style={{ ...actionStyle, width: "100%", marginTop: 14, padding: 12 }}>{current.questKey === "catch_fish" || current.questKey === "daily_catch_fish" ? "! Gone Fishing" : "Sell Fish"}</button>}
        {current?.status === "accepted" && (current.questKey === "catch_fish" || current.questKey === "daily_catch_fish") && <button type="button" onClick={() => onQuestGo(current)} style={{ ...actionStyle, width: "100%", marginTop: 14, padding: 12 }}>! Gone Fishing</button>}
        {state.marketUnlocked && <button type="button" data-testid="button-janson-fish-market" onClick={openMarket} style={{ ...actionStyle, width: "100%", marginTop: 14, padding: 12, background: repeatable?.status === "available" ? "#245a54" : actionStyle.background }}>Sell Fish</button>}
        {current?.status === "completed" && <button type="button" data-testid={`button-claim-janson-at-npc-${current.questKey}`} disabled={claim.isPending} onClick={() => claim.mutate(current.questKey)} style={{ ...actionStyle, width: "100%", marginTop: 14, padding: 12 }}>{claim.isPending ? "CLAIMING…" : `CLAIM ${current.title.toUpperCase()} REWARD`}</button>}
        {message && <p role="status" style={{ color: "#ffcb9a", fontSize: 11 }}>{message}</p>}
      </section>
    </div>}
  </>;
}
