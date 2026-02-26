import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import bgImg from "@assets/bg_home.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import profileFrameImg from "@assets/frame_profile.png";

interface AdminPageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

interface MemberUser {
  id: string;
  username: string;
  email: string;
  profileImage: string | null;
  coins: number;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: string;
}

export default function AdminPage({ user }: AdminPageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [coinAmounts, setCoinAmounts] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery<MemberUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const banMutation = useMutation({
    mutationFn: async ({ userId, ban }: { userId: string; ban: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/${ban ? "ban" : "unban"}/${userId}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Updated", description: "User status changed" });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  const coinsMutation = useMutation({
    mutationFn: async ({ userId, amount }: { userId: string; amount: number }) => {
      const res = await apiRequest("POST", `/api/admin/coins/${userId}`, { amount });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Coins Updated", description: "Coins modified successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  const handleGiveCoins = (userId: string) => {
    const val = parseInt(coinAmounts[userId] || "0");
    if (!val) return;
    coinsMutation.mutate({ userId, amount: val });
    setCoinAmounts(prev => ({ ...prev, [userId]: "" }));
  };

  return (
    <div
      className="relative w-full min-h-[100dvh] overflow-hidden flex flex-col"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black/80 z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-[100dvh]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} />

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <h2
            className="font-fantasy text-[#f0c040] text-center text-lg tracking-widest font-semibold mb-4"
            style={{ textShadow: "0 0 20px rgba(240,192,64,0.4)" }}
          >
            Realm Administration
          </h2>

          {isLoading ? (
            <div className="text-center py-8">
              <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Summoning records...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  data-testid={`card-member-${member.id}`}
                  className="rounded-lg p-3"
                  style={{
                    background: member.isBanned
                      ? "linear-gradient(135deg, rgba(80,10,10,0.7) 0%, rgba(40,5,5,0.7) 100%)"
                      : "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(50,30,10,0.85) 100%)",
                    border: member.isBanned
                      ? "1px solid rgba(200,50,50,0.4)"
                      : "1px solid rgba(212,160,23,0.3)",
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="relative w-10 h-10 flex-shrink-0">
                      <img src={profileFrameImg} alt="" className="absolute inset-0 w-full h-full object-contain z-20" />
                      <div className="absolute z-10 overflow-hidden rounded-sm" style={{ inset: "6px" }}>
                        {member.profileImage ? (
                          <img src={member.profileImage} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: "#2a1a0a" }}>
                            <span className="font-fantasy text-[#d4a017] text-xs font-bold">{member.username.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-fantasy text-[#f0c040] text-sm font-semibold truncate" data-testid={`text-member-name-${member.id}`}>
                          {member.username}
                        </p>
                        {member.isAdmin && <span className="text-yellow-400 text-xs">&#9733;</span>}
                        {member.isBanned && (
                          <span className="font-fantasy text-[#ff6666] text-[10px] tracking-wider">BANISHED</span>
                        )}
                      </div>
                      <p className="text-[#a89878] text-[10px] truncate">{member.email}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-yellow-400 text-[10px]">&#9733;</span>
                        <span className="font-fantasy text-[#f0c040] text-[10px]">{member.coins} coins</span>
                      </div>
                    </div>
                  </div>

                  {!member.isAdmin && (
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        data-testid={`button-ban-${member.id}`}
                        onClick={() => banMutation.mutate({ userId: member.id, ban: !member.isBanned })}
                        disabled={banMutation.isPending}
                        className="px-3 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-opacity disabled:opacity-50"
                        style={{
                          background: member.isBanned
                            ? "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)"
                            : "linear-gradient(135deg, rgba(139,0,0,0.6) 0%, rgba(80,0,0,0.6) 100%)",
                          border: member.isBanned
                            ? "1px solid rgba(45,154,100,0.5)"
                            : "1px solid rgba(200,50,50,0.4)",
                          color: member.isBanned ? "#7fffd4" : "#ff9999",
                          cursor: "pointer",
                        }}
                      >
                        {member.isBanned ? "Unbanish" : "Banish"}
                      </button>

                      <div className="flex items-center gap-1 flex-1">
                        <input
                          data-testid={`input-coins-${member.id}`}
                          type="number"
                          placeholder="±coins"
                          value={coinAmounts[member.id] || ""}
                          onChange={(e) => setCoinAmounts(prev => ({ ...prev, [member.id]: e.target.value }))}
                          className="w-20 px-2 py-1.5 rounded-md font-sans text-xs outline-none"
                          style={{
                            background: "rgba(242,232,208,0.9)",
                            border: "1px solid #8b5e3c",
                            color: "#2a1a0a",
                          }}
                        />
                        <button
                          data-testid={`button-give-coins-${member.id}`}
                          onClick={() => handleGiveCoins(member.id)}
                          disabled={coinsMutation.isPending || !coinAmounts[member.id]}
                          className="px-3 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-opacity disabled:opacity-50"
                          style={{
                            background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)",
                            border: "1px solid rgba(212,160,23,0.5)",
                            color: "#f0c040",
                            cursor: "pointer",
                          }}
                        >
                          Give
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(updatedUser) => {
            setCurrentUser(updatedUser);
            setShowProfile(false);
          }}
        />
      )}
    </div>
  );
}
