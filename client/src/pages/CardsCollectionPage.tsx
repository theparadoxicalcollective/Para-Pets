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

import emptyCard from "@assets/uploads/EmptyCard.png";
import cardPageDecor from "@assets/uploads/CardPageDecor.png";
import cardTitle from "@assets/uploads/CardTitle.png";
import decorDivider from "@assets/uploads/DecorDivider.png";
import oneStarButton from "@assets/uploads/1StarButton.png";
import twoStarButton from "@assets/uploads/2StarButton.png";
import threeStarButton from "@assets/uploads/3StarButton.png";
import fourStarButton from "@assets/uploads/4StarButton.png";
import fiveStarButton from "@assets/uploads/5StarButton.png";
import closeButton from "@assets/uploads/ClosetCloseButton.png";

const RARITY_FILTERS = [
  { rarity: 1, src: oneStarButton, label: "1 star" },
  { rarity: 2, src: twoStarButton, label: "2 stars" },
  { rarity: 3, src: threeStarButton, label: "3 stars" },
  { rarity: 4, src: fourStarButton, label: "4 stars" },
  { rarity: 5, src: fiveStarButton, label: "5 stars" },
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
            width: 44,
            height: 44,
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
          <div style={{
            width: "calc(100% - 72px)",
            margin: "0 auto 8px",
            padding: "5px 0 1px",
            background: "radial-gradient(ellipse, rgba(120,179,103,.13), transparent 72%)",
          }}>
            <div aria-hidden="true" style={{ color: "#bfa35f", fontSize: 9, letterSpacing: ".28em", lineHeight: 1.45 }}>
              PARA PETS
            </div>
            <h1 className="sr-only">Cards</h1>
            <img
              src={cardTitle}
              alt=""
              aria-hidden="true"
              draggable={false}
              style={{
                display: "block",
                width: "min(88%, 286px)",
                maxHeight: 66,
                margin: "2px auto 0",
                objectFit: "contain",
                filter: "drop-shadow(0 4px 9px rgba(0,0,0,.5)) drop-shadow(0 0 10px rgba(225,187,83,.16))",
                userSelect: "none",
              }}
            />
          </div>

          <section
            aria-label="Collection progress"
            style={{
              width: "min(72%, 280px)",
              margin: "0 auto clamp(9px, 2.5vw, 12px)",
              padding: "7px 18px 8px",
              border: `1px solid ${mutedGold}`,
              borderRadius: 18,
              background: "linear-gradient(180deg, rgba(4,22,14,.82), rgba(3,15,10,.62))",
              boxShadow: "inset 0 0 18px rgba(111,164,98,.06), 0 5px 12px rgba(0,0,0,.18)",
            }}
          >
            <div style={{ fontSize: "clamp(12px, 3.5vw, 15px)", color: "#f4dfa4", letterSpacing: ".03em", marginBottom: 2 }}>
              Your Collection
            </div>
            <div style={{ fontSize: "clamp(11px, 3vw, 13px)", color: "#88cf91", letterSpacing: ".02em" }}>
              {cards.length} / {data?.totalCards ?? 0} cards collected
            </div>
          </section>

          <nav
            aria-label="Filter cards by rarity"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              alignItems: "center",
              gap: "clamp(3px, 1vw, 6px)",
              width: "100%",
              margin: "0 auto",
              padding: "0 2px",
              boxSizing: "border-box",
            }}
          >
            {RARITY_FILTERS.map(filter => {
              const selected = rarityFilter === filter.rarity;
              const subdued = rarityFilter !== null && !selected;

              return (
                <button
                  key={filter.rarity}
                  type="button"
                  aria-label={`Filter ${filter.label} cards`}
                  aria-pressed={selected}
                  data-testid={`button-card-filter-${filter.rarity}`}
                  onClick={() => setRarityFilter(current => (current === filter.rarity ? null : filter.rarity))}
                  style={{
                    appearance: "none",
                    border: 0,
                    padding: "3px 1px",
                    minHeight: 44,
                    background: selected ? "radial-gradient(ellipse, rgba(231,192,86,.12), transparent 68%)" : "transparent",
                    borderRadius: 18,
                    cursor: "pointer",
                    opacity: subdued ? 0.42 : 1,
                    transform: selected ? "translateY(-2px) scale(1.07)" : "scale(1)",
                    filter: selected
                      ? "drop-shadow(0 0 9px rgba(249,214,102,.9)) drop-shadow(0 3px 5px rgba(0,0,0,.4))"
                      : "drop-shadow(0 3px 5px rgba(0,0,0,.36))",
                    transition: "transform 150ms ease, opacity 150ms ease, filter 150ms ease",
                  }}
                >
                  <img src={filter.src} alt="" draggable={false} style={{ display: "block", width: "100%", height: "auto", objectFit: "contain", userSelect: "none" }} />
                </button>
              );
            })}
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
            width: "min(90%, 375px)",
            margin: "0 auto 8px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <label style={{ position: "relative", flex: "0 1 132px" }}>
            <span className="sr-only">Sort cards</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
              data-testid="select-card-sort"
              style={{
                width: "100%",
                appearance: "none",
                border: `1px solid ${mutedGold}`,
                borderRadius: 18,
                padding: "7px 28px 7px 13px",
                background: "rgba(5,25,16,.72)",
                color: "#ddcb96",
                fontFamily: "inherit",
                fontSize: "clamp(10px, 2.8vw, 12px)",
                minHeight: 36,
              }}
            >
              <option value="rarity">Sort: Rarity</option>
              <option value="name">Sort: Name</option>
            </select>
            <span aria-hidden="true" style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-53%)", color: "#c7aa56", fontSize: 14, pointerEvents: "none" }}>⌄</span>
          </label>

          <div
            data-testid="card-collection-count"
            style={{
              minWidth: 78,
              padding: "7px 12px",
              border: `1px solid ${mutedGold}`,
              borderRadius: 18,
              background: "rgba(5,25,16,.72)",
              color: "#e1cc8e",
              fontSize: "clamp(10px, 2.8vw, 12px)",
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
            padding: "clamp(7px, 2vw, 10px) clamp(5px, 1.4vw, 7px) 14px",
            boxSizing: "border-box",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            alignContent: "start",
            columnGap: "clamp(8px, 2.4vw, 12px)",
            rowGap: "clamp(5px, 1.6vw, 8px)",
            borderRadius: 18,
            background: "radial-gradient(ellipse at 50% 4%, rgba(62,117,73,.12), transparent 48%)",
            border: "none",
            boxShadow: "none",
          }}
        >
          {isLoading && <p className="col-span-2 py-5 text-center text-sm" role="status">Loading cards…</p>}
          {isError && <div className="col-span-2 py-5 text-center" role="alert"><p>Could not load your cards.</p><button type="button" onClick={() => refetch()} className="mt-2 underline">Try again</button></div>}
          {!isLoading && !isError && visibleCards.length === 0 && <>
            <div data-testid="card-collection-placeholder-1" aria-hidden="true" style={{ minWidth: 0, opacity: .55, filter: "grayscale(1) brightness(.7)" }}>
              <img src={emptyCard} alt="" draggable={false} style={{ display: "block", width: "100%" }} />
            </div>
            <p className="col-span-2 text-center text-xs text-amber-100/60">{rarityFilter ? "No cards of this rarity yet." : "Collected cards will appear here."}</p>
          </>}
          {visibleCards.map(card => <article key={card.id} data-testid={`owned-card-${card.id}`} className="relative min-w-0 pb-8">
            <div className="relative">
            <button type="button" aria-label={`View ${card.name}`} onClick={() => setSelectedCardId(card.id)} className="block w-full rounded-lg focus-visible:outline focus-visible:outline-amber-200">
              <CardPreview textSize="inventory" rarity={card.rarity} artworkUrl={card.artworkUrl} name={card.name} description={card.description} layout={getCardBorderLayout(layouts, card.rarity)} />
            </button>
            {card.quantity > 1 && <span aria-label={`${card.quantity} copies`} className="pointer-events-none absolute right-1 top-1 rounded-full border border-amber-200/60 bg-[#102419] px-2 py-1 text-xs font-bold">×{card.quantity}</span>}
            <CardRewardCoin cardName={card.name} claimed={card.firstRewardClaimed}
              disabled={claimReward.isPending} claiming={claimReward.isPending && claimReward.variables === card.id}
              rewardAmount={rewardPopup?.cardId === card.id ? rewardPopup.amount : undefined}
              onClaim={() => claimReward.mutate(card.id)} onDismiss={() => setRewardPopup(null)} />
            </div>
          </article>)}
        </section>

        <img
          src={cardPageDecor}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            position: "relative",
            zIndex: 2,
            display: "block",
            width: "min(70%, 275px)",
            flexShrink: 0,
            height: 30,
            margin: "2px auto 0",
            objectFit: "contain",
            pointerEvents: "none",
            userSelect: "none",
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,.28))",
          }}
        />
      </div>
      {selectedCard && <CardDetailDialog key={selectedCard.id} card={selectedCard} layouts={layouts} onClose={() => setSelectedCardId(null)}
        onClaim={() => claimReward.mutate(selectedCard.id)} claiming={claimReward.isPending}
        rewardAmount={rewardPopup?.cardId === selectedCard.id ? rewardPopup.amount : undefined}
        onDismissReward={() => setRewardPopup(null)} />}
    </main>
  );
}
