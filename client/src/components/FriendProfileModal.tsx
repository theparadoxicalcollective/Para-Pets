import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SendGiftModal from "./SendGiftModal";

interface FriendProfileModalProps {
  friendId: string;
  friendUsername: string;
  senderCoins?: number;
  onClose: () => void;
}

const RARITY_COLOR: Record<string, string> = {
  Legendary: "#f0c040",
  Epic:      "#c084fc",
  Rare:      "#60a5fa",
  Uncommon:  "#4ade80",
  Common:    "#94a3b8",
};

export default function FriendProfileModal({ friendId, friendUsername, senderCoins = 0, onClose }: FriendProfileModalProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showSendGift, setShowSendGift] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery<any>({
    queryKey: ["/api/users", friendId, "profile"],
    queryFn: () => fetch(`/api/users/${friendId}/profile`).then(r => r.json()),
    enabled: !!friendId,
  });

  const { data: badges = [], isLoading: badgesLoading } = useQuery<any[]>({
    queryKey: ["/api/users", friendId, "badges"],
    queryFn: () => fetch(`/api/users/${friendId}/badges`).then(r => r.json()),
    enabled: !!friendId,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/friends/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      toast({ title: "Friend removed" });
      onClose();
    },
  });

  const loading = profileLoading || badgesLoading;
  const activePet = profile?.activePet;
  const rarityColor = activePet ? (RARITY_COLOR[activePet.rarity] ?? "#94a3b8") : "#94a3b8";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[99995]"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        data-testid="friend-profile-modal"
        className="fixed z-[99996] flex flex-col"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 280,
          maxHeight: "78vh",
          overflowY: "auto",
          background: "linear-gradient(160deg, rgba(4,14,8,0.99) 0%, rgba(3,10,6,0.99) 100%)",
          border: "1.5px solid rgba(127,255,212,0.22)",
          borderRadius: 18,
          boxShadow: "0 12px 60px rgba(0,0,0,0.9), 0 0 40px rgba(127,255,212,0.06)",
          padding: "18px 16px 20px",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", cursor: "pointer", color: "rgba(127,255,212,0.4)", fontSize: 20, lineHeight: 1 }}
        >×</button>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <span className="font-fantasy text-xs" style={{ color: "rgba(127,255,212,0.5)" }}>Loading…</span>
          </div>
        ) : (
          <>
            {/* Header — avatar + username */}
            <div className="flex items-center gap-3 mb-4">
              {profile?.profileImage ? (
                <img
                  src={profile.profileImage}
                  alt={friendUsername}
                  style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(127,255,212,0.35)", flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(127,255,212,0.1)", border: "2px solid rgba(127,255,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 20, color: "#7fffd4", fontWeight: "bold" }}>{(friendUsername ?? "?").charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div>
                <p className="font-fantasy font-semibold" style={{ color: "#f0e8c8", fontSize: 14, letterSpacing: "0.05em" }}>{profile?.username ?? friendUsername}</p>
                <p className="font-fantasy" style={{ color: "rgba(127,255,212,0.5)", fontSize: 9, letterSpacing: "0.15em", marginTop: 2 }}>PLAYER</p>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(127,255,212,0.18), transparent)", marginBottom: 14 }} />

            {/* Active Pet */}
            <div style={{ marginBottom: 14 }}>
              <p className="font-fantasy" style={{ fontSize: 9, color: "rgba(127,255,212,0.6)", letterSpacing: "0.2em", marginBottom: 8 }}>ACTIVE PET</p>
              {activePet ? (
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 12, background: "rgba(127,255,212,0.04)", border: `1px solid ${rarityColor}33` }}
                >
                  <img
                    src={activePet.hatchedImageUrl || activePet.imageUrl}
                    alt={activePet.name}
                    style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 8, background: "rgba(0,0,0,0.3)", flexShrink: 0 }}
                  />
                  <div className="min-w-0">
                    <p className="font-fantasy truncate" style={{ color: "#d4e8da", fontSize: 12 }}>
                      {activePet.nickname || activePet.name}
                    </p>
                    {activePet.nickname && (
                      <p className="font-fantasy truncate" style={{ color: "rgba(127,255,212,0.45)", fontSize: 9 }}>{activePet.name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-fantasy" style={{ fontSize: 9, color: rarityColor }}>{activePet.rarity}</span>
                      <span className="font-fantasy" style={{ fontSize: 9, color: "rgba(240,192,64,0.8)" }}>Lv.{activePet.petLevel}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="font-fantasy text-xs" style={{ color: "#5a8070", paddingLeft: 4 }}>No active pet</p>
              )}
            </div>

            {/* Badges */}
            {badges.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p className="font-fantasy" style={{ fontSize: 9, color: "rgba(127,255,212,0.6)", letterSpacing: "0.2em", marginBottom: 8 }}>BADGES</p>
                <div className="flex flex-wrap gap-2">
                  {badges.map((b: any) => (
                    <div
                      key={b.badgeId}
                      title={b.name}
                      style={{ width: 38, height: 38, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(127,255,212,0.2)", background: "rgba(127,255,212,0.05)", flexShrink: 0 }}
                    >
                      {b.imageUrl ? (
                        <img src={b.imageUrl} alt={b.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 18 }}>🏅</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Visit button */}
            <button
              data-testid="button-visit-friend-house"
              onClick={() => { onClose(); navigate(`/visit/${friendId}`); }}
              className="font-fantasy tracking-wider w-full"
              style={{
                padding: "10px 0",
                borderRadius: 10,
                background: "linear-gradient(135deg, rgba(74,222,128,0.22) 0%, rgba(22,163,74,0.18) 100%)",
                border: "1.5px solid rgba(74,222,128,0.5)",
                color: "#4ade80",
                cursor: "pointer",
                fontSize: 11,
                letterSpacing: "0.12em",
                marginBottom: 8,
              }}
            >
              🏠 Visit Pet House
            </button>

            {/* Send Gift button */}
            <button
              data-testid="button-send-gift-open"
              onClick={() => setShowSendGift(true)}
              className="font-fantasy tracking-wider w-full"
              style={{
                padding: "10px 0",
                borderRadius: 10,
                background: "linear-gradient(135deg, rgba(240,192,64,0.18) 0%, rgba(200,150,0,0.14) 100%)",
                border: "1.5px solid rgba(240,192,64,0.45)",
                color: "#ffd700",
                cursor: "pointer",
                fontSize: 11,
                letterSpacing: "0.12em",
                marginBottom: 8,
              }}
            >
              🎁 Send Gift
            </button>

            {/* Remove friend */}
            <button
              data-testid={`button-remove-friend-modal-${friendId}`}
              onClick={() => removeMutation.mutate(friendId)}
              disabled={removeMutation.isPending}
              className="font-fantasy tracking-wider w-full"
              style={{
                padding: "7px 0",
                borderRadius: 10,
                background: "none",
                border: "1px solid rgba(248,113,113,0.2)",
                color: "rgba(248,113,113,0.5)",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: "0.1em",
              }}
            >
              Remove Friend
            </button>
          </>
        )}
      </div>

      {showSendGift && (
        <SendGiftModal
          friendId={friendId}
          friendUsername={friendUsername}
          senderCoins={senderCoins}
          onClose={() => setShowSendGift(false)}
        />
      )}
    </>
  );
}
