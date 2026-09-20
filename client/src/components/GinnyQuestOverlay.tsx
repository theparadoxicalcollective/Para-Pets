import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const GINNY_WORLD_ID = "haunted_woods";
const GUIDE_STORAGE_KEY = "para:ginny-mini-pet-guide";

interface AuthUser {
  id: string;
  isAdmin?: boolean;
  coins?: number;
}

interface GinnyQuestOption {
  choice: "bat" | "ghost";
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  rarity: number;
}

interface GinnyQuestState {
  key: string;
  worldId: string;
  npcName: string;
  title: string;
  description: string;
  rewardCoins: number;
  status: "available" | "accepted" | "completed" | "claimed";
  options: GinnyQuestOption[];
  selected: GinnyQuestOption | null;
  miniPetInventoryId: string | null;
  activePetId: string | null;
  activePetIsHatched: boolean;
  canEquipNow: boolean;
}

interface WorldLocationRow {
  id: string;
  worldId: string;
  name: string;
  type: string;
  iconUrl: string | null;
}

interface GuideTarget {
  element: HTMLElement;
  label: string;
  detail: string;
}

function isGinnyName(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized === "ginny" || normalized.startsWith("ginny ");
}

function isVisible(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none"
    && style.visibility !== "hidden"
    && style.pointerEvents !== "none"
    && Number(style.opacity || "1") > 0.08
    && rect.width > 2
    && rect.height > 2;
}

function findGuideTarget(pathname: string, miniPetInventoryId: string | null): GuideTarget | null {
  if (pathname.startsWith(`/world/${GINNY_WORLD_ID}`)) {
    const homeButton = document.querySelector<HTMLElement>('[data-testid="nav-item-home"]');
    if (isVisible(homeButton)) {
      return { element: homeButton, label: "Tap Main", detail: "Go to your active pet." };
    }
    const navButton = document.querySelector<HTMLElement>('[data-testid="button-floating-nav"]');
    if (isVisible(navButton)) {
      return { element: navButton, label: "Open the menu", detail: "Ginny will guide you from here." };
    }
  }

  if (pathname === "/" || pathname === "") {
    const closetButton = document.querySelector<HTMLElement>('[data-testid="button-action-equip-accessories"]');
    if (isVisible(closetButton)) {
      return { element: closetButton, label: "Open The Closet", detail: "Mini Pets are equipped from your pet's Closet." };
    }
    const petButton = document.querySelector<HTMLElement>('[data-testid="button-open-pet-actions"]');
    if (isVisible(petButton)) {
      return { element: petButton, label: "Tap your active pet", detail: "Open your pet's action wheel." };
    }
  }

  if (pathname.startsWith("/equip-accessories")) {
    if (miniPetInventoryId) {
      const selectedOption = document.querySelector<HTMLElement>(`[data-testid="mini-pet-option-${CSS.escape(miniPetInventoryId)}"]`);
      if (isVisible(selectedOption)) {
        return { element: selectedOption, label: "Equip your Mini Pet", detail: "Tap the companion Ginny gave you." };
      }
    }
    const openMiniPets = document.querySelector<HTMLElement>('[data-testid="button-open-mini-pets"]');
    if (isVisible(openMiniPets)) {
      return { element: openMiniPets, label: "Open Mini Pets", detail: "Your new companion is waiting here." };
    }
  }

  return null;
}

function GuideHighlight({ target }: { target: GuideTarget | null }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(target.element.getBoundingClientRect()));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target.element);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [target]);

  if (!target || !rect) return null;
  const pad = Math.max(8, Math.min(16, Math.min(rect.width, rect.height) * 0.16));
  const left = Math.max(6, rect.left - pad);
  const top = Math.max(6, rect.top - pad);
  const width = Math.min(window.innerWidth - left - 6, rect.width + pad * 2);
  const height = rect.height + pad * 2;
  const tooltipWidth = Math.min(260, Math.max(190, window.innerWidth - 24));
  const preferAbove = top > 126;
  const tooltipTop = preferAbove
    ? Math.max(8, top - 84)
    : Math.min(window.innerHeight - 82, top + height + 12);
  const tooltipLeft = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, left + width / 2 - tooltipWidth / 2));

  return (
    <div className="ginny-guide-layer" aria-live="polite">
      <div
        data-testid="ginny-guide-highlight"
        style={{
          position: "fixed", left, top, width, height, borderRadius: Math.min(28, Math.max(14, height * 0.28)),
          border: "3px solid rgba(255,220,105,.98)",
          boxShadow: "0 0 0 5px rgba(255,209,74,.18),0 0 24px rgba(255,201,60,.86),inset 0 0 18px rgba(255,226,130,.18)",
          pointerEvents: "none", zIndex: 2147483000,
        }}
      />
      <div
        data-testid="ginny-guide-copy"
        style={{
          position: "fixed", left: tooltipLeft, top: tooltipTop, width: tooltipWidth,
          borderRadius: 14, padding: "9px 12px", textAlign: "center",
          background: "rgba(12,8,18,.96)", border: "1px solid rgba(255,213,92,.72)",
          boxShadow: "0 10px 30px rgba(0,0,0,.72),0 0 16px rgba(245,190,60,.2)",
          color: "#fff3c4", pointerEvents: "none", zIndex: 2147483001,
          fontFamily: "Lora, serif",
        }}
      >
        <strong style={{ display: "block", fontSize: 12, letterSpacing: ".08em", color: "#ffe083" }}>{target.label}</strong>
        <span style={{ display: "block", marginTop: 3, fontSize: 10, lineHeight: 1.35, color: "rgba(255,244,218,.78)" }}>{target.detail}</span>
        <span className="ginny-guide-arrow" aria-hidden style={{ display: "block", fontSize: 22, lineHeight: .85, marginTop: 3 }}>↓</span>
      </div>
    </div>
  );
}

function GinnyQuestCard({
  state,
  busy,
  message,
  onGo,
  onResume,
  onClaim,
}: {
  state: GinnyQuestState;
  busy: boolean;
  message: string | null;
  onGo: () => void;
  onResume: () => void;
  onClaim: () => void;
}) {
  const statusCopy = state.status === "available"
    ? "Find Ginny in Haunted Woods and choose either the Bat or Ghost Mini Pet."
    : state.status === "accepted"
      ? `Equip ${state.selected?.name ?? "the Mini Pet"} to your active pet.`
      : state.status === "completed"
        ? "Mini Pet equipped! Your reward is ready to claim."
        : "Completed — Ginny's companion is now part of your journey.";

  return (
    <div
      data-testid="quest-card-ginny-mini-pet"
      style={{
        position: "relative", borderRadius: 7, padding: 9, overflow: "hidden",
        background: state.status === "completed" ? "rgba(110,76,8,.2)" : state.status === "claimed" ? "rgba(28,35,20,.13)" : "rgba(66,35,78,.12)",
        border: state.status === "completed" ? "1px solid rgba(212,160,23,.7)" : "1px solid rgba(112,74,135,.34)",
        boxShadow: state.status === "completed" ? "0 0 12px rgba(212,160,23,.18)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ display: "inline-block", fontFamily: "Lora,serif", fontSize: 7, textTransform: "uppercase", letterSpacing: ".14em", color: "#5f3d15", border: "1px solid rgba(98,65,27,.3)", borderRadius: 4, padding: "1px 4px" }}>One-Time</span>
          <div style={{ marginTop: 2, fontFamily: "Lora,serif", fontSize: 11, fontWeight: 800, color: "#2a1000", lineHeight: 1.15 }}>Ginny's Little Companion</div>
        </div>
        {state.status === "available" && <button data-testid="button-ginny-quest-go" onClick={onGo} style={questActionStyle("#315f2b")}>GO</button>}
        {state.status === "accepted" && <button data-testid="button-ginny-quest-guide" onClick={onResume} style={questActionStyle("#4d3970")}>GUIDE</button>}
        {state.status === "completed" && <button data-testid="button-ginny-quest-claim" disabled={busy} onClick={onClaim} style={questActionStyle("#946300")}>{busy ? "…" : "CLAIM 500"}</button>}
        {state.status === "claimed" && <span style={{ fontFamily: "Lora,serif", fontSize: 9, fontWeight: 700, color: "#56723e", whiteSpace: "nowrap" }}>✓ Done</span>}
      </div>
      <p style={{ margin: "5px 0 0", fontFamily: "Lora,serif", fontSize: 9.5, lineHeight: 1.35, color: "#5a2e0a" }}>{statusCopy}</p>
      <p style={{ margin: "3px 0 0", fontFamily: "Lora,serif", fontSize: 8.5, color: "#6a3a10" }}>Reward: 500 coins</p>
      {message && <p role="status" style={{ margin: "4px 0 0", fontFamily: "Lora,serif", fontSize: 8.5, color: "#7d3d20" }}>{message}</p>}
    </div>
  );
}

function questActionStyle(background: string): React.CSSProperties {
  return {
    flexShrink: 0, borderRadius: 5, padding: "4px 7px", border: "1px solid rgba(240,192,64,.58)",
    background, color: "#fff7de", fontFamily: "Lora,serif", fontSize: 8, fontWeight: 800,
    letterSpacing: ".08em", cursor: "pointer", boxShadow: "0 0 7px rgba(212,160,23,.25)",
  };
}

export default function GinnyQuestOverlay() {
  const [pathname, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [guideActive, setGuideActive] = useState(() => {
    try { return sessionStorage.getItem(GUIDE_STORAGE_KEY) === "1"; } catch { return false; }
  });
  const [guideTarget, setGuideTarget] = useState<GuideTarget | null>(null);
  const [ginnyMount, setGinnyMount] = useState<HTMLElement | null>(null);
  const [questListMount, setQuestListMount] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [completeNotice, setCompleteNotice] = useState(false);
  const previousStatus = useRef<GinnyQuestState["status"] | null>(null);

  const { data: user } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5_000,
    queryFn: async () => {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Could not verify session");
      return response.json();
    },
  });

  const { data: state } = useQuery<GinnyQuestState>({
    queryKey: ["/api/quests/ginny-mini-pet"],
    enabled: Boolean(user),
    staleTime: 1_000,
    refetchOnWindowFocus: true,
    refetchInterval: query => query.state.data?.status === "accepted" ? 1500 : false,
    queryFn: async () => (await apiRequest("GET", "/api/quests/ginny-mini-pet")).json(),
  });

  const inGinnyWorld = pathname.startsWith(`/world/${GINNY_WORLD_ID}`);
  const { data: hauntedLocations = [] } = useQuery<WorldLocationRow[]>({
    queryKey: ["/api/world", GINNY_WORLD_ID, "locations"],
    enabled: Boolean(user && inGinnyWorld),
    staleTime: 5_000,
    queryFn: async () => {
      const response = await fetch(`/api/world/${GINNY_WORLD_ID}/locations`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const ginnyLocation = useMemo(
    () => hauntedLocations.find(location => location.type === "npc" && isGinnyName(location.name)) ?? null,
    [hauntedLocations],
  );

  useEffect(() => {
    if (!inGinnyWorld || !ginnyLocation) {
      setGinnyMount(null);
      return;
    }
    const findMount = () => setGinnyMount(document.querySelector<HTMLElement>(`[data-testid="location-${ginnyLocation.id}"]`));
    findMount();
    const observer = new MutationObserver(findMount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [inGinnyWorld, ginnyLocation?.id]);

  useEffect(() => {
    const findQuestList = () => {
      const heading = Array.from(document.querySelectorAll("h3")).find(node => node.textContent?.trim() === "QUESTS");
      const contentRoot = heading?.parentElement?.parentElement;
      setQuestListMount(contentRoot?.querySelector<HTMLElement>(".overflow-y-auto") ?? null);
    };
    findQuestList();
    const observer = new MutationObserver(findQuestList);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!state) return;
    if (previousStatus.current === "accepted" && state.status === "completed") {
      setCompleteNotice(true);
      window.setTimeout(() => setCompleteNotice(false), 5000);
    }
    previousStatus.current = state.status;
    if (state.status === "completed" || state.status === "claimed" || state.status === "available") {
      setGuideActive(false);
      try { sessionStorage.removeItem(GUIDE_STORAGE_KEY); } catch {}
    }
  }, [state?.status]);

  const resumeGuide = useCallback(() => {
    if (!state || state.status !== "accepted") return;
    setGuideActive(true);
    setMessage(null);
    try { sessionStorage.setItem(GUIDE_STORAGE_KEY, "1"); } catch {}
    const supported = pathname.startsWith(`/world/${GINNY_WORLD_ID}`) || pathname === "/" || pathname.startsWith("/equip-accessories");
    if (!supported) navigate(`/world/${GINNY_WORLD_ID}`);
  }, [navigate, pathname, state]);

  useEffect(() => {
    if (!guideActive || !state || state.status !== "accepted") {
      setGuideTarget(null);
      return;
    }
    const refresh = () => setGuideTarget(findGuideTarget(window.location.pathname, state.miniPetInventoryId));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    const timer = window.setInterval(refresh, 500);
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
    };
  }, [guideActive, pathname, state?.status, state?.miniPetInventoryId]);

  const chooseMutation = useMutation({
    mutationFn: async (choice: "bat" | "ghost") => (await apiRequest("POST", "/api/quests/ginny-mini-pet/choose", { choice })).json() as Promise<GinnyQuestState>,
    onSuccess: data => {
      queryClient.setQueryData(["/api/quests/ginny-mini-pet"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/mini-pets/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setDialogOpen(false);
      setGuideActive(true);
      try { sessionStorage.setItem(GUIDE_STORAGE_KEY, "1"); } catch {}
    },
    onError: (error: any) => setMessage(error?.message || "Ginny could not give you that Mini Pet. Please try again."),
  });

  const claimMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/quests/ginny-mini-pet/claim", {})).json(),
    onSuccess: data => {
      setMessage(data.coinsGranted > 0 ? "+500 coins claimed!" : "This reward was already claimed.");
      queryClient.setQueryData<GinnyQuestState>(["/api/quests/ginny-mini-pet"], (current) =>
        current ? { ...current, status: "claimed", rewardClaimedAt: new Date().toISOString() } : current
      );
      queryClient.invalidateQueries({ queryKey: ["/api/quests/ginny-mini-pet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: any) => setMessage(error?.message || "Could not claim the reward. Please try again."),
  });

  useEffect(() => {
    if (!state || state.status !== "accepted" || !pathname.startsWith("/equip-accessories")) return;
    const onClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target.closest(`[data-testid="mini-pet-option-${state.miniPetInventoryId}"]`) : null;
      if (!element) return;
      window.setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/quests/ginny-mini-pet"] }), 450);
      window.setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/quests/ginny-mini-pet"] }), 1100);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, queryClient, state?.status, state?.miniPetInventoryId]);

  if (!user || !state) return null;

  const marker = ginnyMount && state.status !== "claimed" ? createPortal(
    <button
      type="button"
      data-testid="ginny-quest-marker"
      aria-label={state.status === "completed" ? "Ginny quest complete" : "Talk to Ginny about her quest"}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setMessage(null); setDialogOpen(true); }}
      className="ginny-quest-marker"
      style={{
        position: "absolute", zIndex: 32,
        left: user.isAdmin ? "50%" : "4%", right: user.isAdmin ? "auto" : "4%",
        top: user.isAdmin ? "-18%" : "4%", bottom: user.isAdmin ? "auto" : "4%",
        transform: user.isAdmin ? "translateX(-50%)" : undefined,
        width: user.isAdmin ? "clamp(34px,22%,58px)" : "auto",
        height: user.isAdmin ? "clamp(34px,22%,58px)" : "auto",
        borderRadius: user.isAdmin ? "50%" : 18,
        border: user.isAdmin ? "2px solid rgba(255,225,120,.9)" : "1px solid transparent",
        background: user.isAdmin
          ? state.status === "completed" ? "rgba(24,100,54,.94)" : "rgba(75,42,7,.94)"
          : "transparent",
        color: "#fff6c8", pointerEvents: "auto", cursor: "pointer", touchAction: "manipulation",
        boxShadow: user.isAdmin ? "0 0 18px rgba(255,206,73,.72)" : "none",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute", left: "50%", top: user.isAdmin ? "50%" : "-7%", transform: "translate(-50%,-50%)",
          width: "clamp(34px,22%,58px)", aspectRatio: "1", borderRadius: "50%", display: "grid", placeItems: "center",
          fontFamily: "Georgia,serif", fontWeight: 900, fontSize: "clamp(20px,14%,36px)",
          color: state.status === "completed" ? "#d9ffe3" : "#fff3aa",
          background: state.status === "completed" ? "rgba(20,112,57,.96)" : state.status === "accepted" ? "rgba(72,52,126,.96)" : "rgba(89,52,8,.96)",
          border: "2px solid rgba(255,228,136,.94)",
          boxShadow: "0 0 0 5px rgba(255,218,90,.12),0 0 22px rgba(255,199,58,.85)",
          animation: "ginnyQuestPulse 1.7s ease-in-out infinite",
          pointerEvents: "none",
        }}
      >{state.status === "completed" ? "✓" : "!"}</span>
    </button>,
    ginnyMount,
  ) : null;

  const questCard = questListMount && state.status !== "claimed" ? createPortal(
    <GinnyQuestCard
      state={state}
      busy={claimMutation.isPending}
      message={message}
      onGo={() => { setMessage(null); navigate(`/world/${GINNY_WORLD_ID}`); }}
      onResume={resumeGuide}
      onClaim={() => claimMutation.mutate()}
    />,
    questListMount,
  ) : null;

  return (
    <>
      <style>{`
        @keyframes ginnyQuestPulse { 0%,100% { transform: translate(-50%,-50%) scale(.92); filter: brightness(.92); } 50% { transform: translate(-50%,-50%) scale(1.12); filter: brightness(1.18); } }
        @keyframes ginnyGuideBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(5px); } }
        .ginny-guide-arrow { animation: ginnyGuideBob 1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ginny-quest-marker span, .ginny-guide-arrow { animation: none !important; }
        }
      `}</style>
      {marker}
      {questCard}
      <GuideHighlight target={guideActive && state.canEquipNow ? guideTarget : null} />

      {guideActive && state.status === "accepted" && !state.canEquipNow && (
        <div data-testid="ginny-guide-needs-active-pet" style={{ position: "fixed", left: 12, right: 12, bottom: "max(18px,env(safe-area-inset-bottom))", margin: "0 auto", maxWidth: 420, zIndex: 2147483002, padding: "11px 14px", borderRadius: 14, background: "rgba(12,8,18,.97)", border: "1px solid rgba(255,213,92,.65)", color: "#fff0c1", font: "11px/1.4 Lora,serif", textAlign: "center", boxShadow: "0 8px 28px rgba(0,0,0,.72)" }}>
          Set a hatched pet as your active pet first, then return to Ginny's guide. Your Mini Pet choice is safely saved.
        </div>
      )}

      {completeNotice && (
        <div data-testid="ginny-quest-complete-notice" role="status" style={{ position: "fixed", left: 12, right: 12, top: "max(16px,env(safe-area-inset-top))", margin: "0 auto", maxWidth: 390, zIndex: 2147483003, padding: "12px 15px", borderRadius: 15, background: "rgba(18,68,36,.97)", border: "1px solid rgba(171,255,187,.62)", color: "#e9ffec", font: "700 11px/1.4 Lora,serif", textAlign: "center", boxShadow: "0 8px 28px rgba(0,0,0,.72),0 0 20px rgba(68,220,116,.22)" }}>
          Quest complete! Claim your 500 coins from Ginny or your Quest page.
        </div>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-[2147482000] flex items-center justify-center p-3" style={{ background: "rgba(2,2,5,.78)", backdropFilter: "blur(5px)" }} onClick={() => setDialogOpen(false)}>
          <section
            data-testid="ginny-quest-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ginny-quest-title"
            onClick={event => event.stopPropagation()}
            style={{ width: "min(94vw,430px)", maxHeight: "min(86vh,720px)", overflowY: "auto", borderRadius: 20, padding: "16px 16px 18px", background: "linear-gradient(180deg,rgba(29,19,38,.99),rgba(8,10,16,.99))", border: "1px solid rgba(230,188,93,.55)", boxShadow: "0 22px 60px rgba(0,0,0,.78),0 0 30px rgba(132,83,160,.18)", color: "#f8ead0", fontFamily: "Lora,serif" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 82, height: 82, flexShrink: 0, borderRadius: 16, display: "grid", placeItems: "center", background: "radial-gradient(circle,rgba(130,83,155,.2),rgba(0,0,0,.2))", border: "1px solid rgba(226,190,107,.25)" }}>
                {ginnyLocation?.iconUrl ? <img src={ginnyLocation.iconUrl} alt="Ginny" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 28 }}>✦</span>}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div id="ginny-quest-title" style={{ fontSize: 17, fontWeight: 800, letterSpacing: ".04em", color: "#ffe295" }}>Ginny</div>
                <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.45, color: "rgba(255,244,222,.82)" }}>
                  {state.status === "available"
                    ? "A little companion makes the Haunted Woods less lonely. Which one would you like to travel with?"
                    : state.status === "accepted"
                      ? `${state.selected?.name ?? "Your Mini Pet"} is yours. Let me show you how to equip your new companion.`
                      : state.status === "completed"
                        ? "Perfect. Your new companion looks right at home. Your 500 coin reward is ready here or in your Quest page."
                        : "You and your little companion make a fine pair."}
                </p>
              </div>
              <button type="button" aria-label="Close Ginny dialog" onClick={() => setDialogOpen(false)} style={{ alignSelf: "flex-start", width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,221,135,.35)", background: "rgba(0,0,0,.25)", color: "#ffe4a8", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>

            {state.status === "available" && (
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
                {(["bat", "ghost"] as const).map(choice => {
                  const option = state.options.find(item => item.choice === choice);
                  return (
                    <button
                      key={choice}
                      type="button"
                      data-testid={`button-ginny-choose-${choice}`}
                      disabled={!option || chooseMutation.isPending}
                      onClick={() => option && chooseMutation.mutate(choice)}
                      style={{ minWidth: 0, minHeight: 154, borderRadius: 15, padding: 10, border: "1px solid rgba(224,191,112,.34)", background: "rgba(0,0,0,.3)", color: "#fff0c4", cursor: option ? "pointer" : "not-allowed", opacity: option ? 1 : .45, touchAction: "manipulation" }}
                    >
                      <div style={{ height: 92, display: "grid", placeItems: "center" }}>
                        {option?.imageUrl ? <img src={option.imageUrl} alt={option.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 30 }}>{choice === "bat" ? "◥" : "◌"}</span>}
                      </div>
                      <div style={{ marginTop: 5, fontSize: 12, fontWeight: 800 }}>{option?.name ?? (choice === "bat" ? "Bat" : "Ghost")}</div>
                      <div style={{ marginTop: 3, color: "#e9c765", fontSize: 9 }}>{option ? "★".repeat(option.rarity) : "Not configured"}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {state.status === "accepted" && (
              <button type="button" data-testid="button-ginny-resume-guide" onClick={() => { setDialogOpen(false); resumeGuide(); }} style={{ width: "100%", marginTop: 14, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(233,202,118,.58)", background: "linear-gradient(135deg,#4d3970,#71538c)", color: "#fff5d6", fontFamily: "Lora,serif", fontSize: 11, fontWeight: 800, letterSpacing: ".06em", cursor: "pointer" }}>SHOW ME HOW TO EQUIP IT</button>
            )}

            {state.status === "completed" && (
              <button type="button" data-testid="button-ginny-claim-at-npc" onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending} style={{ width: "100%", marginTop: 14, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(233,202,118,.58)", background: "linear-gradient(135deg,#6e4a00,#a57400)", color: "#fff5d6", fontFamily: "Lora,serif", fontSize: 11, fontWeight: 800, letterSpacing: ".06em", cursor: claimMutation.isPending ? "wait" : "pointer" }}>{claimMutation.isPending ? "CLAIMING…" : "CLAIM 500 COINS"}</button>
            )}

            {message && <p role="status" style={{ margin: "10px 2px 0", fontSize: 10, lineHeight: 1.4, color: "#ffcf9b" }}>{message}</p>}
          </section>
        </div>
      )}
    </>
  );
}
