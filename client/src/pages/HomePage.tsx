import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { X } from "lucide-react";
import supportIconImg from "@assets/Photoroom_20260708_111738_PM_1783570684580.png";
import worldChatIconImg from "@assets/generated_images/veridian_watcher_avatar.png";
import bgImg from "@assets/uploads/NewActivePetBG.png";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import WorldChatPanel from "@/components/WorldChatPanel";
import TopBar from "@/components/TopBar";
import HomePlayerHud, { type HomeHudPet } from "@/components/HomePlayerHud";
import HomeAvatarStage from "@/components/HomeAvatarStage";
import ViewportHudPortal from "@/components/ViewportHudPortal";
import ViewportBackdropPortal from "@/components/ViewportBackdropPortal";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import UserProfilePanel from "@/components/UserProfilePanel";
import { coverArtworkPoint } from "@/lib/artworkCoverGeometry";

interface HomePageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    isModerator?: boolean;
    activePetId: string | null;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
  isOverlayActive?: boolean;
}


/** Account-owned Home actor. Owned-pet actions, eggs and evolution remain in their inventory-ID routes. */
export default function HomePage({ user, isOverlayActive = false }: HomePageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  // Render the new account's own identity immediately, before the syncing effect runs.
  const homeUser = currentUser.id === user.id ? currentUser : user;
  const { toast } = useToast();
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSent, setSupportSent] = useState(false);
  const [showWorldChat, setShowWorldChat] = useState(false);
  const [chatHasNewMsg, setChatHasNewMsg] = useState(false);
  const bgChatCountRef = useRef(-1);
  const [, navigate] = useLocation();
  const searchString = useSearch();
  useEffect(() => {
    setCurrentUser(previous => previous.id === user.id ? { ...previous, ...user } : user);
  }, [user.id, user.activePetId, user.coins, user.profileImage, user.username]);
  useEffect(() => {
    bgChatCountRef.current = -1;
    setChatHasNewMsg(false);
    setShowWorldChat(false);
    setShowProfile(false);
    setShowSupportModal(false);
    setSupportSent(false);
    setSupportSubject("");
    setSupportMessage("");
  }, [user.id]);

  // Background poll for world chat — detects new messages even when the panel is closed
  // so the icon can glow when Veridian Watcher or other players post.
  const { data: bgChatData } = useQuery<any[]>({
    queryKey: ["/api/world-chat"],
    refetchInterval: showWorldChat || isOverlayActive ? false : 15000,
    enabled: !!homeUser && !isOverlayActive,
    staleTime: 0,
  });
  useEffect(() => {
    if (!bgChatData) return;
    const count = bgChatData.length;
    if (bgChatCountRef.current === -1) {
      bgChatCountRef.current = count;
      return;
    }
    if (!showWorldChat && count > bgChatCountRef.current) {
      setChatHasNewMsg(true);
    }
    bgChatCountRef.current = count;
  }, [bgChatData, showWorldChat]);

  const supportMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/support-message", {
      username: homeUser.username,
      email: homeUser.email,
      subject: supportSubject,
      message: supportMessage,
    }).then(r => r.json()),
    onSuccess: () => setSupportSent(true),
    onError: () => toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" }),
  });

  // The retired Home Pet Menu is no longer a quest target. Forward old
  // daily-quest links to the existing owned-pet routes instead of leaving
  // a spotlight pointing at a removed control.
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const hint = params.get("questHint");
    const action = params.get("action");
    const destination =
      action === "powerup" || hint === "powerup" ? "pet-power-up" :
      hint === "feed" ? "pet-care" : null;
    if (!destination) return;
    window.history.replaceState({}, "", "/");
    navigate(homeUser.activePetId
      ? `/${destination}/${encodeURIComponent(homeUser.activePetId)}?from=quest`
      : "/bag");
  }, [searchString, homeUser.activePetId, navigate]);

  const { data: inventory = [], isLoading: inventoryLoading, isSuccess: inventoryReady, isError: inventoryError } = useQuery<HomeHudPet[]>({
    queryKey: ["/api/inventory"],
  });

  // Measure the existing Home backdrop and artwork in viewport coordinates.
  // Preserve cover-cropping and the original platform landmark on all devices.
  const homeBackdropRef = useRef<HTMLDivElement | null>(null);
  const [homeBackdropRect, setHomeBackdropRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [homeArtworkSize, setHomeArtworkSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const image = new Image();
    image.onload = () => setHomeArtworkSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = bgImg;
    return () => { image.onload = null; };
  }, []);
  useEffect(() => {
    const element = homeBackdropRef.current;
    if (!element) return;
    const update = () => {
      const { left, top, width, height } = element.getBoundingClientRect();
      setHomeBackdropRect(previous => previous.left === left && previous.top === top && previous.width === width && previous.height === height ? previous : { left, top, width, height });
    };
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  // The actual uploaded artwork is 1620×2160. The stone platform's visible
  // standing surface is centered near (810, 1475) intrinsic image pixels.
  // Use the image's real natural dimensions to project this landmark through
  // background-size: cover instead of anchoring to a percentage of a phone.
  const homePlatformPoint = coverArtworkPoint(
    homeArtworkSize, homeBackdropRect,
    { x: homeArtworkSize.width / 2, y: homeArtworkSize.height * (1475 / 2160) },
  );

  return (
    <div
      data-testid="active-pet-page"
      data-viewport-visual-owner="backdrop"
      className="relative w-full h-screen-frame overflow-hidden flex flex-col"
      style={{ caretColor: "transparent" }}
    >
      <ViewportBackdropPortal targetId="game-viewport-page">
        <div
          data-testid="active-pet-viewport-backdrop"
          ref={homeBackdropRef}
          data-artwork-width={homeArtworkSize.width || undefined}
          data-artwork-height={homeArtworkSize.height || undefined}
          data-backdrop-width={homeBackdropRect.width || undefined}
          data-backdrop-height={homeBackdropRect.height || undefined}
          className="active-pet-viewport-backdrop absolute inset-0 overflow-hidden pointer-events-none"
          style={{
            backgroundImage: `url(${bgImg})`,
            backgroundSize: "cover",
            backgroundPosition: "center top",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 38%, transparent 58%, rgba(0,0,0,0.60) 100%)" }} />
          {/* Background-only depth: darken busy forest edges while leaving a soft,
              diffuse clearing behind the player avatar. No position changes. */}
          <div
            data-testid="active-pet-background-depth"
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 58% 42% at 50% 54%, rgba(157,205,150,0.13) 0%, rgba(95,150,115,0.065) 45%, transparent 78%), radial-gradient(ellipse 85% 68% at 50% 52%, transparent 34%, rgba(2,12,10,0.23) 72%, rgba(1,7,8,0.50) 100%)",
            }}
          />
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute" style={{ left: "12%", top: "25%", width: "8px", height: "8px", borderRadius: "50%", background: "radial-gradient(circle, rgba(127,255,212,0.8) 0%, rgba(127,255,212,0) 70%)", boxShadow: "0 0 18px rgba(127,255,212,0.35)", animation: "orbFloat1 8s ease-in-out infinite", willChange: "transform" }} />
            <div className="absolute" style={{ right: "15%", top: "20%", width: "6px", height: "6px", borderRadius: "50%", background: "radial-gradient(circle, rgba(200,230,255,0.8) 0%, rgba(200,230,255,0) 70%)", boxShadow: "0 0 14px rgba(200,230,255,0.3)", animation: "orbFloat2 10s ease-in-out infinite 1s", willChange: "transform" }} />
            <div className="absolute" style={{ left: "25%", top: "55%", width: "5px", height: "5px", borderRadius: "50%", background: "radial-gradient(circle, rgba(180,255,200,0.7) 0%, rgba(180,255,200,0) 70%)", boxShadow: "0 0 12px rgba(180,255,200,0.3)", animation: "orbFloat3 9s ease-in-out infinite 2s", willChange: "transform" }} />
            <div className="absolute" style={{ right: "20%", top: "45%", width: "7px", height: "7px", borderRadius: "50%", background: "radial-gradient(circle, rgba(240,220,130,0.7) 0%, rgba(240,220,130,0) 70%)", boxShadow: "0 0 16px rgba(240,220,130,0.3)", animation: "orbFloat1 11s ease-in-out infinite 3s", willChange: "transform" }} />
            <div className="absolute" style={{ left: "8%", top: "40%", width: "4px", height: "4px", borderRadius: "50%", background: "radial-gradient(circle, rgba(127,255,212,0.6) 0%, rgba(127,255,212,0) 70%)", boxShadow: "0 0 8px rgba(127,255,212,0.25)", animation: "orbFloat2 7s ease-in-out infinite 4s", willChange: "transform" }} />
            <div className="absolute" style={{ right: "10%", top: "65%", width: "5px", height: "5px", borderRadius: "50%", background: "radial-gradient(circle, rgba(160,200,255,0.6) 0%, rgba(160,200,255,0) 70%)", boxShadow: "0 0 10px rgba(160,200,255,0.25)", animation: "orbFloat3 12s ease-in-out infinite 1.5s", willChange: "transform" }} />
            <div className="absolute" style={{ left: "45%", top: "15%", width: "10px", height: "10px", borderRadius: "50%", background: "radial-gradient(circle, rgba(200,255,220,0.4) 0%, rgba(200,255,220,0) 70%)", boxShadow: "0 0 18px rgba(200,255,220,0.15)", animation: "orbPulse 5s ease-in-out infinite", willChange: "transform, opacity" }} />
            <div className="absolute" style={{ left: "65%", top: "35%", width: "4px", height: "4px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,240,180,0.7) 0%, rgba(255,240,180,0) 70%)", boxShadow: "0 0 6px rgba(255,240,180,0.3)", animation: "orbFloat1 6s ease-in-out infinite 5s", willChange: "transform" }} />
          </div>
        </div>
      </ViewportBackdropPortal>

      <div className="relative flex flex-col h-full" style={{ paddingTop: "env(safe-area-inset-top, 0px)", visibility: isOverlayActive ? "hidden" : "visible" }}>
        <ViewportHudPortal>
          <div
            data-testid="viewport-hud-topbar"
            style={{
              position: "absolute",
              top: 18,
              left: 0,
              right: 0,
              zIndex: 40,
              pointerEvents: "none",
              visibility: isOverlayActive ? "hidden" : "visible",
            }}
          >
            <div style={{ pointerEvents: "auto" }}>
              <TopBar user={homeUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />
            </div>
          </div>
        </ViewportHudPortal>

        {/* Account XP and five-pet PvP/Raid roster reuse existing services. */}
        <ViewportHudPortal>
          <HomePlayerHud
            userId={homeUser.id}
            username={homeUser.username}
            inventory={inventory}
            inventoryLoading={inventoryLoading}
            inventoryReady={inventoryReady}
            inventoryError={inventoryError}
            avatarHome
            visible={!isOverlayActive && !showProfile && !showSupportModal && !showWorldChat}
          />
        </ViewportHudPortal>

        {/* Player-owned avatar is positioned from the real stone-platform
            landmark, not the active pet's ID or the old reference stage. */}
        <ViewportHudPortal>
            <HomeAvatarStage
              userId={homeUser.id}
              landmark={homePlatformPoint}
              backdrop={homeBackdropRect}
              visible={!isOverlayActive && !showProfile && !showSupportModal && !showWorldChat}
              onOpen={() => navigate("/player-avatar?from=home")}
            />
        </ViewportHudPortal>


      </div>

      {showProfile && (
        <UserProfilePanel
          user={homeUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(updatedUser) => {
            setCurrentUser(updatedUser);
            setShowProfile(false);
          }}
        />
      )}

      {/* Veridian Watcher + Support — device-edge upper-right HUD */}
      {!showProfile && !showWorldChat && !showSupportModal && (
        <ViewportHudPortal>
          <div
            data-testid="viewport-hud-corner-actions"
            style={{
              position: "absolute",
              top: 58,
              right: 12,
              zIndex: 50,
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              pointerEvents: "auto",
            }}
          >
            {/* World Chat toggle button. Group geometry preserves the original
                iPhone 12 position: right 54 / top 58. */}
            <button
              data-testid="button-open-world-chat"
              onClick={() => { setShowWorldChat(v => !v); setChatHasNewMsg(false); }}
              className="relative transition-transform active:scale-90"
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                overflow: "hidden",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
                background: "rgba(10,40,34,0.85)",
                border: showWorldChat
                  ? "2px solid rgba(94,234,212,0.8)"
                  : chatHasNewMsg
                    ? "2px solid rgba(94,234,212,0.65)"
                    : "2px solid rgba(94,234,212,0.3)",
                boxShadow: showWorldChat
                  ? "0 0 14px rgba(94,234,212,0.45), 0 4px 16px rgba(0,0,0,0.9)"
                  : chatHasNewMsg
                    ? "0 0 16px rgba(94,234,212,0.6)"
                    : "0 4px 16px rgba(0,0,0,0.9)",
              }}
            >
              <img
                src={worldChatIconImg}
                alt="The Veridian Watcher"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  filter: showWorldChat
                    ? "brightness(1.15)"
                    : chatHasNewMsg
                      ? "brightness(1.2)"
                      : "brightness(0.95)",
                }}
              />
            </button>

            {/* Support keeps the original iPhone 12 right 12 / top 66 position. */}
            <button
              data-testid="button-open-support"
              onClick={() => { setShowSupportModal(true); setSupportSent(false); setSupportSubject(""); setSupportMessage(""); }}
              className="relative transition-transform active:scale-90"
              style={{
                marginTop: 8,
                width: 36,
                height: 36,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <img src={supportIconImg} alt="Support" style={{ width: 36, height: 36, objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))" }} />
            </button>
          </div>
        </ViewportHudPortal>
      )}

      {/* World Chat Panel — render on the same device HUD as its launcher so
          it sits above the profile/resources instead of behind them. */}
      {showWorldChat && (
        <ViewportHudPortal>
          <div
            data-testid="viewport-hud-world-chat-layer"
            className="absolute inset-0"
            style={{ zIndex: 10000, pointerEvents: "auto" }}
          >
            {/* Transparent backdrop — tap anywhere outside the panel to close */}
            <div
              className="absolute inset-0"
              onClick={() => setShowWorldChat(false)}
            />
            <WorldChatPanel
              currentUserId={homeUser.id}
              onClose={() => setShowWorldChat(false)}
              onNewMessage={() => setChatHasNewMsg(true)}
            />
          </div>
        </ViewportHudPortal>
      )}

      {/* Support message modal */}
      {showSupportModal && (
        <ViewportModalPortal>
        <div
          role="dialog"
          aria-modal="true"
          className="absolute inset-0 flex items-center justify-center px-5"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(2px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowSupportModal(false); }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl px-5 py-6 flex flex-col gap-4 animate-slide-up"
            style={{
              background: "linear-gradient(160deg, rgba(12,8,2,0.99) 0%, rgba(8,5,1,0.99) 100%)",
              border: "1.5px solid rgba(212,160,23,0.45)",
              boxShadow: "0 0 50px rgba(212,160,23,0.1), 0 8px 32px rgba(0,0,0,0.7)",
              maxHeight: "calc(90*var(--vh))",
              overflowY: "auto",
            }}
          >
            <button
              data-testid="button-close-support-modal"
              onClick={() => setShowSupportModal(false)}
              className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{
                background: "rgba(60,25,5,0.85)",
                border: "1.5px solid rgba(212,160,23,0.35)",
                color: "rgba(212,160,23,0.8)",
                cursor: "pointer",
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <p className="font-fantasy text-[#f0c040] text-base tracking-wider text-center pr-6">Contact Support</p>

            {supportSent ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="font-fantasy text-[#7fffd4] text-sm tracking-wide text-center">Message sent!</p>
                <p className="font-fantasy text-[#a89878] text-[11px] tracking-wide text-center leading-relaxed">
                  Your message has been delivered to the admin team. We'll look into it soon!
                </p>
                <button
                  data-testid="button-support-done"
                  onClick={() => setShowSupportModal(false)}
                  className="mt-2 px-6 py-2 rounded-full font-fantasy text-xs tracking-widest transition-transform active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, rgba(0,80,50,0.9) 0%, rgba(0,50,30,0.9) 100%)",
                    border: "1px solid rgba(0,200,160,0.4)",
                    color: "#7fffd4",
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="font-fantasy text-[#f0c040] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-70">Subject</label>
                  <input
                    data-testid="input-support-subject"
                    type="text"
                    value={supportSubject}
                    onChange={e => setSupportSubject(e.target.value)}
                    disabled={supportMutation.isPending}
                    placeholder="e.g. Bug report, Account help..."
                    className="w-full px-3 py-2 rounded-lg font-sans text-sm text-[#1a0e04] placeholder-[#8a7060] outline-none disabled:opacity-60"
                    style={{
                      background: "linear-gradient(135deg, #f5ead8 0%, #ecdec0 100%)",
                      border: "1.5px solid rgba(170,125,35,0.55)",
                      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)",
                    }}
                  />
                </div>
                <div>
                  <label className="font-fantasy text-[#f0c040] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-70">Message</label>
                  <textarea
                    data-testid="input-support-message"
                    value={supportMessage}
                    onChange={e => setSupportMessage(e.target.value)}
                    disabled={supportMutation.isPending}
                    placeholder="Describe what you need help with..."
                    rows={4}
                    maxLength={2000}
                    className="w-full px-3 py-2 rounded-lg font-sans text-sm text-[#1a0e04] placeholder-[#8a7060] outline-none disabled:opacity-60 resize-none"
                    style={{
                      background: "linear-gradient(135deg, #f5ead8 0%, #ecdec0 100%)",
                      border: "1.5px solid rgba(170,125,35,0.55)",
                      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)",
                    }}
                  />
                  <p className="font-fantasy text-[#5a8870] text-[9px] tracking-wider text-right mt-0.5">{supportMessage.length}/2000</p>
                </div>
                <button
                  data-testid="button-submit-support"
                  onClick={() => supportMutation.mutate()}
                  disabled={supportMutation.isPending || !supportSubject.trim() || !supportMessage.trim()}
                  className="py-2.5 rounded-full font-fantasy text-xs tracking-widest transition-transform active:scale-95 disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, rgba(0,80,50,0.9) 0%, rgba(0,50,30,0.9) 100%)",
                    border: "1px solid rgba(0,200,160,0.4)",
                    color: "#7fffd4",
                    cursor: "pointer",
                  }}
                >
                  {supportMutation.isPending ? "Sending..." : "Send Message"}
                </button>
              </div>
            )}
          </div>
        </div>
        </ViewportModalPortal>
      )}


    </div>
  );
}
