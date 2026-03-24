import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  username: string;
  email: string;
  profileImage: string | null;
  coins: number;
  isAdmin: boolean;
  activePetId: string | null;
  lastUsernameChange: string | null;
  lastProfilePicChange: string | null;
}

interface Props {
  user: User;
  onClose: () => void;
  onUserUpdate: (user: User) => void;
}

function cropToCanvas(src: string, offsetX: number, offsetY: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 500;
      canvas.height = 500;
      const ctx = canvas.getContext("2d")!;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      let srcX: number, srcY: number, srcSize: number;
      if (w >= h) {
        srcSize = h;
        srcX = ((offsetX / 100) * (w - h));
        srcY = 0;
      } else {
        srcSize = w;
        srcX = 0;
        srcY = ((offsetY / 100) * (h - w));
      }
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, 500, 500);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = src;
  });
}

export default function UserProfilePanel({ user, onClose, onUserUpdate }: Props) {
  const [newUsername, setNewUsername] = useState("");
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [profileImageData, setProfileImageData] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  const [showFriends, setShowFriends] = useState(false);

  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropOffset, setCropOffset] = useState({ x: 50, y: 50 });
  const cropDragRef = useRef<{ startX: number; startY: number; startOX: number; startOY: number } | null>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        setCropOffset({ x: 50, y: 50 });
        setCropImageSrc(src);
      };
      reader.readAsDataURL(file);
    } catch {
      toast({ title: "Image Error", description: "Failed to load image", variant: "destructive" });
    }
  }, [toast]);

  const handleCropPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    cropDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOX: cropOffset.x,
      startOY: cropOffset.y,
    };
  }, [cropOffset]);

  const handleCropPointerMove = useCallback((e: React.PointerEvent) => {
    if (!cropDragRef.current || !cropContainerRef.current) return;
    const containerSize = cropContainerRef.current.offsetWidth;
    const dx = e.clientX - cropDragRef.current.startX;
    const dy = e.clientY - cropDragRef.current.startY;
    const sensitivity = 100 / containerSize;
    const newX = Math.max(0, Math.min(100, cropDragRef.current.startOX - dx * sensitivity));
    const newY = Math.max(0, Math.min(100, cropDragRef.current.startOY - dy * sensitivity));
    setCropOffset({ x: newX, y: newY });
  }, []);

  const handleCropPointerUp = useCallback(() => {
    cropDragRef.current = null;
  }, []);

  const handleApplyCrop = useCallback(async () => {
    if (!cropImageSrc) return;
    try {
      const dataUrl = await cropToCanvas(cropImageSrc, cropOffset.x, cropOffset.y);
      setProfileImageData(dataUrl);
      setProfilePreview(dataUrl);
      setCropImageSrc(null);
    } catch {
      toast({ title: "Image Error", description: "Failed to process image", variant: "destructive" });
    }
  }, [cropImageSrc, cropOffset, toast]);

  const updateUsernameMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/user/username", { username: newUsername });
      return res.json();
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      onUserUpdate(data);
      setNewUsername("");
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

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/user/password", { currentPassword, newPassword });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password Changed", description: "Your password has been updated" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowChangePassword(false);
    },
    onError: (err: any) => {
      const msg = err.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed: any = {};
      try { parsed = JSON.parse(msg); } catch {}
      toast({ title: "Update Failed", description: parsed.message || msg || "Failed to change password", variant: "destructive" });
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

  const deleteAccountMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/user/delete-account", { password });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.clear();
      window.location.href = "/auth";
    },
    onError: (err: any) => {
      const msg = err.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed: any = {};
      try { parsed = JSON.parse(msg); } catch {}
      const description = parsed.message || msg || "Failed to delete account";
      toast({ title: "Deletion Failed", description, variant: "destructive" });
      // Return to password step so they can try again
      setShowFinalConfirm(false);
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/support-message", {
        username: user.username,
        email: user.email,
        subject: "Player Feedback",
        message: feedbackMessage.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      setFeedbackSent(true);
      setFeedbackMessage("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send feedback. Please try again.", variant: "destructive" });
    },
  });

  const isPending = updateUsernameMutation.isPending || updateProfilePicMutation.isPending || changePasswordMutation.isPending || logoutMutation.isPending || deleteAccountMutation.isPending || feedbackMutation.isPending;

  const { data: friends = [] } = useQuery<any[]>({
    queryKey: ["/api/friends"],
    enabled: showFriends,
    refetchInterval: showFriends ? 15000 : false,
  });

  const { data: friendRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/friends/requests"],
    enabled: showFriends,
    refetchInterval: showFriends ? 15000 : false,
  });

  const acceptRequestMutation = useMutation({
    mutationFn: (requestId: string) => apiRequest("POST", `/api/friends/accept/${requestId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    },
    onError: () => toast({ title: "Error", description: "Could not accept request.", variant: "destructive" }),
  });

  const declineRequestMutation = useMutation({
    mutationFn: (otherId: string) => apiRequest("DELETE", `/api/friends/${otherId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    },
    onError: () => toast({ title: "Error", description: "Could not decline request.", variant: "destructive" }),
  });

  const removeFriendMutation = useMutation({
    mutationFn: (friendId: string) => apiRequest("DELETE", `/api/friends/${friendId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
    },
    onError: () => toast({ title: "Error", description: "Could not remove friend.", variant: "destructive" }),
  });

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
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
                className="relative w-24 h-24 cursor-pointer transition-transform active:scale-95 rounded-lg overflow-hidden"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-profile-pic-change"
                style={{
                  border: "2.5px solid #c9a030",
                  boxShadow: "0 0 8px rgba(201,160,48,0.3), 0 2px 8px rgba(0,0,0,0.5), inset 0 0 3px rgba(201,160,48,0.15)",
                }}
              >
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
                <div className="absolute bottom-1 right-1 z-10 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(212,160,23,0.9)", border: "1px solid rgba(240,192,64,0.8)" }}
                >
                  <span className="text-black text-xs font-bold leading-none">+</span>
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
              </label>
              <div className="flex gap-2">
                <input
                  data-testid="input-new-username"
                  type="text"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  disabled={isPending}
                  placeholder={user.username}
                  className="flex-1 px-4 py-3 rounded-md font-sans text-sm text-[#2a1a0a] placeholder-[#8a7060] outline-none focus:ring-2 focus:ring-[#d4a017] disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, #f2e8d0 0%, #e8d8b0 100%)",
                    border: "2px solid #8b5e3c",
                    boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3)",
                  }}
                />
                <button
                  data-testid="button-save-username"
                  onClick={() => updateUsernameMutation.mutate()}
                  disabled={isPending || !newUsername.trim()}
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

            <div>
              <button
                data-testid="button-toggle-change-password"
                onClick={() => setShowChangePassword(!showChangePassword)}
                className="w-full py-2.5 rounded-md font-fantasy text-xs tracking-widest transition-all"
                style={{
                  background: "linear-gradient(135deg, rgba(92,58,30,0.6) 0%, rgba(58,32,16,0.6) 100%)",
                  border: "1px solid rgba(212,160,23,0.3)",
                  color: "#d4a017",
                  cursor: "pointer",
                }}
              >
                {showChangePassword ? "Cancel" : "Change Password"}
              </button>

              {showChangePassword && (
                <div className="mt-2 space-y-2 p-3 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.15)" }}>
                  <input
                    data-testid="input-current-password"
                    type="password"
                    placeholder="Current Password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded font-sans text-xs"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(212,160,23,0.3)",
                      color: "#e8d8b0",
                      outline: "none",
                    }}
                  />
                  <input
                    data-testid="input-new-password"
                    type="password"
                    placeholder="New Password (min 6 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded font-sans text-xs"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(212,160,23,0.3)",
                      color: "#e8d8b0",
                      outline: "none",
                    }}
                  />
                  <input
                    data-testid="input-confirm-password"
                    type="password"
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded font-sans text-xs"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(212,160,23,0.3)",
                      color: "#e8d8b0",
                      outline: "none",
                    }}
                  />
                  {newPassword && confirmPassword && newPassword !== confirmPassword && (
                    <p className="font-fantasy text-[10px] text-red-400 tracking-wider">Passwords do not match</p>
                  )}
                  <button
                    data-testid="button-save-password"
                    onClick={() => changePasswordMutation.mutate()}
                    disabled={isPending || !currentPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 6}
                    className="w-full py-2 rounded font-fantasy text-xs tracking-widest transition-all disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                      border: "1px solid rgba(127,255,212,0.4)",
                      color: "#7fffd4",
                      cursor: "pointer",
                    }}
                  >
                    {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
                  </button>
                </div>
              )}
            </div>

            {/* Feedback Section */}
            <div>
              <button
                data-testid="button-toggle-feedback"
                onClick={() => { setShowFeedback(!showFeedback); setFeedbackSent(false); setFeedbackMessage(""); }}
                disabled={isPending}
                className="w-full py-2.5 rounded-md font-fantasy text-xs tracking-widest transition-all disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, rgba(42,58,92,0.6) 0%, rgba(25,38,70,0.6) 100%)",
                  border: "1px solid rgba(100,140,212,0.4)",
                  color: "#8ab4f8",
                  cursor: "pointer",
                }}
              >
                {showFeedback ? "Cancel" : "Send Feedback"}
              </button>

              {showFeedback && (
                <div
                  className="mt-2 rounded-lg p-3 space-y-3"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(100,140,212,0.2)" }}
                >
                  {feedbackSent ? (
                    <div className="text-center py-2 space-y-2">
                      <p className="font-fantasy text-[#7fffd4] text-sm tracking-wider" data-testid="text-feedback-sent">
                        Thanks for your feedback!
                      </p>
                      <p className="font-fantasy text-[#a89878] text-xs tracking-wider">
                        We read every message and appreciate you taking the time.
                      </p>
                      <button
                        onClick={() => { setShowFeedback(false); setFeedbackSent(false); }}
                        className="font-fantasy text-[#8ab4f8] text-xs tracking-wider hover:text-[#aaccff] transition-colors"
                        style={{ background: "none", border: "none", cursor: "pointer" }}
                      >
                        Close
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="font-fantasy text-[#8ab4f8] text-[10px] tracking-wider">
                        Share a bug, idea, or anything on your mind — it goes straight to the admin inbox.
                      </p>
                      <textarea
                        data-testid="input-feedback-message"
                        value={feedbackMessage}
                        onChange={e => setFeedbackMessage(e.target.value)}
                        disabled={feedbackMutation.isPending}
                        placeholder="What's on your mind?"
                        rows={4}
                        maxLength={2000}
                        className="w-full px-3 py-2 rounded font-sans text-xs resize-none outline-none disabled:opacity-60"
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(100,140,212,0.3)",
                          color: "#e8d8b0",
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <span className="font-fantasy text-[#6a5840] text-[9px] tracking-wider">
                          {feedbackMessage.length}/2000
                        </span>
                        <button
                          data-testid="button-submit-feedback"
                          onClick={() => feedbackMutation.mutate()}
                          disabled={feedbackMutation.isPending || !feedbackMessage.trim()}
                          className="px-4 py-1.5 rounded font-fantasy text-xs tracking-wider transition-all disabled:opacity-50"
                          style={{
                            background: "linear-gradient(135deg, #1a2d5a 0%, #0d1a3a 100%)",
                            border: "1px solid rgba(100,140,212,0.5)",
                            color: "#8ab4f8",
                            cursor: "pointer",
                          }}
                        >
                          {feedbackMutation.isPending ? "Sending..." : "Send"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Friends section ──────────────────────────────────────── */}
            <div className="space-y-2">
              <button
                data-testid="button-toggle-friends"
                onClick={() => setShowFriends(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all"
                style={{
                  background: showFriends ? "rgba(127,255,212,0.08)" : "rgba(127,255,212,0.04)",
                  border: "1px solid rgba(127,255,212,0.25)",
                  color: "#7fffd4",
                  cursor: "pointer",
                }}
              >
                <span className="font-fantasy text-xs tracking-widest">Friends</span>
                <span className="font-fantasy text-xs text-[#7fffd4]/60">{showFriends ? "▲" : "▼"}</span>
              </button>

              {showFriends && (
                <div
                  className="rounded-xl p-4 space-y-4"
                  style={{ background: "rgba(10,20,14,0.6)", border: "1px solid rgba(127,255,212,0.15)" }}
                >
                  {/* Pending requests */}
                  {friendRequests.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-fantasy text-[#7fffd4] text-[10px] tracking-widest uppercase">
                        Requests ({friendRequests.length})
                      </p>
                      {friendRequests.map((req: any) => (
                        <div
                          key={req.id}
                          className="flex items-center gap-3 py-2 px-3 rounded-lg"
                          style={{ background: "rgba(127,255,212,0.06)", border: "1px solid rgba(127,255,212,0.12)" }}
                          data-testid={`friend-request-${req.id}`}
                        >
                          <div className="flex-shrink-0">
                            {req.profileImage ? (
                              <img src={req.profileImage} alt={req.username} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(127,255,212,0.3)" }} />
                            ) : (
                              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(127,255,212,0.1)", border: "1px solid rgba(127,255,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 12, color: "#7fffd4", fontWeight: "bold" }}>{(req.username ?? "?").charAt(0).toUpperCase()}</span>
                              </div>
                            )}
                          </div>
                          <span className="font-fantasy text-[#d4e8da] text-xs flex-1 truncate" data-testid={`text-request-username-${req.id}`}>{req.username}</span>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button
                              data-testid={`button-accept-request-${req.id}`}
                              onClick={() => acceptRequestMutation.mutate(req.id)}
                              disabled={acceptRequestMutation.isPending}
                              className="px-2.5 py-1 rounded-md font-fantasy text-[10px] tracking-wider transition-all disabled:opacity-50"
                              style={{ background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.45)", color: "#4ade80", cursor: "pointer" }}
                            >
                              Accept
                            </button>
                            <button
                              data-testid={`button-decline-request-${req.id}`}
                              onClick={() => declineRequestMutation.mutate(req.requesterId)}
                              disabled={declineRequestMutation.isPending}
                              className="px-2.5 py-1 rounded-md font-fantasy text-[10px] tracking-wider transition-all disabled:opacity-50"
                              style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.35)", color: "#f87171", cursor: "pointer" }}
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                      <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(127,255,212,0.2), transparent)" }} />
                    </div>
                  )}

                  {/* Friends list */}
                  <div className="space-y-2">
                    <p className="font-fantasy text-[#7fffd4] text-[10px] tracking-widest uppercase">
                      My Friends ({friends.length})
                    </p>
                    {friends.length === 0 && friendRequests.length === 0 && (
                      <p className="font-fantasy text-[#5a8070] text-xs text-center py-3" data-testid="text-no-friends">
                        No friends yet — explore the world and add some!
                      </p>
                    )}
                    {friends.length === 0 && friendRequests.length > 0 && (
                      <p className="font-fantasy text-[#5a8070] text-xs text-center py-2" data-testid="text-no-friends-yet">
                        No friends yet
                      </p>
                    )}
                    {friends.map((f: any) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg"
                        style={{ background: "rgba(127,255,212,0.04)", border: "1px solid rgba(127,255,212,0.1)" }}
                        data-testid={`friend-row-${f.friendId}`}
                      >
                        <div className="flex-shrink-0">
                          {f.profileImage ? (
                            <img src={f.profileImage} alt={f.username} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(212,160,23,0.35)" }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 12, color: "#d4a017", fontWeight: "bold" }}>{(f.username ?? "?").charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                        </div>
                        <span className="font-fantasy text-[#d4e8da] text-xs flex-1 truncate" data-testid={`text-friend-username-${f.friendId}`}>{f.username}</span>
                        <button
                          data-testid={`button-remove-friend-${f.friendId}`}
                          onClick={() => removeFriendMutation.mutate(f.friendId)}
                          disabled={removeFriendMutation.isPending}
                          className="px-2.5 py-1 rounded-md font-fantasy text-[10px] tracking-wider transition-all disabled:opacity-50"
                          style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", cursor: "pointer" }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

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

            {/* Delete Account */}
            <div className="pt-1">
              {!showDeleteConfirm ? (
                <button
                  data-testid="button-show-delete-account"
                  onClick={() => { setShowDeleteConfirm(true); setShowFinalConfirm(false); setDeletePassword(""); }}
                  disabled={isPending}
                  className="w-full py-2 rounded-md font-fantasy text-xs tracking-widest transition-all disabled:opacity-60"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(120,30,30,0.4)",
                    color: "#8a4a4a",
                    cursor: "pointer",
                  }}
                >
                  Delete Account
                </button>
              ) : !showFinalConfirm ? (
                /* Step 1: Enter password */
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{
                    background: "rgba(80,10,10,0.5)",
                    border: "1px solid rgba(200,50,50,0.5)",
                    boxShadow: "0 0 20px rgba(180,0,0,0.2)",
                  }}
                >
                  <div className="flex items-start gap-2">
                    <span style={{ color: "#ff6b6b", fontSize: "18px", lineHeight: 1, flexShrink: 0 }}>⚠</span>
                    <div className="space-y-1.5">
                      <p className="font-fantasy text-[#ff6b6b] text-xs tracking-wider">This is irreversible</p>
                      <p className="font-sans text-[#c08080] text-[11px] leading-relaxed">
                        Your account, pets, items, coins, badges, and all progress will be <span style={{ color: "#ff8888", fontWeight: 600 }}>permanently erased</span>. This cannot be undone by anyone, including support.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-fantasy text-[#c08080] text-[10px] tracking-wider block">ENTER YOUR PASSWORD TO CONTINUE</label>
                    <input
                      data-testid="input-delete-password"
                      type="password"
                      value={deletePassword}
                      onChange={e => setDeletePassword(e.target.value)}
                      placeholder="Your current password"
                      className="w-full px-3 py-2.5 rounded-md font-sans text-sm text-[#2a1a0a] placeholder-[#9a6060] outline-none"
                      style={{
                        background: "linear-gradient(135deg, #f5d8d8 0%, #ecc0c0 100%)",
                        border: "2px solid #9a4040",
                        boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3)",
                      }}
                      onKeyDown={e => { if (e.key === "Enter" && deletePassword.trim()) setShowFinalConfirm(true); }}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      data-testid="button-cancel-delete"
                      onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); setShowFinalConfirm(false); }}
                      className="flex-1 py-2 rounded-md font-fantasy text-xs tracking-wider transition-opacity"
                      style={{
                        background: "rgba(60,30,10,0.6)",
                        border: "1px solid rgba(139,94,60,0.4)",
                        color: "#c8b896",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      data-testid="button-next-delete"
                      onClick={() => setShowFinalConfirm(true)}
                      disabled={!deletePassword.trim()}
                      className="flex-1 py-2 rounded-md font-fantasy text-xs tracking-wider transition-opacity disabled:opacity-50"
                      style={{
                        background: "linear-gradient(135deg, rgba(160,20,20,0.8) 0%, rgba(100,10,10,0.8) 100%)",
                        border: "1px solid rgba(220,60,60,0.6)",
                        color: "#ffaaaa",
                        cursor: "pointer",
                      }}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 2: Final "Are you sure?" confirmation */
                <div
                  className="rounded-xl p-4 space-y-4"
                  style={{
                    background: "rgba(80,10,10,0.5)",
                    border: "1px solid rgba(200,50,50,0.5)",
                    boxShadow: "0 0 20px rgba(180,0,0,0.2)",
                  }}
                >
                  <div className="text-center space-y-2">
                    <p className="font-fantasy text-[#ff6b6b] text-sm tracking-wider">Are you sure?</p>
                    <p className="font-sans text-[#c08080] text-[11px] leading-relaxed">
                      Your password, username, email, and <span style={{ color: "#ff8888", fontWeight: 600 }}>all account data</span> will be permanently deleted. There is no way to recover your account after this.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      data-testid="button-no-delete"
                      onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); setShowFinalConfirm(false); }}
                      disabled={deleteAccountMutation.isPending}
                      className="flex-1 py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-opacity disabled:opacity-50"
                      style={{
                        background: "rgba(40,80,40,0.7)",
                        border: "1px solid rgba(80,160,80,0.5)",
                        color: "#a0e0a0",
                        cursor: "pointer",
                      }}
                    >
                      No
                    </button>
                    <button
                      data-testid="button-yes-delete"
                      onClick={() => deleteAccountMutation.mutate(deletePassword)}
                      disabled={deleteAccountMutation.isPending}
                      className="flex-1 py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-opacity disabled:opacity-50"
                      style={{
                        background: "linear-gradient(135deg, rgba(180,20,20,0.9) 0%, rgba(120,10,10,0.9) 100%)",
                        border: "1px solid rgba(240,60,60,0.7)",
                        color: "#ffcccc",
                        cursor: "pointer",
                      }}
                    >
                      {deleteAccountMutation.isPending ? "Deleting..." : "Yes, Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Crop Modal */}
      {cropImageSrc && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.88)", maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
        >
          <div
            className="flex flex-col items-center gap-4 p-6 rounded-2xl mx-4"
            style={{
              background: "linear-gradient(180deg, #1a0e05 0%, #2a1808 100%)",
              border: "1px solid rgba(212,160,23,0.4)",
              boxShadow: "0 0 40px rgba(0,0,0,0.8)",
              width: "100%",
              maxWidth: "300px",
            }}
          >
            <h3
              className="font-fantasy text-[#f0c040] text-sm tracking-widest"
              style={{ textShadow: "0 0 12px rgba(240,192,64,0.4)" }}
            >
              Position Your Photo
            </h3>
            <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider text-center">
              Drag to choose which part shows
            </p>

            <div
              ref={cropContainerRef}
              data-testid="crop-preview"
              className="rounded-lg overflow-hidden"
              style={{
                width: "200px",
                height: "200px",
                border: "2px solid #c9a030",
                boxShadow: "0 0 10px rgba(201,160,48,0.3)",
                cursor: "grab",
                touchAction: "none",
                flexShrink: 0,
              }}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
            >
              <img
                src={cropImageSrc}
                alt="crop preview"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: `${cropOffset.x}% ${cropOffset.y}%`,
                  userSelect: "none",
                  pointerEvents: "none",
                  display: "block",
                }}
                draggable={false}
              />
            </div>

            <div className="flex gap-3 w-full">
              <button
                data-testid="button-crop-cancel"
                onClick={() => { setCropImageSrc(null); setCropOffset({ x: 50, y: 50 }); }}
                className="flex-1 py-2.5 rounded-md font-fantasy text-xs tracking-wider transition-opacity"
                style={{
                  background: "rgba(139,0,0,0.25)",
                  border: "1px solid rgba(200,50,50,0.4)",
                  color: "#ff9999",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                data-testid="button-crop-confirm"
                onClick={handleApplyCrop}
                className="flex-1 py-2.5 rounded-md font-fantasy text-xs tracking-wider transition-opacity"
                style={{
                  background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                  border: "1px solid rgba(45,154,100,0.6)",
                  color: "#7fffd4",
                  cursor: "pointer",
                }}
              >
                Use This
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
