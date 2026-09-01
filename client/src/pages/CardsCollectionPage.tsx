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
import closeButton from "@assets/uploads/ClosetCloseButton.png";

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
        overflowX: "hidden",
        background:
          "radial-gradient(ellipse at 50% 7%, rgba(72,121,77,.3), transparent 30%), radial-gradient(ellipse at 50% 58%, rgba(31,74,49,.18), transparent 46%), linear-gradient(180deg, #07170f 0%, #092017 42%, #04100b 100%)",
        color: "#f8e7b0",
        fontFamily: "'Cinzel', 'Palatino Linotype', serif",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(100%, 430px)",
          minHeight: "100%",
          margin: "0 auto",
          padding:
            "max(14px, env(safe-area-inset-top)) 12px calc(104px + env(safe-area-inset-bottom))",
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
            zIndex: 6,
            top: "max(12px, env(safe-area-inset-top))",
            right: 10,
            width: "clamp(38px, 11vw, 48px)",
            height: "clamp(38px, 11vw, 48px)",
            appearance: "none",
            border: 0,
            padding: 0,
            background: "transparent",
            cursor: "pointer",
            filter: "drop-shadow(0 5px 8px rgba(0,0,0,.46))",
          }}
        >
          <img
            src={closeButton}
            alt=""
            draggable={false}
            style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
          />
        </button>

        <section
          aria-label="Card collection controls"
          style={{
            position: "relative",
            zIndex: 3,
            width: "100%",
            margin: "0 auto clamp(2px, 1vw, 6px)",
            padding: "clamp(4px, 1.5vw, 8px) 4px 0",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          <img
            src={cardTitle}
            alt="Cards"
            draggable={false}
            style={{
              display: "block",
              width: "min(70vw, 276px)",
              height: "auto",
              margin: "0 auto clamp(2px, 1vw, 6px)",
              objectFit: "contain",
              filter: "drop-shadow(0 6px 12px rgba(0,0,0,.5))",
              userSelect: "none",
            }}
          />

          <nav
            aria-label="Filter cards by rarity"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              alignItems: "center",
              gap: "clamp(2px, .8vw, 5px)",
              width: "min(96%, 400px)",
              margin: "0 auto",
              padding: "2px 2px 0",
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
                  onClick={() =>
                    setRarityFilter(current => (current === filter.rarity ? null : filter.rarity))
                  }
                  style={{
                    appearance: "none",
                    border: 0,
                    padding: 0,
                    background: "transparent",
                    cursor: "pointer",
                    opacity: subdued ? 0.5 : 1,
                    transform: selected ? "translateY(-2px) scale(1.075)" : "scale(1)",
                    filter: selected
                      ? "drop-shadow(0 0 8px rgba(249,214,102,.86)) drop-shadow(0 3px 5px rgba(0,0,0,.4))"
                      : "drop-shadow(0 3px 5px rgba(0,0,0,.38))",
                    transition: "transform 150ms ease, opacity 150ms ease, filter 150ms ease",
                  }}
                >
                  <img
                    src={filter.src}
                    alt=""
                    draggable={false}
                    style={{
                      display: "block",
                      width: "100%",
                      height: "auto",
                      objectFit: "contain",
                      userSelect: "none",
                    }}
                  />
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
              width: "min(108%, 450px)",
              height: "clamp(38px, 12vw, 54px)",
              margin: "clamp(-5px, -1vw, -2px) auto clamp(-8px, -1.5vw, -4px)",
              objectFit: "contain",
              pointerEvents: "none",
              userSelect: "none",
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,.32))",
            }}
          />
        </section>

        <section
          aria-label={rarityFilter ? `${rarityFilter} star card collection` : "Card collection"}
          data-rarity-filter={rarityFilter ?? "all"}
          style={{
            position: "relative",
            zIndex: 2,
            width: "min(94%, 394px)",
            margin: "0 auto",
            padding: "clamp(8px, 2vw, 12px) clamp(5px, 1.5vw, 8px) clamp(12px, 3vw, 18px)",
            boxSizing: "border-box",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            columnGap: "clamp(7px, 2.2vw, 11px)",
            rowGap: "clamp(4px, 1.3vw, 7px)",
            borderRadius: 24,
            background:
              "radial-gradient(ellipse at 50% 12%, rgba(210,170,78,.055), transparent 48%), rgba(1,13,9,.18)",
            boxShadow:
              "inset 0 0 30px rgba(0,0,0,.2), 0 12px 30px rgba(0,0,0,.12)",
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
                filter: "drop-shadow(0 6px 7px rgba(0,0,0,.3))",
              }}
            >
              <img
                src={emptyCard}
                alt=""
                draggable={false}
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  margin: 0,
                  objectFit: "contain",
                  userSelect: "none",
                }}
              />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
