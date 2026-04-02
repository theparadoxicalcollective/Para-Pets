import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import coinIconImg from "@assets/icon_coin.png";
import giftIconImg from "@assets/generated_images/gift_icon_forest.png";

interface PendingGift {
  id: string;
  senderId: string;
  receiverId: string;
  message: string | null;
  coinAmount: number;
  itemType: string | null;
  itemName: string | null;
  itemImageUrl: string | null;
  itemQuantity: number;
  status: string;
  createdAt: string;
  senderName: string;
  senderProfileImageUrl: string | null;
}

interface GiftClaimModalProps {
  onClose: () => void;
}

export default function GiftClaimModal({ onClose }: GiftClaimModalProps) {
  const { toast } = useToast();

  const { data: gifts = [], isLoading } = useQuery<PendingGift[]>({
    queryKey: ["/api/gifts/pending"],
    queryFn: () => fetch("/api/gifts/pending", { credentials: "include" }).then(r => r.json()),
  });

  const acceptMutation = useMutation({
    mutationFn: (giftId: string) => apiRequest("POST", `/api/gifts/${giftId}/accept`, {}),
    onSuccess: (_, giftId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gifts/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet-house/decor/inventory"] });
      toast({ title: "Gift accepted!", description: "It's been added to your account." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to accept gift", description: err?.message ?? "Please try again", variant: "destructive" });
    },
  });

  return (
    <>
      <div className="fixed inset-0 z-[99997]" style={{ background: "rgba(0,0,0,0.65)" }} onClick={onClose} />
      <div
        data-testid="gift-claim-modal"
        className="fixed z-[99998] flex flex-col"
        style={{
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 300, maxHeight: "80vh",
          background: "linear-gradient(160deg, rgba(4,14,8,0.99) 0%, rgba(3,10,6,0.99) 100%)",
          border: "1.5px solid rgba(127,255,212,0.22)",
          borderRadius: 18,
          boxShadow: "0 12px 60px rgba(0,0,0,0.9)",
          padding: "18px 16px 20px",
        }}
      >
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", cursor: "pointer", color: "rgba(127,255,212,0.4)", fontSize: 20 }}
        >×</button>

        <p className="font-fantasy font-semibold mb-1" style={{ color: "#f0e8c8", fontSize: 13, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
          <img src={giftIconImg} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />
          Incoming Gifts
        </p>
        <p className="font-fantasy mb-4" style={{ fontSize: 9, color: "rgba(127,255,212,0.5)", letterSpacing: "0.15em" }}>
          {gifts.length} PENDING
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="font-fantasy text-xs" style={{ color: "rgba(127,255,212,0.5)" }}>Loading…</span>
          </div>
        ) : gifts.length === 0 ? (
          <p className="font-fantasy text-center py-8" style={{ fontSize: 11, color: "rgba(127,255,212,0.4)" }}>No pending gifts</p>
        ) : (
          <div className="flex flex-col gap-3" style={{ overflowY: "auto", maxHeight: "60vh" }}>
            {gifts.map((gift) => (
              <div
                key={gift.id}
                data-testid={`gift-card-${gift.id}`}
                style={{
                  padding: "12px 12px",
                  borderRadius: 12,
                  background: "rgba(127,255,212,0.04)",
                  border: "1px solid rgba(127,255,212,0.15)",
                }}
              >
                {/* Sender row */}
                <div className="flex items-center gap-2 mb-2">
                  {gift.senderProfileImageUrl ? (
                    <img src={gift.senderProfileImageUrl} alt={gift.senderName} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(127,255,212,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 13, color: "#7fffd4", fontWeight: "bold" }}>{gift.senderName.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <p className="font-fantasy" style={{ fontSize: 11, color: "#d4e8da" }}>From <span style={{ color: "#7fffd4" }}>{gift.senderName}</span></p>
                </div>

                {/* Gift contents */}
                <div className="flex items-center gap-2 mb-2">
                  {gift.itemType && gift.itemImageUrl ? (
                    <img src={gift.itemImageUrl} alt={gift.itemName ?? ""} style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 7, background: "rgba(0,0,0,0.3)", flexShrink: 0 }} />
                  ) : gift.itemType && !gift.itemImageUrl ? (
                    <div style={{ width: 36, height: 36, borderRadius: 7, background: "rgba(127,255,212,0.08)", flexShrink: 0 }} />
                  ) : null}
                  <div>
                    {gift.coinAmount > 0 && (
                      <p className="font-fantasy" style={{ fontSize: 12, color: "#ffd700", display: "flex", alignItems: "center", gap: 4 }}>
                        <img src={coinIconImg} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
                        {gift.coinAmount.toLocaleString()} coins
                      </p>
                    )}
                    {gift.itemType && gift.itemName && (
                      <p className="font-fantasy" style={{ fontSize: 11, color: "#d4e8da" }}>{gift.itemName}{gift.itemQuantity > 1 ? ` ×${gift.itemQuantity}` : ""}</p>
                    )}
                  </div>
                </div>

                {/* Message */}
                {gift.message && (
                  <p className="font-fantasy mb-2" style={{ fontSize: 10, color: "rgba(127,255,212,0.7)", fontStyle: "italic", lineHeight: 1.4, wordBreak: "break-word" }}>
                    "{gift.message}"
                  </p>
                )}

                <button
                  data-testid={`button-accept-gift-${gift.id}`}
                  onClick={() => acceptMutation.mutate(gift.id)}
                  disabled={acceptMutation.isPending}
                  className="font-fantasy tracking-wider w-full"
                  style={{
                    padding: "7px 0",
                    borderRadius: 9,
                    background: "linear-gradient(135deg, rgba(74,222,128,0.22) 0%, rgba(22,163,74,0.18) 100%)",
                    border: "1.5px solid rgba(74,222,128,0.5)",
                    color: "#4ade80",
                    cursor: "pointer",
                    fontSize: 10,
                    letterSpacing: "0.1em",
                  }}
                >
                  {acceptMutation.isPending ? "Accepting…" : "Accept Gift"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
