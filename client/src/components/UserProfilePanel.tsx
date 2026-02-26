import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import profileFrameImg from "@assets/frame_profile.png";

interface User {
  id: string;
  username: string;
  email: string;
  profileImage: string | null;
  coins: number;
  isAdmin: boolean;
  lastUsernameChange: string | null;
  lastProfilePicChange: string | null;
}

interface Props {
  user: User;
  onClose: () => void;
  onUserUpdate: (user: User) => void;
}

function resizeImageTo500(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = Math.min(img.width, img.height);
        canvas.width = 500;
        canvas.height = 500;
        const ctx = canvas.getContext("2d")!;
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 500, 500);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function canChangeUsername(lastChange: string | null): { can: boolean; daysLeft: number } {
  if (!lastChange) return { can: true, daysLeft: 0 };
  const last = new Date(lastChange);
  const nextChange = new Date(last);
  nextChange.setMonth(nextChange.getMonth() + 1);
  const now = new Date();
  if (now >= nextChange) return { can: true, daysLeft: 0 };
  const daysLeft = Math.ceil((nextChange.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return { can: false, daysLeft };
}


export default function UserProfilePanel({ user, onClose, onUserUpdate }: Props) {
  const [newUsername, setNewUsername] = useState(user.username);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [profileImageData, setProfileImageData] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const usernameStatus = canChangeUsername(user.lastUsernameChange);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageTo500(file);
      setProfileImageData(resized);
      setProfilePreview(resized);
    } catch {
      toast({ title: "Image Error", description: "Failed to process image", variant: "destructive" });
    }
  }, [toast]);

  const updateUsernameMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/user/username", { username: newUsername });
      return res.json();
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      onUserUpdate(data);
      toast({ title: "Username Updated", description: "Your username has been changed successfully" });
    },
    onError: (err: any) => {
      const msg = err.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed: any = {};
      try { parsed = JSON.parse(msg); } catch {}
      toast({ title: "Update Failed", description: parsed.message || msg || "Failed to update username", variant: "destructive" });
    },
  });

  const updateProfilePicMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/user/profile-image", { profileImageData });
      return res.json();
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      onUserUpdate(data);
      toast({ title: "Photo Updated", description: "Your profile picture has been updated" });
    },
    onError: (err: any) => {
      const msg = err.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed: any = {};
      try { parsed = JSON.parse(msg); } catch {}
      toast({ title: "Update Failed", description: parsed.message || msg || "Failed to update photo", variant: "destructive" });
      setProfilePreview(null);
      setProfileImageData(null);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout", {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.clear();
      window.location.href = "/auth";
    },
    onError: () => {
      toast({ title: "Error", description: "Logout failed", variant: "destructive" });
    },
  });

  const isPending = updateUsernameMutation.isPending || updateProfilePicMutation.isPending || logoutMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: "480px", margin: "0 auto", left: 0, right: 0 }}>
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative w-full rounded-t-3xl animate-slide-up overflow-y-auto"
        style={{
          background: "linear-gradient(180deg, #1a0e05 0%, #2a1808 60%, #1a0e05 100%)",
          border: "1px solid rgba(212,160,23,0.4)",
          borderBottom: "none",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.8), inset 0 1px 0 rgba(212,160,23,0.3)",
          maxHeight: "85vh",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl" style={{ background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.6), transparent)" }} />

        <button
          data-testid="button-close-profile"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-colors z-20"
          style={{
            background: "rgba(212,160,23,0.15)",
            border: "1px solid rgba(212,160,23,0.4)",
            color: "#d4a017",
            fontSize: "18px",
            cursor: "pointer",
          }}
        >
          ✕
        </button>

        <div className="px-6 pt-6 pb-10 space-y-6">
          <h2 className="font-fantasy text-[#f0c040] text-center text-xl tracking-widest font-semibold"
            style={{ textShadow: "0 0 20px rgba(240,192,64,0.4)" }}
          >
            Adventurer Profile
          </h2>

          {/* Profile Picture Section */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative w-24 h-24 cursor-pointer transition-transform active:scale-95"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-profile-pic-change"
            >
              <img
                src={profileFrameImg}
                alt="Frame"
                className="absolute inset-0 w-full h-full object-contain z-20"
                style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.8))" }}
              />
              <div className="absolute z-10 overflow-hidden rounded-sm" style={{ inset: "18px" }}>
                {profilePreview || user.profileImage ? (
                  <img
                    data-testid="img-profile-current"
                    src={profilePreview || user.profileImage!}
                    alt={user.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)" }}
                  >
                    <span className="font-fantasy text-[#d4a017] text-3xl font-bold">
                      {user.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              <div className="absolute -bottom-1 -right-1 z-30 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: "rgba(212,160,23,0.9)", border: "1px solid rgba(240,192,64,0.8)" }}
              >
                <span className="text-black text-xs font-bold">+</span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              data-testid="input-profile-pic-file"
            />

            <div className="flex flex-col items-center gap-2 w-full">
              {profileImageData && (
                <button
                  data-testid="button-save-profile-pic"
                  onClick={() => updateProfilePicMutation.mutate()}
                  disabled={isPending}
                  className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-opacity disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                    border: "1px solid rgba(45,154,100,0.6)",
                    color: "#7fffd4",
                    boxShadow: "0 0 12px rgba(127,255,212,0.2)",
                    cursor: "pointer",
                  }}
                >
                  {updateProfilePicMutation.isPending ? "Saving..." : "Save New Photo"}
                </button>
              )}
              {!profileImageData && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="font-fantasy text-xs text-[#a89878] tracking-wider hover:text-[#d4a017] transition-colors"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  Tap portrait to change photo
                </button>
              )}
            </div>
          </div>

          <div className="w-full h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.3), transparent)" }} />

          {/* Username Section */}
          <div className="space-y-2">
            <label className="font-fantasy text-[#c8b896] text-xs tracking-wider block">
              USERNAME
              {!usernameStatus.can && (
                <span className="ml-2 text-[#6a5840]">
                  (change in {usernameStatus.daysLeft} days)
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                data-testid="input-new-username"
                type="text"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                disabled={!usernameStatus.can || isPending}
                placeholder={user.username}
                className="flex-1 px-4 py-3 rounded-md font-sans text-sm outline-none focus:ring-2 focus:ring-[#d4a017] disabled:opacity-50"
                style={{
                  background: usernameStatus.can
                    ? "linear-gradient(135deg, #f2e8d0 0%, #e8d8b0 100%)"
                    : "rgba(30,20,10,0.5)",
                  border: "2px solid #8b5e3c",
                  color: usernameStatus.can ? "#2a1a0a" : "#6a5840",
                  boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3)",
                }}
              />
              {usernameStatus.can && (
                <button
                  data-testid="button-save-username"
                  onClick={() => updateUsernameMutation.mutate()}
                  disabled={isPending || newUsername === user.username || !newUsername.trim()}
                  className="px-4 py-3 rounded-md font-fantasy text-xs tracking-wider transition-opacity disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)",
                    border: "1px solid rgba(212,160,23,0.5)",
                    color: "#f0c040",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  }}
                >
                  {updateUsernameMutation.isPending ? "..." : "Save"}
                </button>
              )}
            </div>
          </div>

          <div className="w-full h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.3), transparent)" }} />

          {/* Account Info */}
          <div
            className="px-4 py-3 rounded-md space-y-1"
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(139,94,60,0.3)",
            }}
          >
            <p className="font-fantasy text-[#6a5840] text-xs tracking-widest">ACCOUNT INFO</p>
            <p className="font-sans text-[#a89878] text-xs">{user.email}</p>
            {user.isAdmin && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-400 text-xs">&#9733;</span>
                <span className="font-fantasy text-[#d4a017] text-xs tracking-wider">Administrator</span>
              </div>
            )}
          </div>

          {/* Logout */}
          <button
            data-testid="button-logout"
            onClick={() => logoutMutation.mutate()}
            disabled={isPending}
            className="w-full py-3 rounded-md font-fantasy text-sm tracking-widest transition-all disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, rgba(139,0,0,0.4) 0%, rgba(80,0,0,0.4) 100%)",
              border: "1px solid rgba(200,50,50,0.4)",
              color: "#ff9999",
              cursor: "pointer",
              boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            }}
          >
            {logoutMutation.isPending ? "Departing..." : "Leave Realm"}
          </button>
        </div>
      </div>
    </div>
  );
}
