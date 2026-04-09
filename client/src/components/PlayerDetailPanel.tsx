import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import petHouseBg from "@assets/generated_images/pet_world_bg.png";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import powerupBagIconPDP from "@assets/generated_images/icon_powerup_bag.png";
import houseCottageIcon from "@assets/generated_images/nav_icon_home.png";
import giftIconImg from "@assets/generated_images/gift_icon_forest.png";
import SendGiftModal from "@/components/SendGiftModal";

interface PlayerDetailPanelProps {
  userId: string;
  currentUserId?: string;
  onClose: () => void;
}

interface ActivePet {
  inventoryId: string;
  shopItemId: string;
  name: string;
  nickname: string | null;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
  eggImageUrl: string | null;
  rarity: number | null;
  specialSkill: string | null;
  petLevel: number;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petLevelPoints: number;
  petTemplateId: string | null;
}

interface Accessory {
  inventoryId: string;
  name: string;
  imageUrl: string | null;
  atkBoost: number | null;
  defBoost: number | null;
  healthBoost: number | null;
}

interface PublicProfile {
  id: string;
  username: string;
  profileImage: string | null;
  activePet: ActivePet | null;
  accessories: Accessory[];
}

interface Badge {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  awardedAt: string;
}

function RarityStars({ rarity }: { rarity: number | null }) {
  if (!rarity) return null;
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: rarity }).map((_, i) => (
        <span key={i} style={{ color: "#f0c040", fontSize: 10, lineHeight: 1 }}>★</span>
      ))}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${color}44` }}
    >
      <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em" }}>{label}</span>
      <span className="font-fantasy" style={{ color: "#f0e8d0", fontSize: 10 }}>{value}</span>
    </div>
  );
}

export default function PlayerDetailPanel({ userId, currentUserId, onClose }: PlayerDetailPanelProps) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [showMessageCompose, setShowMessageCompose] = useState(false);
  const [messageText, setMessageText] = useState("");

  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"], retry: false });

  const sendMessageMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gifts/send", {
      receiverId: userId,
      coinAmount: 0,
      message: messageText.trim(),
    }),
    onSuccess: () => {
      toast({ title: "Message Sent!", description: "Your message is waiting in their mailbox." });
      setMessageText("");
      setShowMessageCompose(false);
    },
    onError: (e: any) => toast({ title: "Failed to send", description: e.message, variant: "destructive" }),
  });

  const { data: profile, isLoading, isError } = useQuery<PublicProfile>({
    queryKey: ["/api/users", userId, "profile"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/profile`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  const { data: badges } = useQuery<Badge[]>({
    queryKey: ["/api/users", userId, "badges"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/badges`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  // Friend status — only when logged in and viewing someone else
  const isSelf = !!currentUserId && currentUserId === userId;
  const { data: friendStatusData, refetch: refetchFriendStatus } = useQuery<{ friendship: any | null }>({
    queryKey: ["/api/friends/status", userId],
    queryFn: async () => {
      const res = await fetch(`/api/friends/status/${userId}`, { credentials: "include" });
      if (!res.ok) return { friendship: null };
      return res.json();
    },
    enabled: !!currentUserId && !isSelf,
    staleTime: 10000,
  });

  const friendship = friendStatusData?.friendship ?? null;
  const friendStatus: "none" | "friends" | "pending_sent" | "pending_received" = !friendship
    ? "none"
    : friendship.status === "accepted"
      ? "friends"
      : friendship.requesterId === currentUserId
        ? "pending_sent"
        : "pending_received";

  const sendRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/friends/request/${userId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friends/status", userId] });
      refetchFriendStatus();
    },
  });

  const cancelRequestMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/friends/${userId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friends/status", userId] });
      qc.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
      refetchFriendStatus();
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/friends/accept/${friendship?.id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friends/status", userId] });
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
      qc.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
      refetchFriendStatus();
    },
  });

  const petImg = profile?.activePet?.hatchedImageUrl || profile?.activePet?.imageUrl;

  return (
    <>
    <div
      data-testid="overlay-player-detail"
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        data-testid="panel-player-detail"
        className="w-full rounded-t-3xl overflow-hidden"
        style={{
          position: "relative",
          maxWidth: 480,
          maxHeight: "88dvh",
          overflowY: "auto",
          background: "linear-gradient(180deg, #0d0a04 0%, #1a1000 50%, #0a0600 100%)",
          border: "1px solid rgba(212,160,23,0.25)",
          borderBottom: "none",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.8)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Pull handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(212,160,23,0.3)" }} />
        </div>

        {/* Close button */}
        <button
          data-testid="button-close-player-detail"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(212,160,23,0.2)", color: "#a89878" }}
        >
          ✕
        </button>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Loading...</p>
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-16">
            <p className="font-fantasy text-[#ff6666] text-sm">Could not load profile</p>
          </div>
        )}

        {profile && (
          <div className="px-5 pb-8 pt-2 flex flex-col gap-5">
            {/* Profile header */}
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0"
                style={{
                  border: "2.5px solid #c9a030",
                  boxShadow: "0 0 8px rgba(201,160,48,0.3), 0 2px 8px rgba(0,0,0,0.5), inset 0 0 3px rgba(201,160,48,0.15)",
                }}
              >
                {profile.profileImage ? (
                  <img
                    src={profile.profileImage}
                    alt=""
                    className="w-full h-full object-cover"
                    data-testid="img-player-profile"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)" }}
                  >
                    <span className="font-fantasy text-[#d4a017] text-xl font-bold">
                      {(profile.username ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              <p
                className="font-fantasy text-lg font-semibold tracking-wide"
                style={{ color: "#f0c040" }}
                data-testid="text-player-username"
              >
                {profile.username}
              </p>

              {/* Friend button — only for logged-in users viewing another player */}
              {!!currentUserId && !isSelf && (
                <div className="mt-1">
                  {friendStatus === "none" && (
                    <button
                      data-testid="button-add-friend"
                      disabled={sendRequestMutation.isPending}
                      onClick={() => sendRequestMutation.mutate()}
                      className="px-4 py-1.5 rounded-full font-fantasy text-xs tracking-wider transition-all active:scale-95"
                      style={{
                        background: "linear-gradient(135deg, #b87d08, #f0c040)",
                        color: "#0a0600",
                        border: "none",
                        boxShadow: "0 2px 12px rgba(240,192,64,0.35)",
                        opacity: sendRequestMutation.isPending ? 0.6 : 1,
                      }}
                    >
                      {sendRequestMutation.isPending ? "Sending..." : "+ Add Friend"}
                    </button>
                  )}
                  {friendStatus === "pending_sent" && (
                    <button
                      data-testid="button-cancel-request"
                      disabled={cancelRequestMutation.isPending}
                      onClick={() => cancelRequestMutation.mutate()}
                      className="px-4 py-1.5 rounded-full font-fantasy text-xs tracking-wider transition-all active:scale-95"
                      style={{
                        background: "rgba(240,192,64,0.1)",
                        color: "#a89058",
                        border: "1px solid rgba(240,192,64,0.3)",
                        opacity: cancelRequestMutation.isPending ? 0.6 : 1,
                      }}
                    >
                      {cancelRequestMutation.isPending ? "Cancelling..." : "Request Sent — Cancel"}
                    </button>
                  )}
                  {friendStatus === "pending_received" && (
                    <button
                      data-testid="button-accept-request"
                      disabled={acceptRequestMutation.isPending}
                      onClick={() => acceptRequestMutation.mutate()}
                      className="px-4 py-1.5 rounded-full font-fantasy text-xs tracking-wider transition-all active:scale-95"
                      style={{
                        background: "linear-gradient(135deg, #1a7a3a, #34a85a)",
                        color: "#e0ffe8",
                        border: "none",
                        boxShadow: "0 2px 12px rgba(52,168,90,0.3)",
                        opacity: acceptRequestMutation.isPending ? 0.6 : 1,
                      }}
                    >
                      {acceptRequestMutation.isPending ? "Accepting..." : "Accept Friend Request"}
                    </button>
                  )}
                  {friendStatus === "friends" && (
                    <div
                      data-testid="text-already-friends"
                      className="px-4 py-1.5 rounded-full font-fantasy text-xs tracking-wider"
                      style={{
                        background: "rgba(52,168,90,0.12)",
                        color: "#4ade80",
                        border: "1px solid rgba(52,168,90,0.25)",
                      }}
                    >
                      Friends
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Send Message + Send Gift buttons — logged-in users viewing another player */}
            {!!currentUserId && !isSelf && (
              <div className="flex flex-col gap-2 w-full">
                {/* Send Message */}
                <button
                  data-testid="button-send-message"
                  onClick={() => setShowMessageCompose(v => !v)}
                  className="w-full font-fantasy text-xs tracking-widest rounded-xl py-2.5 transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, rgba(127,191,176,0.12), rgba(80,160,140,0.08))",
                    border: "1px solid rgba(127,191,176,0.35)",
                    color: "#7fbfb0",
                  }}
                >
                  Send Message
                </button>

                {/* Inline compose */}
                {showMessageCompose && (
                  <div className="flex flex-col gap-2 w-full">
                    <textarea
                      data-testid="input-message-text"
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      maxLength={300}
                      rows={3}
                      placeholder="Write your message..."
                      className="w-full rounded-xl px-3 py-2 font-fantasy text-xs resize-none"
                      style={{
                        background: "rgba(10,8,4,0.7)",
                        border: "1px solid rgba(127,191,176,0.25)",
                        color: "#d4c89a",
                        outline: "none",
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        data-testid="button-cancel-message"
                        onClick={() => { setShowMessageCompose(false); setMessageText(""); }}
                        className="flex-1 font-fantasy text-xs rounded-xl py-2 transition-all active:scale-95"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#6a5a4a" }}
                      >
                        Cancel
                      </button>
                      <button
                        data-testid="button-send-message-confirm"
                        disabled={!messageText.trim() || sendMessageMutation.isPending}
                        onClick={() => sendMessageMutation.mutate()}
                        className="flex-1 font-fantasy text-xs rounded-xl py-2 transition-all active:scale-95"
                        style={{
                          background: messageText.trim() ? "linear-gradient(135deg, #1a6a5a, #2a9a7a)" : "rgba(127,191,176,0.08)",
                          border: "1px solid rgba(127,191,176,0.3)",
                          color: messageText.trim() ? "#c0ffe0" : "#3a6a5a",
                          opacity: sendMessageMutation.isPending ? 0.6 : 1,
                        }}
                      >
                        {sendMessageMutation.isPending ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Send Gift */}
                <button
                  data-testid="button-send-gift-open"
                  onClick={() => setShowGiftModal(true)}
                  className="w-full font-fantasy text-xs tracking-widest rounded-xl py-2.5 transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{
                    background: "linear-gradient(135deg, rgba(212,160,23,0.14), rgba(160,100,10,0.1))",
                    border: "1px solid rgba(212,160,23,0.35)",
                    color: "#f0c040",
                  }}
                >
                  <img src={giftIconImg} alt="" className="w-4 h-4 object-contain" />
                  Send Gift
                </button>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.25), transparent)" }} />

            {/* Pet House preview + visit button */}
            <button
              data-testid="button-visit-pethouse"
              onClick={() => {
                onClose();
                navigate(`/visit/${profile.id}`);
              }}
              className="relative w-full rounded-2xl overflow-hidden flex flex-col items-start justify-end"
              style={{
                height: 100,
                border: "1px solid rgba(134,239,172,0.35)",
                boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
              }}
            >
              <img
                src={petHouseBg}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition: "center 30%" }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(to top, rgba(5,18,3,0.82) 0%, rgba(5,18,3,0.25) 60%, transparent 100%)",
                }}
              />
              <div className="relative z-10 px-4 pb-3 flex items-center gap-2">
                <img src={houseCottageIcon} alt="" className="w-7 h-7 object-contain"
                  style={{ filter: "drop-shadow(0 0 6px rgba(134,239,172,0.5))" }} />
                <p
                  className="font-fantasy text-sm font-semibold tracking-wide"
                  style={{ color: "#86efac", textShadow: "0 1px 8px rgba(0,0,0,0.9)" }}
                >
                  Visit Pet World
                </p>
              </div>
            </button>

            {/* Active pet */}
            <div className="flex flex-col gap-3">
              <p
                className="font-fantasy text-xs tracking-widest uppercase"
                style={{ color: "rgba(212,160,23,0.6)" }}
              >
                Active Companion
              </p>

              {profile.activePet ? (
                <div
                  className="rounded-2xl p-4 flex gap-4 items-start"
                  style={{
                    background: "linear-gradient(135deg, rgba(20,15,5,0.9), rgba(30,20,5,0.8))",
                    border: "1px solid rgba(212,160,23,0.2)",
                  }}
                >
                  <div
                    className="flex-shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                    style={{
                      width: 76,
                      height: 76,
                      background: "rgba(0,0,0,0.5)",
                      border: "1.5px solid rgba(212,160,23,0.2)",
                    }}
                    data-testid="img-active-pet"
                  >
                    {petImg ? (
                      <img src={petImg} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <img src={petPawIcon} alt="" style={{ width: 44, height: 44, objectFit: "contain" }} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className="font-fantasy text-sm font-semibold"
                        style={{ color: "#f0c040" }}
                        data-testid="text-active-pet-name"
                      >
                        {profile.activePet.nickname || profile.activePet.name}
                      </p>
                      {profile.activePet.nickname && (
                        <p className="font-fantasy text-[10px]" style={{ color: "rgba(240,192,64,0.55)" }}>
                          ({profile.activePet.name})
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <RarityStars rarity={profile.activePet.rarity} />
                      <span
                        className="font-fantasy text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(127,191,176,0.15)",
                          border: "1px solid rgba(127,191,176,0.3)",
                          color: "#7fbfb0",
                        }}
                        data-testid="text-active-pet-level"
                      >
                        Lv.{profile.activePet.petLevel}
                      </span>
                    </div>

                    {profile.activePet.specialSkill && (
                      <p className="font-fantasy text-[9px]" style={{ color: "#c084fc" }}>
                        ✦ {profile.activePet.specialSkill}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      <StatPill label="HP" value={profile.activePet.petHealth} color="#f87171" />
                      <StatPill label="ATK" value={profile.activePet.petAtk} color="#fb923c" />
                      <StatPill label="DEF" value={profile.activePet.petDef} color="#60a5fa" />
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-2xl p-5 flex items-center justify-center"
                  style={{
                    background: "rgba(10,6,0,0.6)",
                    border: "1px dashed rgba(212,160,23,0.15)",
                  }}
                >
                  <p className="font-fantasy text-xs" style={{ color: "rgba(168,152,120,0.5)" }}>
                    No active companion
                  </p>
                </div>
              )}
            </div>

            {/* Badges */}
            {badges && badges.length > 0 && (
              <div className="flex flex-col gap-3">
                <p
                  className="font-fantasy text-xs tracking-widest uppercase"
                  style={{ color: "rgba(212,160,23,0.6)" }}
                >
                  Badges
                </p>
                <div className="flex flex-wrap gap-2">
                  {badges.map(badge => (
                    <div
                      key={badge.id}
                      data-testid={`badge-${badge.id}`}
                      className="flex flex-col items-center gap-1"
                      style={{ width: 56 }}
                      title={badge.description || badge.name}
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                        style={{
                          background: "linear-gradient(135deg, rgba(40,20,5,0.95), rgba(20,8,0,0.95))",
                          border: "1.5px solid rgba(240,192,64,0.4)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                        }}
                      >
                        {badge.imageUrl ? (
                          <img src={badge.imageUrl} alt={badge.name} className="w-full h-full object-contain p-1" />
                        ) : (
                          <img src={petPawIcon} alt="" style={{ width: 24, height: 24, objectFit: "contain", opacity: 0.55 }} />
                        )}
                      </div>
                      <p
                        className="font-fantasy text-[8px] text-center leading-tight"
                        style={{
                          color: "#a89878",
                          maxWidth: 56,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {badge.name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accessories */}
            <div className="flex flex-col gap-3">
              <p
                className="font-fantasy text-xs tracking-widest uppercase"
                style={{ color: "rgba(212,160,23,0.6)" }}
              >
                Accessories
              </p>

              {profile.accessories.length === 0 ? (
                <div
                  className="rounded-2xl p-4 flex items-center justify-center"
                  style={{
                    background: "rgba(10,6,0,0.6)",
                    border: "1px dashed rgba(212,160,23,0.15)",
                  }}
                >
                  <p className="font-fantasy text-xs" style={{ color: "rgba(168,152,120,0.5)" }}>
                    No accessories
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {profile.accessories.map(acc => (
                    <div
                      key={acc.inventoryId}
                      data-testid={`accessory-${acc.inventoryId}`}
                      className="flex flex-col items-center gap-1"
                      style={{ width: 56 }}
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                        style={{
                          background: "linear-gradient(135deg, rgba(30,10,50,0.95), rgba(20,5,35,0.95))",
                          border: "1.5px solid rgba(192,132,252,0.3)",
                        }}
                      >
                        {acc.imageUrl ? (
                          <img src={acc.imageUrl} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <img src={powerupBagIconPDP} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                        )}
                      </div>
                      <p
                        className="font-fantasy text-[8px] text-center leading-tight"
                        style={{ color: "#a89878", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {acc.name}
                      </p>
                      {(acc.atkBoost || acc.defBoost || acc.healthBoost) && (
                        <p className="font-fantasy text-[7px]" style={{ color: "#86efac" }}>
                          {acc.atkBoost ? `+${acc.atkBoost}ATK` : ""}{acc.atkBoost && acc.defBoost ? " " : ""}{acc.defBoost ? `+${acc.defBoost}DEF` : ""}{(acc.atkBoost || acc.defBoost) && acc.healthBoost ? " " : ""}{acc.healthBoost ? `+${acc.healthBoost}HP` : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

    {showGiftModal && profile && (
      <SendGiftModal
        friendId={userId}
        friendUsername={profile.username}
        senderCoins={me?.coins ?? 0}
        onClose={() => setShowGiftModal(false)}
      />
    )}
    </>
  );
}
