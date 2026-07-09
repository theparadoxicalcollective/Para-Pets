import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ChevronDown, X, Pin, Trash2, Plus, MessageSquare, Star } from "lucide-react";

import forumTitleImg  from "@assets/Photoroom_20260708_100323_PM_1783566697221.png";
import forumDefaultBg from "@assets/Photoroom_20260708_101925_PM_1783567178576.png";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ForumPost {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  is_pinned: boolean;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
  comment_count: number;
  like_count: number;
  user_liked: boolean;
}

interface ForumComment {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  like_count: number;
  user_liked: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function timeSince(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Avatar({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  return src ? (
    <img src={src} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid rgba(212,168,67,0.35)" }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "rgba(40,80,40,0.7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(212,168,67,0.2)", fontSize: size * 0.45, color: "#d4a843", fontFamily: "serif" }}>
      {(name[0] ?? "?").toUpperCase()}
    </div>
  );
}

function LikeButton({ liked, count, onToggle, disabled }: { liked: boolean; count: number; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); if (!disabled) onToggle(); }}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        background: liked ? "rgba(240,192,64,0.12)" : "rgba(255,255,255,0.04)",
        border: liked ? "1px solid rgba(240,192,64,0.35)" : "1px solid rgba(212,168,67,0.15)",
        borderRadius: 20, padding: "3px 8px",
        cursor: disabled ? "default" : "pointer",
        transition: "all 0.18s",
      }}
    >
      <Star
        size={12}
        fill={liked ? "#f0c040" : "none"}
        color={liked ? "#f0c040" : "rgba(212,168,67,0.45)"}
        style={{ transition: "fill 0.2s" }}
      />
      <span style={{ fontSize: 11, color: liked ? "#f0c040" : "rgba(212,168,67,0.45)", fontFamily: "serif", minWidth: 12 }}>{count}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thread view
// ─────────────────────────────────────────────────────────────────────────────
function ThreadView({ post, user, onClose, onLikePost }: {
  post: ForumPost; user: any; onClose: () => void; onLikePost: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [commentText, setCommentText] = useState("");

  const { data: comments = [], isLoading } = useQuery<ForumComment[]>({
    queryKey: ["/api/forum/posts", post.id, "comments"],
    queryFn: () => fetch(`/api/forum/posts/${post.id}/comments`, { credentials: "include" }).then(r => r.json()),
    staleTime: 10_000,
  });

  const addComment = useMutation({
    mutationFn: (body: string) => apiRequest("POST", `/api/forum/posts/${post.id}/comments`, { body }).then(r => r.json()),
    onSuccess: () => {
      setCommentText("");
      qc.invalidateQueries({ queryKey: ["/api/forum/posts", post.id, "comments"] });
      qc.invalidateQueries({ queryKey: ["/api/forum/posts"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteComment = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/forum/comments/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/forum/posts", post.id, "comments"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const likeComment = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/forum/comments/${id}/like`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/forum/posts", post.id, "comments"] }),
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(2,8,4,0.94)", backdropFilter: "blur(10px)", overflowY: "auto", padding: "16px 12px 40px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={onClose} data-testid="button-forum-close-thread"
            style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(10,20,10,0.8)", border: "1px solid rgba(212,168,67,0.3)", color: "#d4a843", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <ChevronDown size={16} style={{ transform: "rotate(90deg)" }} />
          </button>
          <span className="font-fantasy text-xs tracking-widest" style={{ color: "rgba(212,168,67,0.6)" }}>Forum</span>
        </div>

        {/* Post image */}
        {post.image_url && (
          <div style={{ borderRadius: "16px 16px 0 0", overflow: "hidden", border: "1px solid rgba(212,168,67,0.2)", borderBottom: "none" }}>
            <img src={post.image_url} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", display: "block" }} />
          </div>
        )}

        {/* Post body */}
        <div style={{
          background: "rgba(8,20,10,0.9)",
          border: "1px solid rgba(212,168,67,0.18)",
          borderRadius: post.image_url ? "0 0 14px 14px" : 14,
          padding: "16px 16px 14px",
          marginBottom: 14,
        }}>
          {post.is_pinned && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
              <Pin size={11} color="#d4a843" />
              <span style={{ fontSize: 10, color: "#d4a843", letterSpacing: "0.15em" }} className="font-fantasy">PINNED</span>
            </div>
          )}
          <h2 className="font-fantasy" style={{ fontSize: 18, color: "#f0d060", textShadow: "0 0 18px rgba(212,168,67,0.4)", marginBottom: 10, lineHeight: 1.3 }}>{post.title}</h2>
          {post.body && (
            <p style={{ fontSize: 13, color: "rgba(220,210,180,0.88)", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 14 }}>{post.body}</p>
          )}
          {/* Author + like row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar src={post.author_avatar} name={post.author_name ?? "?"} size={22} />
              <span style={{ fontSize: 11, color: "rgba(212,168,67,0.55)" }} className="font-fantasy">{post.author_name ?? "Admin"} · {timeSince(post.created_at)}</span>
            </div>
            <LikeButton liked={post.user_liked} count={post.like_count} onToggle={onLikePost} disabled={!user} />
          </div>
        </div>

        {/* Comments */}
        <h3 className="font-fantasy text-xs tracking-widest mb-3" style={{ color: "rgba(212,168,67,0.5)" }}>
          {comments.length > 0 ? `${comments.length} COMMENT${comments.length !== 1 ? "S" : ""}` : "NO COMMENTS YET"}
        </h3>

        <div style={{ marginBottom: 14 }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(212,168,67,0.3)", borderTopColor: "#d4a843", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {comments.map(c => (
                <div key={c.id} style={{ background: "rgba(6,15,8,0.85)", border: "1px solid rgba(212,168,67,0.1)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                    <Avatar src={c.author_avatar} name={c.author_name} size={20} />
                    <span style={{ fontSize: 11, color: "rgba(212,168,67,0.65)", flex: 1 }} className="font-fantasy">{c.author_name} · {timeSince(c.created_at)}</span>
                    {(user?.isAdmin || user?.id === c.author_id) && (
                      <button onClick={() => deleteComment.mutate(c.id)} data-testid={`button-delete-comment-${c.id}`}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,100,100,0.5)", padding: 2 }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: "rgba(210,200,170,0.88)", lineHeight: 1.55, whiteSpace: "pre-wrap", marginBottom: 8 }}>{c.body}</p>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <LikeButton
                      liked={c.user_liked}
                      count={c.like_count}
                      onToggle={() => likeComment.mutate(c.id)}
                      disabled={!user || likeComment.isPending}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comment input */}
        {user ? (
          <div style={{ background: "rgba(8,20,10,0.9)", border: "1px solid rgba(212,168,67,0.2)", borderRadius: 12, padding: "12px 14px" }}>
            <textarea
              data-testid="input-forum-comment"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              maxLength={1000}
              rows={3}
              style={{ width: "100%", background: "rgba(4,12,6,0.7)", border: "1px solid rgba(212,168,67,0.15)", borderRadius: 8, color: "#d4c880", fontSize: 13, padding: "8px 10px", resize: "none", fontFamily: "serif", outline: "none" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                data-testid="button-submit-comment"
                onClick={() => commentText.trim() && addComment.mutate(commentText)}
                disabled={!commentText.trim() || addComment.isPending}
                className="font-fantasy"
                style={{ padding: "7px 18px", borderRadius: 8, background: commentText.trim() ? "rgba(40,100,40,0.85)" : "rgba(20,40,20,0.5)", border: "1px solid rgba(212,168,67,0.35)", color: "#d4a843", fontSize: 11, letterSpacing: "0.1em", cursor: commentText.trim() ? "pointer" : "default", transition: "all 0.2s" }}
              >
                {addComment.isPending ? "Posting…" : "Post Comment"}
              </button>
            </div>
          </div>
        ) : (
          <p style={{ textAlign: "center", fontSize: 12, color: "rgba(212,168,67,0.45)" }} className="font-fantasy">Sign in to leave a comment</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ForumPage
// ─────────────────────────────────────────────────────────────────────────────
export default function ForumPage() {
  const [, navigate] = useLocation();
  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"], retry: false, staleTime: 30_000 });
  const { data: posts = [], isLoading } = useQuery<ForumPost[]>({
    queryKey: ["/api/forum/posts"],
    staleTime: 15_000,
  });
  const qc = useQueryClient();
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const openPost = openPostId ? (posts.find(p => p.id === openPostId) ?? null) : null;

  const likePost = useMutation({
    mutationFn: (postId: string) => apiRequest("POST", `/api/forum/posts/${postId}/like`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/forum/posts"] }),
  });

  const bgImage = posts.find(p => !!p.image_url)?.image_url ?? forumDefaultBg;

  return (
    <div
      data-testid="forum-page"
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        backgroundImage: `url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        overflowY: "auto",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(2,8,4,0.78)", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto", padding: "16px 14px 60px" }}>

        {/* Back button */}
        <button
          data-testid="button-forum-back"
          onClick={() => navigate("/")}
          className="font-fantasy text-xs tracking-widest"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(6,14,8,0.75)", border: "1px solid rgba(212,168,67,0.25)", borderRadius: 8, color: "rgba(212,168,67,0.7)", padding: "6px 12px", cursor: "pointer", marginBottom: 16 }}
        >
          <ChevronDown size={12} style={{ transform: "rotate(90deg)" }} /> Back
        </button>

        {/* Forum title image */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <img src={forumTitleImg} alt="Forum" style={{ width: "min(300px, 80vw)", height: "auto", filter: "drop-shadow(0 0 22px rgba(80,160,80,0.45))" }} draggable={false} />
        </div>

        {/* Admin button */}
        {user?.isAdmin && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              data-testid="button-forum-admin"
              onClick={() => navigate("/admin")}
              className="font-fantasy text-xs tracking-widest"
              style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(40,100,40,0.8)", border: "1px solid rgba(100,200,100,0.4)", borderRadius: 8, color: "#a0e090", padding: "7px 14px", cursor: "pointer" }}
            >
              <Plus size={12} /> Manage Posts
            </button>
          </div>
        )}

        {/* Posts list */}
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(212,168,67,0.3)", borderTopColor: "#d4a843", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <p className="font-fantasy" style={{ color: "rgba(212,168,67,0.5)", fontSize: 14 }}>No posts yet — check back soon!</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {posts.map(post => (
              <div
                key={post.id}
                style={{
                  background: "rgba(8,20,10,0.85)",
                  border: `1px solid ${post.is_pinned ? "rgba(212,168,67,0.38)" : "rgba(212,168,67,0.14)"}`,
                  borderRadius: 16,
                  overflow: "hidden",
                  boxShadow: post.is_pinned ? "0 0 18px rgba(212,168,67,0.1)" : "none",
                }}
              >
                {/* Image — clickable */}
                {post.image_url && (
                  <button
                    data-testid={`forum-post-img-${post.id}`}
                    onClick={() => setOpenPostId(post.id)}
                    style={{ display: "block", width: "100%", border: "none", padding: 0, cursor: "pointer", background: "none" }}
                  >
                    <div style={{ height: 180, overflow: "hidden" }}>
                      <img src={post.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.3s" }} />
                    </div>
                  </button>
                )}

                <div style={{ padding: "12px 14px 12px" }}>
                  {post.is_pinned && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
                      <Pin size={10} color="#d4a843" />
                      <span style={{ fontSize: 9, color: "#d4a843", letterSpacing: "0.18em" }} className="font-fantasy">PINNED</span>
                    </div>
                  )}

                  {/* Title — clickable */}
                  <button
                    data-testid={`forum-post-${post.id}`}
                    onClick={() => setOpenPostId(post.id)}
                    style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "0 0 8px", cursor: "pointer" }}
                  >
                    <h3 className="font-fantasy" style={{ fontSize: 15, color: "#f0d060", lineHeight: 1.35 }}>{post.title}</h3>
                  </button>

                  {/* Bottom row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Avatar src={post.author_avatar} name={post.author_name ?? "Admin"} size={20} />
                    <span style={{ fontSize: 10, color: "rgba(212,168,67,0.5)", flex: 1 }} className="font-fantasy">{post.author_name ?? "Admin"} · {timeSince(post.created_at)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 4 }}>
                      <MessageSquare size={11} color="rgba(212,168,67,0.4)" />
                      <span style={{ fontSize: 10, color: "rgba(212,168,67,0.4)" }}>{post.comment_count}</span>
                    </div>
                    <LikeButton
                      liked={post.user_liked}
                      count={post.like_count}
                      onToggle={() => user && likePost.mutate(post.id)}
                      disabled={!user || likePost.isPending}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openPost && (
        <ThreadView
          post={openPost}
          user={user}
          onClose={() => setOpenPostId(null)}
          onLikePost={() => user && likePost.mutate(openPost.id)}
        />
      )}
    </div>
  );
}
