import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { setNavHidden } from "@/lib/navVisibility";

import emptyCard from "@assets/uploads/EmptyCard.png";
import cardPageDecor from "@assets/uploads/CardPageDecor.png";
import cardTitle from "@assets/uploads/CardTitle.png";
import oneStarButton from "@assets/uploads/1StarButton.png";
import twoStarButton from "@assets/uploads/2StarButton.png";
import threeStarButton from "@assets/uploads/3StarButton.png";
import fourStarButton from "@assets/uploads/4StarButton.png";
import fiveStarButton from "@assets/uploads/5StarButton.png";
import closeButton from "@assets/uploads/ClosetCloseButton.png";

const PLACEHOLDER_SLOTS = Array.from({ length: 4 }, (_, index) => index);

const RARITY_FILTERS = [
  { rarity: 1, src: oneStarButton, label: "1 star" },
  { rarity: 2, src: twoStarButton, label: "2 stars" },
  { rarity: 3, src: threeStarButton, label: "3 stars" },
  { rarity: 4, src: fourStarButton, label: "4 stars" },
  { rarity: 5, src: fiveStarButton, label: "5 stars" },
] as const;

const gold = "rgba(216,176,74,.78)";
const mutedGold = "rgba(216,176,74,.34)";

export default function CardsCollectionPage() {
  const [, navigate] = useLocation();
  const [rarityFilter, setRarityFilter] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState("rarity");

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
        overflowY: "auto",
        overflowX: "hidden",
        background:
          "radial-gradient(circle at 50% 11%, rgba(67,139,80,.25), transparent 31%), radial-gradient(circle at 18% 30%, rgba(58,115,73,.12), transparent 24%), radial-gradient(circle at 82% 66%, rgba(58,115,73,.1), transparent 24%), linear-gradient(180deg, #06150d 0%, #0a2117 48%, #06120d 100%)",
        color: "#f6df9e",
        fontFamily: "'Cinzel', 'Palatino Linotype', serif",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
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
          minHeight: "100%",
          margin: "0 auto",
          padding: "max(14px, env(safe-area-inset-top)) 12px calc(48px + env(safe-area-inset-bottom))",
          boxSizing: "border-box",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "8px 7px 18px",
            border: `1px solid ${mutedGold}`,
            borderRadius: 3,
            pointerEvents: "none",
            boxShadow: "inset 0 0 34px rgba(7,30,20,.55), 0 0 18px rgba(0,0,0,.18)",
          }}
        />

        {[
          { top: 8, left: 7, borderTop: `3px solid ${gold}`, borderLeft: `3px solid ${gold}` },
          { top: 8, right: 7, borderTop: `3px solid ${gold}`, borderRight: `3px solid ${gold}` },
          { bottom: 18, left: 7, borderBottom: `3px solid ${gold}`, borderLeft: `3px solid ${gold}` },
          { bottom: 18, right: 7, borderBottom: `3px solid ${gold}`, borderRight: `3px solid ${gold}` },
        ].map((corner, index) => (
          <div
            key={index}
            aria-hidden="true"
            style={{
              position: "absolute",
              zIndex: 1,
              width: 28,
              height: 28,
              borderRadius: index === 0 ? "5px 0 0 0" : index === 1 ? "0 5px 0 0" : index === 2 ? "0 0 0 5px" : "0 0 5px 0",
              pointerEvents: "none",
              ...corner,
            }}
          />
        ))}

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
            width: "clamp(38px, 10vw, 45px)",
            height: "clamp(38px, 10vw, 45px)",
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
            padding: "clamp(18px, 5vw, 26px) 8px 0",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          <img
            src={cardTitle}
            alt="Cards"
            draggable={false}
            style={{
              display: "block",
              width: "min(64vw, 258px)",
              height: "auto",
              margin: "0 auto clamp(5px, 1.5vw, 8px)",
              objectFit: "contain",
              filter: "drop-shadow(0 7px 13px rgba(0,0,0,.55))",
              userSelect: "none",
            }}
          />

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
              0 / 0 cards collected
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
            src={cardPageDecor}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              display: "block",
              width: "min(82%, 315px)",
              height: "clamp(31px, 9vw, 40px)",
              margin: "1px auto 0",
              objectFit: "contain",
              pointerEvents: "none",
              userSelect: "none",
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,.3))",
            }}
          />
        </header>

        <section
          aria-label="Card collection tools"
          style={{
            position: "relative",
            zIndex: 3,
            width: "min(88%, 365px)",
            margin: "0 auto 8px",
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
                outline: "none",
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
            {rarityFilter ? `${rarityFilter}★ (0)` : "All (0)"}
          </div>
        </section>

        <section
          aria-label={rarityFilter ? `${rarityFilter} star card collection` : "Card collection"}
          data-rarity-filter={rarityFilter ?? "all"}
          style={{
            position: "relative",
            zIndex: 2,
            width: "min(89%, 370px)",
            margin: "0 auto",
            padding: "clamp(7px, 2vw, 10px) clamp(5px, 1.4vw, 7px) 10px",
            boxSizing: "border-box",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            columnGap: "clamp(8px, 2.4vw, 12px)",
            rowGap: "clamp(5px, 1.6vw, 8px)",
            borderRadius: 14,
            background: "linear-gradient(180deg, rgba(2,17,11,.38), rgba(1,12,8,.18))",
            border: "1px solid rgba(216,176,74,.09)",
            boxShadow: "inset 0 0 26px rgba(0,0,0,.18), 0 10px 24px rgba(0,0,0,.12)",
          }}
        >
          {PLACEHOLDER_SLOTS.map(slot => (
            <div
              key={slot}
              data-testid={`card-collection-placeholder-${slot + 1}`}
              aria-hidden="true"
              style={{
                minWidth: 0,
                lineHeight: 0,
                filter: "drop-shadow(0 6px 7px rgba(0,0,0,.32))",
              }}
            >
              <img
                src={emptyCard}
                alt=""
                draggable={false}
                style={{ display: "block", width: "100%", height: "auto", margin: 0, objectFit: "contain", userSelect: "none" }}
              />
            </div>
          ))}
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
            height: "clamp(35px, 10vw, 45px)",
            margin: "2px auto 0",
            objectFit: "contain",
            pointerEvents: "none",
            userSelect: "none",
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,.28))",
          }}
        />
      </div>
    </main>
  );
}
