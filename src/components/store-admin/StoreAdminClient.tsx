"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  productType: string;
  isActive: boolean;
  isFeatured: boolean;
  stockQuantity: number | null;
  lowStockThreshold: number | null;
  imageUrls: string[];
  visibility: string;
};

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * UI admin de la tienda de la academia.
 * Sprint T2 MVP: lista + crear/editar básico + toggle activo.
 */
export function StoreAdminClient({
  academyId,
  academyName,
  initialProducts,
}: {
  academyId: string;
  academyName: string;
  initialProducts: Product[];
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [showNew, setShowNew] = useState(false);
  const [saving, startSaving] = useTransition();

  function refresh() {
    router.refresh();
  }

  async function create(values: Record<string, unknown>) {
    startSaving(async () => {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ academyId, ...values }),
      });
      if (res.ok) {
        const created = await res.json();
        setProducts((p) => [created, ...p]);
        setShowNew(false);
        refresh();
      } else {
        const detail = await res.json().catch(() => ({}));
        alert(`Error: ${detail.error ?? res.statusText}`);
      }
    });
  }

  async function toggleActive(p: Product) {
    startSaving(async () => {
      const res = await fetch(`/api/products/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProducts((all) => all.map((x) => (x.id === p.id ? updated : x)));
      }
    });
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Tienda — {academyName}</h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
            Productos visibles en tu tienda pública. Los pagos van a tu cuenta Stripe Connect.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
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
          {showNew ? "Cancelar" : "+ Nuevo producto"}
        </button>
      </header>

      {showNew && <NewProductForm onSubmit={create} disabled={saving} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {products.length === 0 ? (
          <p style={{ color: "#64748b", fontStyle: "italic", padding: 24, textAlign: "center" }}>
            Aún no tienes productos. Crea el primero.
          </p>
        ) : (
          products.map((p) => (
            <article
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: 14,
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                opacity: p.isActive ? 1 : 0.5,
              }}
            >
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{p.name}</h2>
                <p style={{ color: "#64748b", fontSize: 12, margin: "4px 0 0" }}>
                  {p.productType} · {formatPrice(p.priceCents, p.currency)}
                  {p.stockQuantity !== null && ` · Stock: ${p.stockQuantity}`}
                  {p.stockQuantity !== null &&
                    p.lowStockThreshold !== null &&
                    p.stockQuantity <= p.lowStockThreshold && (
                      <span style={{ color: "#dc2626", fontWeight: 600 }}> ⚠ stock bajo</span>
                    )}
                </p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  background: p.isActive ? "#dcfce7" : "#fee2e2",
                  color: p.isActive ? "#166534" : "#991b1b",
                  borderRadius: 100,
                  fontWeight: 600,
                }}
              >
                {p.isActive ? "Activo" : "Inactivo"}
              </span>
              <button
                type="button"
                onClick={() => toggleActive(p)}
                disabled={saving}
                style={miniBtn}
              >
                {p.isActive ? "Desactivar" : "Activar"}
              </button>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function NewProductForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [type, setType] = useState("physical");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name || !price) return;
        const values: Record<string, unknown> = {
          name,
          description: description || null,
          productType: type,
          priceCents: Math.round(parseFloat(price) * 100),
          stockQuantity: stock ? parseInt(stock, 10) : null,
          isActive: true,
          visibility: "public",
        };
        onSubmit(values);
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
        Nombre *
        <input value={name} onChange={(e) => setName(e.target.value)} required style={fieldInput} />
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
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...fieldInput, minHeight: 60 }} />
      </label>
      <label style={fieldLabel}>
        Tipo
        <select value={type} onChange={(e) => setType(e.target.value)} style={fieldInput}>
          <option value="physical">Producto físico</option>
          <option value="digital">Digital</option>
          <option value="camp_registration">Inscripción a camp</option>
          <option value="session_pack">Pack de sesiones</option>
        </select>
      </label>
      <label style={fieldLabel}>
        Stock (vacío = ilimitado)
        <input
          type="number"
          min="0"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          style={fieldInput}
        />
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
        {disabled ? "Creando..." : "Crear producto"}
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
