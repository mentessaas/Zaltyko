"use client";

import type { ListingCategory } from "@/lib/marketplace/categories";

export function CategorySelect({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (slug: string) => void;
  categories: ListingCategory[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={selectStyle}
      aria-label="Categoría"
    >
      <option value="">Sin categoría</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.icon ? `${c.icon} ` : ""}{c.nameEs}
        </option>
      ))}
    </select>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontFamily: "inherit",
};
