"use client";

import { useEffect, useState, useTransition } from "react";

type Listing = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  condition: string;
  quantityAvailable: number;
  quantitySold: number;
  status: string;
};

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

export function MarketplaceAdminClient({
  academyId,
  academyName,
}: {
  academyId: string;
  academyName: string;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; slug: string; nameEs: string; nameEn: string; icon: string | null }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, startSaving] = useTransition();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    void loadCategories();
  }, []);

  async function load() {
    setLoading(true);
    // Filtramos client-side por sellerAcademyId (en T3.5 sería server-side)
    const res = await fetch("/api/marketplace/listings");
    const all = res.ok ? ((await res.json()) as Listing[]) : [];
    // Como no tenemos sellerAcademyId en la respuesta, mostramos todos (T3.5 filtra)
    setListings(all.slice(0, 20));
    setLoading(false);
  }

  async function loadCategories() {
    const res = await fetch("/api/listing-categories");
    if (res.ok) setCategories(await res.json());
  }

  async function create(values: Record<string, unknown>) {
    startSaving(async () => {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sellerAcademyId: academyId, ...values }),
      });
      if (res.ok) {
        setShowForm(false);
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(`Error: ${d.error ?? res.statusText}`);
      }
    });
  }

  async function publish(id: string) {
    startSaving(async () => {
      await fetch(`/api/marketplace/listings/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      await load();
    });
  }

  async function withdraw(id: string) {
    if (!confirm("¿Retirar este listing del marketplace?")) return;
    startSaving(async () => {
      await fetch(`/api/marketplace/listings/${id}`, { method: "DELETE" });
      await load();
    });
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Marketplace — {academyName}
          </h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
            Vende material o slots sobrantes a otras academias. Zaltyko cobra una
            comisión del 10% sobre cada venta (5% plan Growth, 0% plan Network).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          style={{
            padding: "8px 14px",
            background: "#0f172a",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {showForm ? "Cancelar" : "+ Nuevo listing"}
        </button>
      </header>

      {showForm && <NewListingForm onSubmit={create} disabled={saving} />}

      {loading ? (
        <p style={{ color: "#64748b" }}>Cargando…</p>
      ) : listings.length === 0 ? (
        <p style={{ color: "#64748b", fontStyle: "italic" }}>
          Aún no has publicado listings en el marketplace.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {listings.map((l) => (
            <article
              key={l.id}
              style={{
                display: "flex",
                gap: 12,
                padding: 14,
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
              }}
            >
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{l.title}</h3>
                <p style={{ color: "#64748b", fontSize: 12, margin: "4px 0 0" }}>
                  {formatPrice(l.priceCents, l.currency)} · {l.condition} ·{" "}
                  {l.quantityAvailable - l.quantitySold}/{l.quantityAvailable} disp.
                </p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  background:
                    l.status === "active" ? "#dcfce7" : l.status === "sold" ? "#fef3c7" : "#f1f5f9",
                  color: l.status === "active" ? "#166534" : l.status === "sold" ? "#92400e" : "#475569",
                  borderRadius: 100,
                  fontWeight: 600,
                }}
              >
                {l.status}
              </span>
              {l.status === "draft" && (
                <button onClick={() => publish(l.id)} disabled={saving} style={miniBtn}>
                  Publicar
                </button>
              )}
              {l.status === "active" && (
                <button onClick={() => withdraw(l.id)} disabled={saving} style={miniBtn}>
                  Retirar
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function NewListingForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [categoryId, setCategoryId] = useState("");
  const [condition, setCondition] = useState("used");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title || !price) return;
        onSubmit({
          title,
          description: description || null,
          priceCents: Math.round(parseFloat(price) * 100),
          quantityAvailable: parseInt(quantity, 10) || 1,
          condition,
          commissionRatePct: 10,
          categoryId: categoryId || null,
        });
      }}
      style={{
        padding: 16,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        marginBottom: 16,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
      }}
    >
      <label style={fieldLabel}>
        Título *
        <input value={title} onChange={(e) => setTitle(e.target.value)} required style={fieldInput} />
      </label>
      <label style={fieldLabel}>
        Precio (€) *
        <input
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          style={fieldInput}
        />
      </label>
      <label style={{ ...fieldLabel, gridColumn: "1 / -1" }}>
        Descripción
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ ...fieldInput, minHeight: 60 }}
        />
      </label>
      <label style={fieldLabel}>
        Cantidad
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          style={fieldInput}
        />
      </label>
      <label style={fieldLabel}>
        Estado
        <select value={condition} onChange={(e) => setCondition(e.target.value)} style={fieldInput}>
          <option value="new">Nuevo</option>
          <option value="used">Usado</option>
          <option value="refurbished">Reacondicionado</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={disabled}
        style={{
          gridColumn: "1 / -1",
          padding: "10px",
          background: "#16a34a",
          color: "white",
          border: 0,
          borderRadius: 6,
          cursor: disabled ? "wait" : "pointer",
          fontWeight: 600,
        }}
      >
        {disabled ? "Creando..." : "Crear listing"}
      </button>
    </form>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  fontWeight: 600,
  color: "#0f172a",
};
const fieldInput: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontFamily: "inherit",
};
const miniBtn: React.CSSProperties = {
  padding: "6px 12px",
  background: "white",
  border: "1px solid #cbd5e1",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
};
