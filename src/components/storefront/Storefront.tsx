"use client";

import { useState, useTransition } from "react";

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  productType: string;
  imageUrls: string[];
  stockQuantity: number | null;
};

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * Tienda pública de la academia — Sprint T2 MVP.
 * Flujo: browse → carrito simple → email + redirect a Stripe Checkout.
 * Sin login persistente; cada venta es guest checkout.
 */
export function Storefront({
  academyName,
  academyId,
  academySlug = "",
  products,
}: {
  academyName: string;
  academyId: string;
  academySlug?: string;
  products: Product[];
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, startSubmitting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const lines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));

  const subtotalCents = lines.reduce((sum, l) => {
    const p = products.find((x) => x.id === l.productId);
    return sum + (p?.priceCents ?? 0) * l.quantity;
  }, 0);
  const currency = products[0]?.currency ?? "EUR";

  function add(id: string) {
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  }
  function sub(id: string) {
    setCart((c) => {
      const next = { ...c };
      if (next[id] <= 1) delete next[id];
      else next[id] -= 1;
      return next;
    });
  }

  async function checkout() {
    if (!email || lines.length === 0) return;
    setError(null);
    startSubmitting(async () => {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          academyId,
          customerEmail: email,
          customerName: name || undefined,
          lines,
        }),
      });
      if (res.ok) {
        const { url } = await res.json();
        if (url) {
          window.location.href = url;
        } else {
          setError("No se recibió URL de checkout");
        }
      } else {
        const detail = await res.json().catch(() => ({}));
        setError(detail.detail ?? detail.error ?? res.statusText);
      }
    });
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 32, paddingBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
        <a href={`/a/${academySlug}`} style={{ color: "#64748b", fontSize: 13 }}>
          ← Volver a {academyName}
        </a>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "8px 0 0" }}>
          Tienda — {academyName}
        </h1>
      </header>

      {products.length === 0 ? (
        <p style={{ color: "#64748b", fontStyle: "italic" }}>
          Esta academia aún no tiene productos en su tienda.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <section>
            {products.map((p) => (
              <article
                key={p.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: 14,
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  marginBottom: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{p.name}</h3>
                  <p style={{ color: "#64748b", fontSize: 12, margin: "4px 0 0" }}>
                    {formatPrice(p.priceCents, p.currency)}
                    {p.stockQuantity !== null && ` · Stock: ${p.stockQuantity}`}
                  </p>
                  {p.description ? (
                    <p style={{ color: "#475569", fontSize: 13, margin: "8px 0 0", lineHeight: 1.4 }}>
                      {p.description}
                    </p>
                  ) : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button type="button" onClick={() => sub(p.id)} style={qBtn}>−</button>
                  <span style={{ minWidth: 24, textAlign: "center", fontWeight: 600 }}>
                    {cart[p.id] ?? 0}
                  </span>
                  <button
                    type="button"
                    onClick={() => add(p.id)}
                    disabled={p.stockQuantity !== null && (cart[p.id] ?? 0) >= p.stockQuantity}
                    style={qBtn}
                  >
                    +
                  </button>
                </div>
              </article>
            ))}
          </section>

          <aside
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 16,
              position: "sticky",
              top: 80,
              height: "fit-content",
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Tu pedido</h2>
            {lines.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
                Añade productos con el botón +.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px" }}>
                {lines.map((l) => {
                  const p = products.find((x) => x.id === l.productId);
                  if (!p) return null;
                  return (
                    <li
                      key={l.productId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        padding: "4px 0",
                      }}
                    >
                      <span>
                        {p.name} × {l.quantity}
                      </span>
                      <strong>{formatPrice(p.priceCents * l.quantity, p.currency)}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
            {lines.length > 0 && (
              <div
                style={{
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: 12,
                  marginTop: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Total</span>
                <span>{formatPrice(subtotalCents, currency)}</span>
              </div>
            )}
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={fieldInput}
              />
              <input
                type="text"
                placeholder="Nombre (opcional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={fieldInput}
              />
              <button
                type="button"
                onClick={checkout}
                disabled={submitting || lines.length === 0 || !email}
                style={{
                  padding: "10px",
                  background: "#0f172a",
                  color: "white",
                  border: 0,
                  borderRadius: 6,
                  cursor: submitting ? "wait" : "pointer",
                  fontWeight: 600,
                }}
              >
                {submitting ? "Procesando..." : "Ir a checkout"}
              </button>
            </div>
            {error && (
              <p style={{ color: "#dc2626", fontSize: 12, margin: "8px 0 0" }}>
                {error}
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

const qBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  border: "1px solid #cbd5e1",
  background: "white",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 700,
};

const fieldInput: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontFamily: "inherit",
};
