import { useState } from "react";
import { useLocation } from "wouter";

import emptyCard from "@assets/uploads/EmptyCard.png";
import cardPageDecor from "@assets/uploads/CardPageDecor.png";
import cardTitle from "@assets/uploads/CardTitle.png";
import oneStarButton from "@assets/uploads/1StarButton.png";
import twoStarButton from "@assets/uploads/2StarButton.png";
import threeStarButton from "@assets/uploads/3StarButton.png";
import fourStarButton from "@assets/uploads/4StarButton.png";
import fiveStarButton from "@assets/uploads/5StarButton.png";

const PLACEHOLDER_SLOTS = Array.from({ length: 6 }, (_, index) => index);

const RARITY_FILTERS = [
  { rarity: 1, src: oneStarButton, label: "1 star" },
  { rarity: 2, src: twoStarButton, label: "2 stars" },
  { rarity: 3, src: threeStarButton, label: "3 stars" },
  { rarity: 4, src: fourStarButton, label: "4 stars" },
  { rarity: 5, src: fiveStarButton, label: "5 stars" },
] as const;

export default function CardsCollectionPage() {
  const [, navigate] = useLocation();
  const [rarityFilter, setRarityFilter] = useState<number | null>(null);

  return (
    <main
      data-testid="page-cards-collection"
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        background:
          "radial-gradient(circle at 50% 16%, rgba(83,126,83,.34), transparent 36%), linear-gradient(180deg, #07120c 0%, #0d2115 55%, #050b08 100%)",
        color: "#f8e7b0",
        fontFamily: "'Cinzel', 'Palatino Linotype', serif",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(100%, 430px)",
          minHeight: "100%",
          margin: "0 auto",
          padding: "34px 16px 150px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          data-testid="button-close-cards"
          aria-label="Close cards collection"
          onClick={() => navigate("/")}
          style={{
            position: "absolute",
            zIndex: 4,
            top: 18,
            right: 18,
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "1px solid rgba(224,181,74,.72)",
            background: "rgba(7,18,12,.88)",
            color: "#f0c040",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,.45)",
          }}
        >
          ×
        </button>

        <header style={{ position: "relative", zIndex: 2, textAlign: "center", marginBottom: 12 }}>
          <img
            src={cardTitle}
            alt="Cards"
            draggable={false}
            style={{
              display: "block",
              width: "min(78%, 290px)",
              height: "auto",
              margin: "0 auto",
              objectFit: "contain",
              filter: "drop-shadow(0 6px 12px rgba(0,0,0,.48))",
            }}
          />
        </header>

        <nav
          aria-label="Filter cards by rarity"
          style={{
            position: "relative",
            zIndex: 2,
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            alignItems: "center",
            gap: 5,
            margin: "0 auto 18px",
            width: "100%",
          }}
        >
          {RARITY_FILTERS.map(filter => {
            const selected = rarityFilter === filter.rarity;
            return (
              <button
                key={filter.rarity}
                type="button"
                aria-label={`Filter ${filter.label} cards`}
                aria-pressed={selected}
                data-testid={`button-card-filter-${filter.rarity}`}
                onClick={() => setRarityFilter(current => current === filter.rarity ? null : filter.rarity)}
                style={{
                  appearance: "none",
                  border: 0,
                  padding: 0,
                  background: "transparent",
                  cursor: "pointer",
                  opacity: rarityFilter !== null && !selected ? 0.56 : 1,
                  transform: selected ? "translateY(-2px) scale(1.06)" : "none",
                  filter: selected
                    ? "drop-shadow(0 0 8px rgba(246,205,91,.72))"
                    : "drop-shadow(0 3px 5px rgba(0,0,0,.35))",
                  transition: "transform 150ms ease, opacity 150ms ease, filter 150ms ease",
                }}
              >
                <img
                  src={filter.src}
                  alt=""
                  draggable={false}
                  style={{ display: "block", width: "100%", height: "auto", objectFit: "contain" }}
                />
              </button>
            );
          })}
        </nav>

        <section
          aria-label={rarityFilter ? `${rarityFilter} star card collection` : "Card collection"}
          data-rarity-filter={rarityFilter ?? "all"}
          style={{
            position: "relative",
            zIndex: 2,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {PLACEHOLDER_SLOTS.map(slot => (
            <div
              key={slot}
              data-testid={`card-collection-placeholder-${slot + 1}`}
              aria-hidden="true"
              style={{
                position: "relative",
                aspectRatio: "2 / 3",
                display: "grid",
                placeItems: "center",
                filter: "drop-shadow(0 7px 8px rgba(0,0,0,.28))",
              }}
            >
              <img
                src={emptyCard}
                alt=""
                draggable={false}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  userSelect: "none",
                }}
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
            position: "absolute",
            zIndex: 1,
            left: "50%",
            bottom: 0,
            width: "112%",
            maxWidth: "none",
            height: "auto",
            transform: "translateX(-50%)",
            objectFit: "contain",
            pointerEvents: "none",
            userSelect: "none",
            filter: "drop-shadow(0 -5px 12px rgba(0,0,0,.24))",
          }}
        />
      </div>
    </main>
  );
}
