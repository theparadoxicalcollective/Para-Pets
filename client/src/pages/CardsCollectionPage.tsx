import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CardPreview from "@/components/CardPreview";
import CardDetailDialog from "@/components/CardDetailDialog";
import CardRewardCoin from "@/components/CardRewardCoin";
import { getCardBorderLayout, type CardCollection } from "@/lib/cardCatalog";
import { setNavHidden } from "@/lib/navVisibility";

import decorDivider from "@assets/uploads/DecorDivider.png";
import closeButton from "@assets/uploads/ClosetCloseButton.png";

const RARITY_FILTERS = [
  { rarity: 1, label: "1 star" },
  { rarity: 2, label: "2 stars" },
  { rarity: 3, label: "3 stars" },
  { rarity: 4, label: "4 stars" },
  { rarity: 5, label: "5 stars" },
] as const;

const mutedGold = "rgba(216,176,74,.34)";

export default function CardsCollectionPage() {
  const [, navigate] = useLocation();
  const [rarityFilter, setRarityFilter] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState("rarity");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [rewardPopup, setRewardPopup] = useState<{ cardId: string; amount: number } | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<CardCollection>({ queryKey: ["/api/cards"] });
  const cards = data?.cards ?? [];
  const layouts = data?.layouts ?? [];
  const selectedCard = cards.find(card => card.id === selectedCardId);
  const visibleCards = cards.filter(card => rarityFilter === null || card.rarity === rarityFilter)
    .sort((a, b) => sortMode === "name" ? a.name.localeCompare(b.name) : b.rarity - a.rarity || a.name.localeCompare(b.name));
  const claimReward = useMutation({
    mutationFn: async (cardId: string): Promise<{ claimed: boolean; coinsAwarded: number }> =>
      (await apiRequest("POST", `/api/cards/${cardId}/claim`)).json(),
    onSuccess: (result, cardId) => {
      if (!result.claimed) return;
      queryClient.setQueryData<CardCollection>(["/api/cards"], current => current ? {
        ...current, cards: current.cards.map(card => card.id === cardId ? { ...card, firstRewardClaimed: true } : card),
      } : current);
      if (result.coinsAwarded > 0) setRewardPopup({ cardId, amount: result.coinsAwarded });
    },
    onError: (error: Error) => toast({ title: "Could not claim reward", description: error.message, variant: "destructive" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/cards"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  useEffect(() => {
    if (!rewardPopup) return;
    const timeout = window.setTimeout(() => setRewardPopup(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [rewardPopup]);

  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, []);

  return (
    <main
      data-testid="page-cards-collection"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          "radial-gradient(circle at 50% 11%, rgba(67,139,80,.25), transparent 31%), radial-gradient(circle at 18% 30%, rgba(58,115,73,.12), transparent 24%), radial-gradient(circle at 82% 66%, rgba(58,115,73,.1), transparent 24%), linear-gradient(180deg, #06150d 0%, #0a2117 48%, #06120d 100%)",
        color: "#f6df9e",
        fontFamily: "'Cinzel', 'Palatino Linotype', serif",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.6,
          backgroundImage:
            "radial-gradient(circle at 18% 16%, rgba(255,225,128,.45) 0 1px, transparent 1.7px), radial-gradient(circle at 78% 22%, rgba(255,225,128,.28) 0 1px, transparent 1.6px), radial-gradient(circle at 31% 68%, rgba(255,225,128,.22) 0 1px, transparent 1.5px), radial-gradient(circle at 86% 76%, rgba(255,225,128,.35) 0 1px, transparent 1.5px)",
          backgroundSize: "150px 170px, 190px 210px, 220px 240px, 175px 195px",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "min(100%, 430px)",
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          margin: "0 auto",
          padding: "max(14px, env(safe-area-inset-top)) 12px calc(18px + env(safe-area-inset-bottom))",
          boxSizing: "border-box",
        }}
      >
        <button
          type="button"
          data-testid="button-close-cards"
          aria-label="Close cards collection"
          onClick={() => navigate("/")}
          style={{
            position: "absolute",
            zIndex: 8,
            top: "max(20px, calc(env(safe-area-inset-top) + 6px))",
            right: 18,
            width: 40,
            height: 40,
            appearance: "none",
            border: 0,
            padding: 0,
            background: "transparent",
            cursor: "pointer",
            filter: "drop-shadow(0 5px 9px rgba(0,0,0,.52))",
          }}
        >
          <img src={closeButton} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />
        </button>

        <header
          style={{
            position: "relative",
            zIndex: 3,
            width: "min(94%, 402px)",
            margin: "0 auto",
            flexShrink: 0,
            padding: "12px 8px 0",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          <h1
            style={{
              margin: "2px auto 9px",
              fontFamily: "'Cinzel', 'Palatino Linotype', Georgia, serif",
              fontSize: "clamp(39px, 10.5vw, 52px)",
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: ".09em",
              color: "#f5d990",
              textShadow: "0 2px 0 #60401a, 0 4px 9px rgba(0,0,0,.72), 0 0 16px rgba(239,192,99,.35)",
            }}
          >
            Cards
          </h1>

          <nav
            aria-label="Filter cards by rarity"
            style={{
              width: "100%",
              margin: "5px auto 0",
              padding: "9px 10px 10px",
              border: "1px solid rgba(207,166,80,.34)",
              borderRadius: 18,
              background: "linear-gradient(180deg, rgba(5,31,20,.88), rgba(3,20,14,.78))",
              boxShadow: "inset 0 1px 0 rgba(246,215,138,.08), 0 6px 15px rgba(0,0,0,.18)",
              boxSizing: "border-box",
            }}
          >
            <div style={{ marginBottom: 7, color: "rgba(230,205,146,.74)", fontSize: 9, letterSpacing: ".22em" }}>FILTER BY RARITY</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 5 }}>
            {[{ rarity: null, label: "All cards" }, ...RARITY_FILTERS].map(filter => {
              const selected = rarityFilter === filter.rarity;

              return (
                <button
                  key={filter.rarity ?? "all"}
                  type="button"
                  aria-label={filter.rarity === null ? "Show all cards" : `Filter ${filter.label} cards`}
                  aria-pressed={selected}
                  data-testid={`button-card-filter-${filter.rarity ?? "all"}`}
                  onClick={() => setRarityFilter(filter.rarity)}
                  style={{
                    appearance: "none",
                    border: selected ? "1px solid #e9c77c" : "1px solid rgba(202,170,102,.3)",
                    padding: "0 2px",
                    minHeight: 36,
                    background: selected ? "linear-gradient(180deg, #795927, #3b311d)" : "rgba(7,34,23,.9)",
                    borderRadius: 11,
                    cursor: "pointer",
                    color: selected ? "#fff1bb" : "#cfbf8e",
                    fontFamily: "inherit",
                    fontSize: "clamp(11px, 3vw, 13px)",
                    fontWeight: selected ? 700 : 500,
                    boxShadow: selected ? "0 0 12px rgba(232,189,89,.28), inset 0 1px 0 rgba(255,239,188,.23)" : "none",
                    transition: "background 150ms ease, box-shadow 150ms ease",
                  }}
                >
                  {filter.rarity === null ? "All" : `${filter.rarity}★`}
                </button>
              );
            })}
            </div>
          </nav>

          <img
            src={decorDivider}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              display: "block",
              width: "min(74%, 250px)",
              height: 22,
              margin: "5px auto 8px",
              objectFit: "contain",
              opacity: .82,
              filter: "drop-shadow(0 3px 6px rgba(0,0,0,.3))",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        </header>

        <section
          aria-label="Card collection tools"
          style={{
            position: "relative",
            zIndex: 3,
            width: "min(82%, 342px)",
            margin: "0 auto 8px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <label style={{ position: "relative", flex: "0 1 116px" }}>
            <span className="sr-only">Sort cards</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
              data-testid="select-card-sort"
              style={{
                width: "100%",
                appearance: "none",
                border: `1px solid ${mutedGold}`,
                borderRadius: 16,
                padding: "5px 25px 5px 11px",
                background: "rgba(5,25,16,.72)",
                color: "#ddcb96",
                fontFamily: "inherit",
                fontSize: "clamp(9px, 2.45vw, 11px)",
                minHeight: 32,
              }}
            >
              <option value="rarity">Sort: Rarity</option>
              <option value="name">Sort: Name</option>
            </select>
            <span aria-hidden="true" style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-53%)", color: "#c7aa56", fontSize: 12, pointerEvents: "none" }}>⌄</span>
          </label>

          <div
            data-testid="card-collection-count"
            style={{
              minWidth: 68,
              padding: "5px 10px",
              border: `1px solid ${mutedGold}`,
              borderRadius: 18,
              background: "rgba(5,25,16,.72)",
              color: "#e1cc8e",
              fontSize: "clamp(9px, 2.45vw, 11px)",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            {rarityFilter ? `${rarityFilter}★ (${visibleCards.length})` : `All (${cards.length})`}
          </div>
        </section>

        <section
          aria-label={rarityFilter ? `${rarityFilter} star card collection` : "Card collection"}
          data-testid="card-collection-scroll"
          tabIndex={0}
          data-rarity-filter={rarityFilter ?? "all"}
          style={{
            position: "relative",
            zIndex: 2,
            // The stage owns screen sizing; only this flex child may scroll.
            flex: "1 1 0",
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            overscrollBehaviorY: "contain",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
            scrollbarColor: "#997b3c #071b12",
            width: "min(92%, 382px)",
            margin: "0 auto",
            padding: "clamp(7px, 2vw, 10px) clamp(5px, 1.4vw, 7px) 58px",
            boxSizing: "border-box",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            alignContent: "start",
            columnGap: "clamp(8px, 2.4vw, 12px)",
            rowGap: "clamp(8px, 2.4vw, 12px)",
            borderRadius: 18,
            background: "radial-gradient(ellipse at 50% 4%, rgba(62,117,73,.12), transparent 48%)",
            border: "none",
            boxShadow: "none",
          }}
        >
          {isLoading && <p className="col-span-2 py-5 text-center text-sm" role="status">Loading cards…</p>}
          {isError && <div className="col-span-2 py-5 text-center" role="alert"><p>Could not load your cards.</p><button type="button" onClick={() => refetch()} className="mt-2 underline">Try again</button></div>}
          {!isLoading && !isError && visibleCards.length === 0 && (
            <div
              data-testid="card-collection-empty-state"
              style={{
                gridColumn: "1 / -1",
                minHeight: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: "12px 4px 36px",
                boxSizing: "border-box",
              }}
            >
              <div
                data-testid="card-collection-empty-panel"
                style={{
                  position: "relative",
                  width: "min(100%, 320px)",
                  padding: "24px 18px 22px",
                  border: "1px solid rgba(211,175,92,.43)",
                  borderRadius: "min(30vw, 112px) min(30vw, 112px) 22px 22px",
                  background: "radial-gradient(ellipse at 50% 22%, rgba(55,116,77,.32), transparent 62%), linear-gradient(165deg, rgba(10,44,30,.88), rgba(4,24,17,.94))",
                  boxShadow: "0 18px 38px rgba(0,0,0,.3), inset 0 0 0 5px rgba(5,21,15,.8), inset 0 0 0 6px rgba(207,167,78,.16)",
                  boxSizing: "border-box",
                }}
              >
                <div aria-hidden="true" style={{ color: "#dcba72", fontSize: 13, letterSpacing: ".5em", margin: "3px auto 16px", textShadow: "0 0 10px rgba(244,206,125,.65)" }}>✦ ✧ ✦</div>
                <div data-testid="card-collection-placeholder-1" aria-hidden="true" style={{ position: "relative", width: 172, height: 172, margin: "0 auto 24px", display: "grid", placeItems: "center" }}>
                  <div style={{ position: "absolute", inset: 3, border: "1px solid rgba(225,188,106,.42)", borderRadius: "50%", boxShadow: "0 0 28px rgba(219,182,100,.13), inset 0 0 18px rgba(31,102,65,.3)" }} />
                  <div style={{ position: "absolute", inset: 18, border: "1px dashed rgba(225,188,106,.48)", borderRadius: "50%", transform: "rotate(22deg)" }} />
                  <div style={{ position: "absolute", inset: 38, border: "1px solid rgba(225,188,106,.36)", borderRadius: "50%", background: "radial-gradient(circle, rgba(58,134,84,.52), rgba(7,35,23,.62) 68%)", boxShadow: "0 0 24px rgba(81,196,116,.18)" }} />
                  <span style={{ position: "relative", color: "#f2d996", fontSize: 57, lineHeight: 1, textShadow: "0 0 12px rgba(255,225,145,.8), 0 0 32px rgba(116,227,148,.55)" }}>✦</span>
                  <span style={{ position: "absolute", top: 3, color: "#ebd193", fontSize: 12 }}>✧</span>
                  <span style={{ position: "absolute", bottom: 3, color: "#ebd193", fontSize: 12 }}>✧</span>
                  <span style={{ position: "absolute", left: 2, color: "#ebd193", fontSize: 12 }}>✧</span>
                  <span style={{ position: "absolute", right: 2, color: "#ebd193", fontSize: 12 }}>✧</span>
                </div>
                <div aria-hidden="true" style={{ width: "72%", height: 1, margin: "0 auto 15px", background: "linear-gradient(90deg, transparent, #b99558, transparent)" }} />
                <h2 style={{ margin: "0 0 7px", color: "#f3d995", fontSize: "clamp(17px, 4.8vw, 21px)", lineHeight: 1.3, textShadow: "0 2px 8px rgba(0,0,0,.55)" }}>
                  {rarityFilter ? `No ${rarityFilter}-star cards yet` : "Your collection begins here"}
                </h2>
                <p style={{ margin: "0 auto", maxWidth: 235, color: "#c9c1a5", fontSize: "clamp(11px, 3vw, 13px)", lineHeight: 1.55 }}>
                  {rarityFilter ? "Cards you collect at this rarity will appear here." : "A little magic is waiting to be found. Your first card will appear here."}
                </p>
              {rarityFilter ? (
                <button
                  type="button"
                  onClick={() => setRarityFilter(null)}
                  style={{
                    marginTop: 19,
                    minHeight: 40,
                    padding: "8px 18px",
                    border: `1px solid ${mutedGold}`,
                    borderRadius: 22,
                    background: "rgba(11,41,27,.9)",
                    color: "#f1d897",
                    fontFamily: "inherit",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  View all cards
                </button>
              ) : (
                <div style={{ width: "min(100%, 235px)", margin: "21px auto 0", padding: "12px 13px", border: "1px solid rgba(215,178,99,.22)", borderRadius: 12, background: "rgba(2,16,10,.45)", boxSizing: "border-box" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#ebd59b", fontSize: 11 }}>
                    <span>Your Collection</span>
                    <span>{cards.length} / {data?.totalCards ?? 0}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Cards collected"
                    aria-valuemin={0}
                    aria-valuemax={data?.totalCards ?? 0}
                    aria-valuenow={cards.length}
                    style={{
                      height: 5,
                      marginTop: 8,
                      borderRadius: 6,
                      border: `1px solid ${mutedGold}`,
                      background: "rgba(4,18,12,.8)",
                      boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)",
                    }}
                  />
                </div>
              )}
              </div>
            </div>
          )}
          {visibleCards.map(card => {
            const rewardNeedsClearance = !card.firstRewardClaimed || rewardPopup?.cardId === card.id;
            return <article
              key={card.id}
              data-testid={`owned-card-${card.id}`}
              className="relative min-w-0"
              style={{ paddingBottom: rewardNeedsClearance ? "clamp(24px, 6.5vw, 30px)" : 0 }}
            >
            <div className="relative">
            <button type="button" aria-label={`View ${card.name}`} onClick={() => setSelectedCardId(card.id)} className="block w-full rounded-lg focus-visible:outline focus-visible:outline-amber-200">
              <CardPreview textSize="inventory" rarity={card.rarity} artworkUrl={card.artworkUrl} effectColor={card.effectColor} specialEffect={card.specialEffect} label={card.label} name={card.name} description={card.description} layout={getCardBorderLayout(layouts, card.rarity)} />
            </button>
            {card.quantity > 1 && <span aria-label={`${card.quantity} copies`} className="pointer-events-none absolute right-1 top-1 rounded-full border border-amber-200/60 bg-[#102419] px-2 py-1 text-xs font-bold">×{card.quantity}</span>}
            <CardRewardCoin cardName={card.name} claimed={card.firstRewardClaimed}
              disabled={claimReward.isPending} claiming={claimReward.isPending && claimReward.variables === card.id}
              rewardAmount={rewardPopup?.cardId === card.id ? rewardPopup.amount : undefined}
              onClaim={() => claimReward.mutate(card.id)} onDismiss={() => setRewardPopup(null)} />
            </div>
          </article>;
          })}
        </section>

        {cards.length > 0 && <section
          aria-label="Collection progress"
          data-testid="card-collection-progress-overlay"
          style={{
            position: "absolute",
            zIndex: 6,
            left: 19,
            bottom: "calc(21px + env(safe-area-inset-bottom))",
            width: "min(43%, 158px)",
            padding: "6px 9px 7px",
            border: `1px solid ${mutedGold}`,
            borderRadius: 14,
            background: "linear-gradient(180deg, rgba(4,22,14,.88), rgba(3,15,10,.76))",
            boxShadow: "inset 0 0 14px rgba(111,164,98,.05), 0 5px 13px rgba(0,0,0,.3)",
            backdropFilter: "blur(4px)",
            pointerEvents: "none",
            textAlign: "left",
            boxSizing: "border-box",
          }}
        >
          <div style={{ fontSize: "clamp(9px, 2.6vw, 11px)", color: "#f4dfa4", letterSpacing: ".025em", marginBottom: 1 }}>
            Your Collection
          </div>
          <div style={{ fontSize: "clamp(8px, 2.3vw, 10px)", color: "#88cf91", letterSpacing: ".015em", whiteSpace: "nowrap" }}>
            {cards.length} / {data?.totalCards ?? 0} cards collected
          </div>
        </section>}

      </div>
      {selectedCard && <CardDetailDialog key={selectedCard.id} card={selectedCard} layouts={layouts} onClose={() => setSelectedCardId(null)}
        onClaim={() => claimReward.mutate(selectedCard.id)} claiming={claimReward.isPending}
        rewardAmount={rewardPopup?.cardId === selectedCard.id ? rewardPopup.amount : undefined}
        onDismissReward={() => setRewardPopup(null)} />}
    </main>
  );
}
