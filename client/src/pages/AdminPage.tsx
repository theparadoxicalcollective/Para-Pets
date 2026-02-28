import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import bgImg from "@assets/bg_home.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import profileFrameImg from "@assets/frame_profile.png";
import coinIconImg from "@assets/icon_coin.png";

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

interface ShopItemFull {
  id: string;
  name: string;
  price: number;
  type: string;
  worldId: string;
  imageUrl: string | null;
  eggImageUrl: string | null;
  hatchedImageUrl: string | null;
  rarity: number | null;
  hatchTime: number | null;
  statBoostType: string | null;
  statBoostAmount: number | null;
  specialSkill: string | null;
  healthRestored: number | null;
  manaRestored: number | null;
  petsRevived: number | null;
  atkBoost: number | null;
  defBoost: number | null;
  createdAt: string;
}

const WORLD_OPTIONS = [
  { id: "enchanted_grove", name: "Enchanted Grove" },
  { id: "snowy_mountain", name: "Frostpeak" },
  { id: "sky_realm", name: "Sky Realm" },
  { id: "island", name: "The Lost Island" },
  { id: "volcanic", name: "Volcanic Isle" },
  { id: "desert", name: "Scorched Desert" },
  { id: "swamp", name: "The Swamp" },
  { id: "haunted_woods", name: "Haunted Woods" },
];

const ITEM_TYPES = ["pet", "item", "accessory", "potion"];

export default function AdminPage({ user }: AdminPageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [coinAmounts, setCoinAmounts] = useState<Record<string, string>>({});
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"members" | "rewards" | "items">("members");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery<MemberUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const sortedMembers = [...members].sort((a, b) => b.coins - a.coins);

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

  const tabs = [
    { key: "members" as const, label: `Members (${members.length})`, color: "#f0c040", activeBg: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", activeBorder: "rgba(212,160,23,0.6)" },
    { key: "rewards" as const, label: "Rewards", color: "#e0d0f0", activeBg: "linear-gradient(135deg, rgba(120,80,200,0.6) 0%, rgba(80,40,160,0.6) 100%)", activeBorder: "rgba(192,132,252,0.5)" },
    { key: "items" as const, label: "Item DB", color: "#7fffd4", activeBg: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)", activeBorder: "rgba(127,255,212,0.5)" },
  ];

  return (
    <div
      className="relative w-full h-[100dvh] overflow-hidden flex flex-col"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black/80 z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <h2
            className="font-fantasy text-[#f0c040] text-center text-lg tracking-widest font-semibold mb-1"
            style={{ textShadow: "0 0 20px rgba(240,192,64,0.4)" }}
          >
            Realm Administration
          </h2>

          <div className="flex justify-center gap-1.5 mb-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                data-testid={`tab-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className="px-3 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-all"
                style={{
                  background: activeTab === tab.key ? tab.activeBg : "rgba(0,0,0,0.3)",
                  border: activeTab === tab.key ? `1px solid ${tab.activeBorder}` : "1px solid rgba(212,160,23,0.2)",
                  color: activeTab === tab.key ? tab.color : "#a89878",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "members" && (
            isLoading ? (
              <div className="text-center py-8">
                <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Summoning records...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedMembers.map((member, index) => {
                  const rank = index + 1;
                  const isExpanded = expandedUser === member.id;
                  const rankColor = rank === 1 ? "#ffd700" : rank === 2 ? "#c0c0c0" : rank === 3 ? "#cd7f32" : "#a89878";

                  return (
                    <div
                      key={member.id}
                      data-testid={`card-member-${member.id}`}
                      className="rounded-lg overflow-hidden"
                      style={{
                        background: member.isBanned
                          ? "linear-gradient(135deg, rgba(80,10,10,0.7) 0%, rgba(40,5,5,0.7) 100%)"
                          : "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(50,30,10,0.85) 100%)",
                        border: member.isBanned
                          ? "1px solid rgba(200,50,50,0.4)"
                          : "1px solid rgba(212,160,23,0.3)",
                      }}
                    >
                      <button
                        data-testid={`button-expand-${member.id}`}
                        onClick={() => setExpandedUser(isExpanded ? null : member.id)}
                        className="w-full flex items-center gap-3 p-3"
                        style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      >
                        <div
                          className="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center font-fantasy font-bold text-xs"
                          style={{
                            background: rank <= 3
                              ? `radial-gradient(ellipse at center, ${rankColor}33 0%, transparent 70%)`
                              : "rgba(0,0,0,0.3)",
                            border: `1px solid ${rankColor}66`,
                            color: rankColor,
                          }}
                        >
                          {rank}
                        </div>

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
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-yellow-400 text-xs">&#9733;</span>
                          <span className="font-fantasy text-[#f0c040] text-xs">{member.coins}</span>
                        </div>
                      </button>

                      {isExpanded && !member.isAdmin && (
                        <div
                          className="px-3 pb-3 pt-1 flex items-center gap-2 flex-wrap"
                          style={{ borderTop: "1px solid rgba(212,160,23,0.15)" }}
                        >
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

                      {isExpanded && member.isAdmin && (
                        <div
                          className="px-3 pb-3 pt-1"
                          style={{ borderTop: "1px solid rgba(212,160,23,0.15)" }}
                        >
                          <p className="font-fantasy text-[#7fbfb0] text-[10px] tracking-wider">Realm Administrator</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === "rewards" && (
            <RewardBundleSection members={members.filter(m => !m.isAdmin)} />
          )}

          {activeTab === "items" && (
            <ItemDatabaseSection />
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

function ItemDatabaseSection() {
  const [editingItem, setEditingItem] = useState<ShopItemFull | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterWorld, setFilterWorld] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allItems = [], isLoading } = useQuery<ShopItemFull[]>({
    queryKey: ["/api/admin/shop-items-all"],
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/admin/shop/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      toast({ title: "Deleted", description: "Item removed from game" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not delete item", variant: "destructive" });
    },
  });

  const filtered = allItems.filter(item => {
    if (filterWorld !== "all" && item.worldId !== filterWorld) return false;
    if (filterType !== "all" && item.type !== filterType) return false;
    return true;
  });

  const worldName = (id: string) => WORLD_OPTIONS.find(w => w.id === id)?.name || id;

  return (
    <div className="space-y-3">
      <button
        data-testid="button-add-new-item"
        onClick={() => { setEditingItem(null); setShowForm(true); }}
        className="w-full py-2.5 rounded-lg font-fantasy text-sm tracking-wider flex items-center justify-center gap-2 transition-transform active:scale-98"
        style={{
          background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
          border: "1px solid rgba(127,255,212,0.4)",
          color: "#7fffd4",
          cursor: "pointer",
        }}
      >
        <span className="text-xl leading-none">+</span> Add New Item
      </button>

      <div className="flex gap-2">
        <select
          data-testid="select-filter-world"
          value={filterWorld}
          onChange={(e) => setFilterWorld(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-md font-fantasy text-[10px] outline-none"
          style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
        >
          <option value="all">All Worlds</option>
          {WORLD_OPTIONS.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <select
          data-testid="select-filter-type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-md font-fantasy text-[10px] outline-none"
          style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
        >
          <option value="all">All Types</option>
          {ITEM_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>

      <p className="font-fantasy text-[#6a5840] text-[10px] tracking-wider text-center">
        {filtered.length} item{filtered.length !== 1 ? "s" : ""} in database
      </p>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Loading items...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="font-fantasy text-[#a89878] text-sm tracking-wider">No items found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
            return (
              <div
                key={item.id}
                data-testid={`card-db-item-${item.id}`}
                className="rounded-lg overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(50,30,10,0.85) 100%)",
                  border: "1px solid rgba(212,160,23,0.3)",
                }}
              >
                <div className="flex items-center gap-3 p-3">
                  <div
                    className="w-12 h-12 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.15)" }}
                  >
                    {displayImg ? (
                      <img src={displayImg} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="font-fantasy text-[#5a4a3a] text-lg">?</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-fantasy text-[#f0c040] text-xs font-semibold truncate">{item.name}</p>
                      {item.type === "pet" && item.rarity && (
                        <span className="text-[8px]" style={{ color: "#f0c040" }}>{"★".repeat(item.rarity)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="font-fantasy text-[8px] tracking-wider px-1.5 py-0.5 rounded-full capitalize"
                        style={{ background: "rgba(127,255,212,0.1)", color: "#7fbfb0", border: "1px solid rgba(127,255,212,0.2)" }}
                      >
                        {item.type}
                      </span>
                      <span className="font-fantasy text-[#6a5840] text-[8px]">{worldName(item.worldId)}</span>
                      <span className="font-fantasy text-[#f0c040] text-[8px]">{item.price} coins</span>
                    </div>
                    {item.type === "item" && item.statBoostType && (
                      <span className="font-fantasy text-[#a89878] text-[7px]">
                        +{item.statBoostAmount} {item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : "LVL"}
                      </span>
                    )}
                    {item.type === "potion" && (
                      <span className="font-fantasy text-[#a89878] text-[7px]">
                        {item.healthRestored ? `+${item.healthRestored} HP` : ""}{item.manaRestored ? ` +${item.manaRestored} MP` : ""}{item.petsRevived ? ` Revive ${item.petsRevived}` : ""}
                      </span>
                    )}
                    {item.type === "accessory" && (
                      <span className="font-fantasy text-[#a89878] text-[7px]">
                        {item.atkBoost ? `+${item.atkBoost} ATK` : ""}{item.defBoost ? ` +${item.defBoost} DEF` : ""}
                      </span>
                    )}
                    {item.type === "pet" && item.specialSkill && (
                      <span className="font-fantasy text-[#c084fc] text-[7px]">Skill: {item.specialSkill}</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      data-testid={`button-edit-db-item-${item.id}`}
                      onClick={() => { setEditingItem(item); setShowForm(true); }}
                      className="px-2 py-1 rounded font-fantasy text-[8px] tracking-wider"
                      style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", border: "1px solid rgba(212,160,23,0.4)", color: "#f0c040", cursor: "pointer" }}
                    >
                      Edit
                    </button>
                    <button
                      data-testid={`button-delete-db-item-${item.id}`}
                      onClick={() => deleteMutation.mutate(item.id)}
                      disabled={deleteMutation.isPending}
                      className="px-2 py-1 rounded font-fantasy text-[8px] tracking-wider disabled:opacity-50"
                      style={{ background: "rgba(139,0,0,0.4)", border: "1px solid rgba(200,50,50,0.3)", color: "#ff9999", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <AdminItemForm
          item={editingItem}
          onClose={() => { setShowForm(false); setEditingItem(null); }}
          onSuccess={() => {
            setShowForm(false);
            setEditingItem(null);
            queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
            WORLD_OPTIONS.forEach(w => {
              queryClient.invalidateQueries({ queryKey: ["/api/shop", w.id] });
            });
          }}
        />
      )}
    </div>
  );
}

function AdminItemForm({ item, onClose, onSuccess }: { item: ShopItemFull | null; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price?.toString() || "");
  const [type, setType] = useState(item?.type || "item");
  const [worldId, setWorldId] = useState(item?.worldId || WORLD_OPTIONS[0].id);
  const [rarity, setRarity] = useState(item?.rarity?.toString() || "1");
  const [hatchTime, setHatchTime] = useState(item?.hatchTime?.toString() || "1");
  const [specialSkill, setSpecialSkill] = useState(item?.specialSkill || "");
  const [statBoostType, setStatBoostType] = useState(item?.statBoostType || "health");
  const [statBoostAmount, setStatBoostAmount] = useState(item?.statBoostAmount?.toString() || "10");
  const [healthRestored, setHealthRestored] = useState(item?.healthRestored?.toString() || "");
  const [manaRestored, setManaRestored] = useState(item?.manaRestored?.toString() || "");
  const [petsRevived, setPetsRevived] = useState(item?.petsRevived?.toString() || "");
  const [atkBoost, setAtkBoost] = useState(item?.atkBoost?.toString() || "");
  const [defBoost, setDefBoost] = useState(item?.defBoost?.toString() || "");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(item?.imageUrl || null);
  const [eggImageData, setEggImageData] = useState<string | null>(null);
  const [eggImagePreview, setEggImagePreview] = useState<string | null>(item?.eggImageUrl || null);
  const [hatchedImageData, setHatchedImageData] = useState<string | null>(null);
  const [hatchedImagePreview, setHatchedImagePreview] = useState<string | null>(item?.hatchedImageUrl || null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!name.trim() || !price.trim()) {
      toast({ title: "Missing fields", description: "Name and price are required", variant: "destructive" });
      return;
    }
    const priceNum = parseInt(price);
    if (isNaN(priceNum) || priceNum < 0) {
      toast({ title: "Invalid price", description: "Price must be a positive number", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = { name: name.trim(), price: priceNum, type, worldId };
      if (imageData) payload.imageData = imageData;

      if (type === "pet") {
        payload.rarity = parseInt(rarity);
        payload.hatchTime = parseInt(hatchTime);
        payload.specialSkill = specialSkill.trim() || null;
        if (eggImageData) payload.eggImageData = eggImageData;
        if (hatchedImageData) payload.hatchedImageData = hatchedImageData;
      } else {
        payload.rarity = null;
        payload.hatchTime = null;
        payload.eggImageUrl = null;
        payload.hatchedImageUrl = null;
        payload.specialSkill = null;
      }

      if (type === "item") {
        payload.statBoostType = statBoostType;
        payload.statBoostAmount = parseInt(statBoostAmount) || 10;
      } else {
        payload.statBoostType = null;
        payload.statBoostAmount = null;
      }

      if (type === "potion") {
        payload.healthRestored = parseInt(healthRestored) || null;
        payload.manaRestored = parseInt(manaRestored) || null;
        payload.petsRevived = parseInt(petsRevived) || null;
      } else {
        payload.healthRestored = null;
        payload.manaRestored = null;
        payload.petsRevived = null;
      }

      if (type === "accessory") {
        payload.atkBoost = parseInt(atkBoost) || null;
        payload.defBoost = parseInt(defBoost) || null;
      } else {
        payload.atkBoost = null;
        payload.defBoost = null;
      }

      if (item) {
        await apiRequest("PATCH", `/api/admin/shop/${item.id}`, payload);
        toast({ title: "Updated", description: "Item updated successfully" });
      } else {
        await apiRequest("POST", "/api/admin/shop", payload);
        toast({ title: "Created", description: "Item added to game" });
      }
      onSuccess();
    } catch {
      toast({ title: "Failed", description: "Could not save item", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[90%] max-w-sm rounded-lg p-5 animate-slide-up overflow-y-auto"
        style={{
          background: "linear-gradient(135deg, rgba(30,15,5,0.97) 0%, rgba(60,35,10,0.97) 100%)",
          border: "1px solid rgba(212,160,23,0.5)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          maxHeight: "85vh",
        }}
      >
        <button
          data-testid="button-close-item-form"
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
        >
          X
        </button>

        <h3 className="font-fantasy text-[#f0c040] text-center text-base tracking-widest mb-4">
          {item ? "Edit Item" : "Add Item"}
        </h3>

        <div className="space-y-3">
          <ImageUpload
            label="Shop Image (PNG)"
            preview={imagePreview}
            onSelect={(d) => { setImageData(d); setImagePreview(d); }}
            onRemove={() => { setImageData(null); setImagePreview(null); }}
            inputId="admin-shop-item-img"
          />

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Name</label>
            <input data-testid="input-item-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Price</label>
            <input data-testid="input-item-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Type</label>
            <select data-testid="select-item-type" value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle}>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">World</label>
            <select data-testid="select-item-world" value={worldId} onChange={(e) => setWorldId(e.target.value)} className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle}>
              {WORLD_OPTIONS.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {type === "pet" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Rarity</label>
                <select data-testid="select-rarity" value={rarity} onChange={(e) => setRarity(e.target.value)} className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle}>
                  {[1,2,3,4,5].map((r) => (
                    <option key={r} value={r}>{"★".repeat(r)} ({r} Star{r > 1 ? "s" : ""})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Hatch Time (hours)</label>
                <input data-testid="input-hatch-time" type="number" value={hatchTime} onChange={(e) => setHatchTime(e.target.value)} placeholder="1" min="1" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Special Skill</label>
                <input data-testid="input-special-skill" type="text" value={specialSkill} onChange={(e) => setSpecialSkill(e.target.value)} placeholder="e.g. Fire Breath, Heal Aura..." className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Unique ability for this pet</p>
              </div>
              <ImageUpload
                label="Egg Image (PNG or GIF)"
                preview={eggImagePreview}
                onSelect={(d) => { setEggImageData(d); setEggImagePreview(d); }}
                onRemove={() => { setEggImageData(null); setEggImagePreview(null); }}
                inputId="admin-egg-img"
                allowGif
              />
              <ImageUpload
                label="Hatched Pet Image (PNG or GIF)"
                preview={hatchedImagePreview}
                onSelect={(d) => { setHatchedImageData(d); setHatchedImagePreview(d); }}
                onRemove={() => { setHatchedImageData(null); setHatchedImagePreview(null); }}
                inputId="admin-hatched-img"
                allowGif
              />
            </>
          )}

          {type === "item" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Stat Boost Type</label>
                <select data-testid="select-stat-boost" value={statBoostType} onChange={(e) => setStatBoostType(e.target.value)} className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle}>
                  <option value="health">Health (+HP)</option>
                  <option value="atk">Attack (+ATK)</option>
                  <option value="def">Defense (+DEF)</option>
                  <option value="lvl">Level (+LVL)</option>
                </select>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">
                  {statBoostType === "health" ? "HP Added" : statBoostType === "atk" ? "ATK Added" : statBoostType === "def" ? "DEF Added" : "Levels Added"}
                </label>
                <input data-testid="input-stat-boost-amount" type="number" value={statBoostAmount} onChange={(e) => setStatBoostAmount(e.target.value)} placeholder="10" min="1" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Consumable - disappears after use on a pet</p>
              </div>
            </>
          )}

          {type === "potion" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Health Restored</label>
                <input data-testid="input-health-restored" type="number" value={healthRestored} onChange={(e) => setHealthRestored(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">HP healed in battle</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Mana Restored</label>
                <input data-testid="input-mana-restored" type="number" value={manaRestored} onChange={(e) => setManaRestored(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">MP recovered in battle</p>
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Pets Revived</label>
                <input data-testid="input-pets-revived" type="number" value={petsRevived} onChange={(e) => setPetsRevived(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
                <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider mt-0.5">Number of knocked pets revived (highest stats first)</p>
              </div>
              <p className="font-fantasy text-[#ff9999] text-[8px] tracking-wider text-center">Potions are consumables - battle use only, not for power-ups</p>
            </>
          )}

          {type === "accessory" && (
            <>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">ATK Boost (when equipped)</label>
                <input data-testid="input-atk-boost" type="number" value={atkBoost} onChange={(e) => setAtkBoost(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">DEF Boost (when equipped)</label>
                <input data-testid="input-def-boost" type="number" value={defBoost} onChange={(e) => setDefBoost(e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none" style={inputStyle} />
              </div>
              <p className="font-fantasy text-[#7fbfb0] text-[8px] tracking-wider text-center">Accessories are equippable - stats added when worn, removed when unequipped. Not consumed.</p>
            </>
          )}

          <button
            data-testid="button-submit-item"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-98 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)", border: "1px solid rgba(127,255,212,0.4)", color: "#7fffd4", cursor: "pointer" }}
          >
            {submitting ? "Saving..." : item ? "Update Item" : "Add to Game"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageUpload({ label, preview, onSelect, onRemove, inputId, allowGif = false }: { label: string; preview: string | null; onSelect: (data: string) => void; onRemove: () => void; inputId: string; allowGif?: boolean }) {
  const { toast } = useToast();
  const allowedTypes = allowGif ? ["image/png", "image/gif"] : ["image/png"];
  const acceptStr = allowGif ? "image/png,image/gif" : "image/png";
  const formatLabel = allowGif ? "PNG or GIF" : "PNG only";

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid format", description: formatLabel, variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 20MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => onSelect(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <div
          className="w-16 h-16 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer"
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.3)" }}
          onClick={() => (document.getElementById(inputId) as HTMLInputElement)?.click()}
        >
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[#d4a017] text-lg">+</span>
          )}
        </div>
        <input id={inputId} type="file" accept={acceptStr} onChange={handleFile} className="hidden" />
        <div className="flex-1 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => (document.getElementById(inputId) as HTMLInputElement)?.click()}
            className="w-full py-1.5 rounded-md font-fantasy text-[9px] tracking-wider"
            style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", border: "1px solid rgba(212,160,23,0.4)", color: "#f0c040", cursor: "pointer" }}
          >
            {preview ? "Change" : "Upload"}
          </button>
          {preview && (
            <button
              type="button"
              onClick={onRemove}
              className="w-full py-1 rounded-md font-fantasy text-[8px] tracking-wider"
              style={{ background: "rgba(139,0,0,0.3)", border: "1px solid rgba(200,50,50,0.3)", color: "#ff9999", cursor: "pointer" }}
            >
              Remove
            </button>
          )}
          <span className="font-fantasy text-[#6a5840] text-[7px] tracking-wider">{formatLabel} - max 20MB</span>
        </div>
      </div>
    </div>
  );
}

function RewardBundleSection({ members }: { members: MemberUser[] }) {
  const [bundleName, setBundleName] = useState("");
  const [coinAmount, setCoinAmount] = useState("");
  const [selectedItems, setSelectedItems] = useState<ShopItemFull[]>([]);
  const [targetMode, setTargetMode] = useState<"all" | "select">("all");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [showItemPicker, setShowItemPicker] = useState(false);
  const { toast } = useToast();

  const { data: allShopItems = [] } = useQuery<ShopItemFull[]>({
    queryKey: ["/api/admin/shop-items-all"],
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: bundleName.trim(),
        coinAmount: parseInt(coinAmount) || 0,
        shopItemIds: selectedItems.map(i => i.id),
      };
      if (targetMode === "select") {
        payload.targetUserIds = selectedUserIds;
      }
      const res = await apiRequest("POST", "/api/admin/reward-bundle", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Reward Sent!", description: `Bundle sent to ${data.recipientCount} user${data.recipientCount !== 1 ? "s" : ""}` });
      setBundleName("");
      setCoinAmount("");
      setSelectedItems([]);
      setSelectedUserIds([]);
      setTargetMode("all");
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not send bundle", variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!bundleName.trim()) {
      toast({ title: "Missing name", description: "Give the bundle a name", variant: "destructive" });
      return;
    }
    const coins = parseInt(coinAmount) || 0;
    if (coins === 0 && selectedItems.length === 0) {
      toast({ title: "Empty bundle", description: "Add coins or items to the bundle", variant: "destructive" });
      return;
    }
    if (targetMode === "select" && selectedUserIds.length === 0) {
      toast({ title: "No recipients", description: "Select at least one user", variant: "destructive" });
      return;
    }
    sendMutation.mutate();
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const removeItem = (index: number) => {
    setSelectedItems(prev => prev.filter((_, i) => i !== index));
  };

  const filteredMembers = userSearch
    ? members.filter(m => m.username.toLowerCase().includes(userSearch.toLowerCase()) || m.email.toLowerCase().includes(userSearch.toLowerCase()))
    : members;

  const inputStyle = { background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" };

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg p-4"
        style={{ background: "linear-gradient(135deg, rgba(40,20,60,0.4) 0%, rgba(25,10,40,0.4) 100%)", border: "1px solid rgba(192,132,252,0.3)" }}
      >
        <h3 className="font-fantasy text-[#c084fc] text-sm tracking-wider text-center mb-3" style={{ textShadow: "0 0 8px rgba(192,132,252,0.3)" }}>
          Create Reward Bundle
        </h3>

        <div className="space-y-3">
          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Bundle Name</label>
            <input
              data-testid="input-bundle-name"
              type="text"
              value={bundleName}
              onChange={(e) => setBundleName(e.target.value)}
              placeholder="e.g. Welcome Gift, Weekly Reward..."
              className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Coin Amount</label>
            <div className="flex items-center gap-2">
              <img src={coinIconImg} alt="" className="w-5 h-5" />
              <input
                data-testid="input-bundle-coins"
                type="number"
                value={coinAmount}
                onChange={(e) => setCoinAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="flex-1 px-3 py-2 rounded-md font-sans text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider">Items ({selectedItems.length})</label>
              <button
                data-testid="button-add-bundle-item"
                onClick={() => setShowItemPicker(true)}
                className="px-2 py-1 rounded-md font-fantasy text-[9px] tracking-wider"
                style={{ background: "rgba(192,132,252,0.2)", border: "1px solid rgba(192,132,252,0.4)", color: "#c084fc", cursor: "pointer" }}
              >
                + Add Item
              </button>
            </div>
            {selectedItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedItems.map((item, idx) => {
                  const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-1 px-2 py-1 rounded-md"
                      style={{ background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.3)" }}
                    >
                      {displayImg ? (
                        <img src={displayImg} alt="" className="w-5 h-5 object-contain rounded-sm" />
                      ) : (
                        <span className="text-xs">{item.type === "pet" ? "🥚" : "📦"}</span>
                      )}
                      <span className="font-fantasy text-[#e0d0f0] text-[8px] max-w-[60px] truncate">{item.name}</span>
                      <button
                        onClick={() => removeItem(idx)}
                        className="text-[#ff9999] text-[10px] ml-0.5"
                        style={{ background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}
                      >
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Recipients</label>
            <div className="flex gap-2 mb-2">
              <button
                data-testid="button-target-all"
                onClick={() => setTargetMode("all")}
                className="flex-1 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider"
                style={{
                  background: targetMode === "all" ? "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)" : "rgba(0,0,0,0.3)",
                  border: targetMode === "all" ? "1px solid rgba(127,255,212,0.4)" : "1px solid rgba(212,160,23,0.2)",
                  color: targetMode === "all" ? "#7fffd4" : "#a89878",
                  cursor: "pointer",
                }}
              >
                All Users
              </button>
              <button
                data-testid="button-target-select"
                onClick={() => setTargetMode("select")}
                className="flex-1 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider"
                style={{
                  background: targetMode === "select" ? "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)" : "rgba(0,0,0,0.3)",
                  border: targetMode === "select" ? "1px solid rgba(212,160,23,0.5)" : "1px solid rgba(212,160,23,0.2)",
                  color: targetMode === "select" ? "#f0c040" : "#a89878",
                  cursor: "pointer",
                }}
              >
                Select Users
              </button>
            </div>

            {targetMode === "select" && (
              <div>
                <input
                  data-testid="input-user-search"
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full px-3 py-2 rounded-md font-sans text-xs outline-none mb-2"
                  style={inputStyle}
                />
                {selectedUserIds.length > 0 && (
                  <p className="font-fantasy text-[#7fffd4] text-[9px] tracking-wider mb-2">
                    {selectedUserIds.length} user{selectedUserIds.length !== 1 ? "s" : ""} selected
                  </p>
                )}
                <div className="max-h-32 overflow-y-auto space-y-1 rounded-md p-1" style={{ background: "rgba(0,0,0,0.2)" }}>
                  {filteredMembers.map(m => {
                    const isSelected = selectedUserIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        data-testid={`button-select-user-${m.id}`}
                        onClick={() => toggleUser(m.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left"
                        style={{
                          background: isSelected ? "rgba(127,255,212,0.1)" : "transparent",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0"
                          style={{
                            background: isSelected ? "rgba(127,255,212,0.3)" : "rgba(0,0,0,0.3)",
                            border: isSelected ? "1px solid rgba(127,255,212,0.5)" : "1px solid rgba(212,160,23,0.3)",
                          }}
                        >
                          {isSelected && <span className="text-[#7fffd4] text-[8px]">✓</span>}
                        </div>
                        <span className="font-fantasy text-[#f0c040] text-[10px] truncate">{m.username}</span>
                        <span className="font-fantasy text-[#6a5840] text-[8px] truncate">{m.email}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            data-testid="button-send-bundle"
            onClick={handleSend}
            disabled={sendMutation.isPending}
            className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, rgba(120,80,200,0.7) 0%, rgba(80,40,160,0.7) 100%)",
              border: "1px solid rgba(192,132,252,0.5)",
              color: "#e0d0f0",
              cursor: "pointer",
              boxShadow: "0 0 20px rgba(192,132,252,0.2)",
            }}
          >
            {sendMutation.isPending ? "Sending..." : "Send Reward Bundle"}
          </button>
        </div>
      </div>

      {showItemPicker && (
        <ItemPickerModal
          items={allShopItems}
          onSelect={(item) => {
            setSelectedItems(prev => [...prev, item]);
            setShowItemPicker(false);
          }}
          onClose={() => setShowItemPicker(false)}
        />
      )}
    </div>
  );
}

function ItemPickerModal({ items, onSelect, onClose }: { items: ShopItemFull[]; onSelect: (item: ShopItemFull) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[85%] max-w-sm rounded-lg p-4 animate-slide-up"
        style={{
          background: "linear-gradient(135deg, rgba(20,10,3,0.98) 0%, rgba(45,25,8,0.98) 100%)",
          border: "1px solid rgba(192,132,252,0.5)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
          maxHeight: "70vh",
        }}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
        >
          X
        </button>

        <h4 className="font-fantasy text-[#c084fc] text-xs tracking-wider text-center mb-3">Select Item</h4>
        <input
          data-testid="input-item-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full px-3 py-2 rounded-md font-sans text-xs outline-none mb-3"
          style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
        />
        <div className="overflow-y-auto space-y-1.5" style={{ maxHeight: "45vh" }}>
          {filtered.length === 0 ? (
            <p className="font-fantasy text-[#a89878] text-xs text-center py-4">No items found</p>
          ) : (
            filtered.map(item => {
              const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
              return (
                <button
                  key={item.id}
                  data-testid={`button-pick-item-${item.id}`}
                  onClick={() => onSelect(item)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-all"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.2)", cursor: "pointer" }}
                >
                  <div className="w-8 h-8 rounded flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: "rgba(0,0,0,0.3)" }}>
                    {displayImg ? (
                      <img src={displayImg} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-lg">{item.type === "pet" ? "🥚" : "📦"}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-fantasy text-[#f0c040] text-[10px] truncate">{item.name}</p>
                    <p className="font-fantasy text-[#6a5840] text-[8px] capitalize">{item.type}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
