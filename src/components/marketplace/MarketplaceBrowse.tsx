"use client";

import { useState } from "react";

import type { Locale } from "@/i18n";
import { CategoryTree } from "@/components/marketplace/CategoryTree";

type Listing = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  condition: string;
  quantityAvailable: number;
  quantitySold: number;
  categoryId?: string | null;
};

type CategoryNode = {
  id: string;
  label: string;
  slug: string;
  children?: CategoryNode[];
};

function formatPrice(cents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-ES", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

const STRINGS = {
  es: {
    title: "Marketplace B2B",
    subtitle:
      "Material, equipamiento y slots de camp cancelados ofrecidos por academias de la red Zaltyko. Cada transacción está cubierta por la política de disputas y auditoría de Zaltyko.",
    empty: "Aún no hay listings activos en el marketplace.",
    conditionNew: "Nuevo",
    conditionRefurb: "Reacondicionado",
    available: "disp.",
    soldOut: "AGOTADO",
  },
  en: {
    title: "B2B Marketplace",
    subtitle:
      "Equipment, gear and cancelled camp slots offered by academies in the Zaltyko network. Every transaction is covered by Zaltyko's dispute policy and audit.",
    empty: "No active listings in the marketplace yet.",
    conditionNew: "New",
    conditionRefurb: "Refurbished",
    available: "avail.",
    soldOut: "SOLD OUT",
  },
};

export function MarketplaceBrowse({
  listings,
  categories = [],
  initialCategoryId,
  locale,
}: {
  listings: Listing[];
  categories?: CategoryNode[];
  initialCategoryId?: string;
  locale: Locale;
}) {
  const t = STRINGS[locale === "en" ? "en" : "es"];
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    initialCategoryId ?? null
  );

  // Adapt CategoryNode[] → Category[] para CategoryTree
  const adaptedCategories = categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    nameEs: c.label,
    icon: null,
    parentId: null,
    children: c.children?.map((cc) => ({
      id: cc.id,
      slug: cc.slug,
      nameEs: cc.label,
      icon: null,
      parentId: c.id,
    })),
  }));
  const filtered = selectedCategory
    ? listings.filter((l) => l.categoryId === selectedCategory)
    : listings;
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>{t.title}</h1>
        <p style={{ color: "#5C6782", fontSize: 15, margin: 0, maxWidth: 720 }}>{t.subtitle}</p>
      </header>

      {adaptedCategories.length > 0 && (
        <CategoryTree
          categories={adaptedCategories}
          selectedId={selectedCategory ?? ""}
          onSelect={(id) => setSelectedCategory(id || null)}
        />
      )}

      {filtered.length === 0 ? (
        <p style={{ color: "#5C6782", fontStyle: "italic" }}>{t.empty}</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((l) => {
            const remaining = l.quantityAvailable - l.quantitySold;
            const soldOut = remaining <= 0;
            return (
              <article
                key={l.id}
                style={{
                  padding: 16,
                  background: "white",
                  border: "1px solid #D5DAE3",
                  borderRadius: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  opacity: soldOut ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      padding: "2px 8px",
                      background: "#E9ECE6",
                      borderRadius: 100,
                      color: "#3E4A66",
                    }}
                  >
                    {l.condition === "new"
                      ? t.conditionNew
                      : l.condition === "refurbished"
                      ? t.conditionRefurb
                      : l.condition}
                  </span>
                  {soldOut && (
                    <span style={{ fontSize: 10, color: "#C93C20", fontWeight: 700 }}>
                      {t.soldOut}
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                  <a
                    href={`/marketplace/${l.id}`}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {l.title}
                  </a>
                </h3>
                {l.description ? (
                  <p
                    style={{
                      fontSize: 13,
                      color: "#5C6782",
                      lineHeight: 1.45,
                      margin: 0,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {l.description}
                  </p>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginTop: "auto",
                    paddingTop: 8,
                    borderTop: "1px solid #E9ECE6",
                  }}
                >
                  <strong style={{ fontSize: 18 }}>
                    {formatPrice(l.priceCents, l.currency, locale)}
                  </strong>
                  <span style={{ fontSize: 11, color: "#8A93A8" }}>
                    {remaining} {t.available}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
