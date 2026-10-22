"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type Locale = "es" | "en";

const STRINGS = {
  es: {
    search: "Buscar listings",
    placeholder: "grips, slots de camp, manoplas…",
    minPrice: "Precio mín",
    maxPrice: "Precio máx",
    condition: "Estado",
    all: "Todos",
    new: "Nuevo",
    used: "Usado",
    refurbished: "Reacondicionado",
    apply: "Aplicar filtros",
    clear: "Limpiar",
  },
  en: {
    search: "Search listings",
    placeholder: "grips, camp slots, grips…",
    minPrice: "Min price",
    maxPrice: "Max price",
    condition: "Condition",
    all: "All",
    new: "New",
    used: "Used",
    refurbished: "Refurbished",
    apply: "Apply filters",
    clear: "Clear",
  },
};

export function MarketplaceSearch({
  locale,
  initial,
}: {
  locale: Locale;
  initial: { q?: string; minPrice?: string; maxPrice?: string; condition?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const t = STRINGS[locale];

  const [q, setQ] = useState(initial.q ?? "");
  const [minPrice, setMinPrice] = useState(initial.minPrice ?? "");
  const [maxPrice, setMaxPrice] = useState(initial.maxPrice ?? "");
  const [condition, setCondition] = useState(initial.condition ?? "all");
  const [pending, startTransition] = useTransition();

  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (minPrice) next.set("minPrice", minPrice);
    if (maxPrice) next.set("maxPrice", maxPrice);
    if (condition && condition !== "all") next.set("condition", condition);
    startTransition(() => router.push(`/marketplace?${next.toString()}`));
  }

  function clear() {
    setQ("");
    setMinPrice("");
    setMaxPrice("");
    setCondition("all");
    startTransition(() => router.push("/marketplace"));
  }

  return (
    <form
      onSubmit={apply}
      style={{
        maxWidth: 1100,
        margin: "24px auto 0",
        padding: "0 20px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr auto auto",
          gap: 8,
          alignItems: "end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>
            {t.search}
          </span>
          <input
            type="search"
            placeholder={t.placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>
            {t.minPrice}
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>
            {t.maxPrice}
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="∞"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>
            {t.condition}
          </span>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            style={inputStyle}
          >
            <option value="all">{t.all}</option>
            <option value="new">{t.new}</option>
            <option value="used">{t.used}</option>
            <option value="refurbished">{t.refurbished}</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: "8px 14px",
            background: "#0f172a",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: pending ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {t.apply}
        </button>
        <button
          type="button"
          onClick={clear}
          style={{
            padding: "8px 14px",
            background: "transparent",
            color: "#64748b",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {t.clear}
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontFamily: "inherit",
};
