"use client";

import { useEffect, useState } from "react";

type DisputeRow = {
  dispute: {
    id: string;
    orderId: string;
    raisedByAcademyId: string;
    reason: string;
    description: string;
    status: string;
    resolutionNotes: string | null;
    resolvedAt: string | null;
    createdAt: string;
  };
  order: {
    id: string;
    sellerAcademyId: string;
    buyerAcademyId: string;
    totalCents: number;
    currency: string;
    quantity: number;
  };
  sellerAcademy: { id: string; name: string };
};

const STATUS_LABELS: Record<string, string> = {
  open: "Abierta",
  investigating: "Investigando",
  resolved_buyer: "Resuelta (buyer)",
  resolved_seller: "Resuelta (seller)",
  partial_refund: "Refund parcial",
  withdrawn: "Retirada",
};

const REASON_LABELS: Record<string, string> = {
  not_received: "No recibido",
  damaged: "Dañado",
  not_as_described: "No como descrito",
  wrong_item: "Producto equivocado",
  other: "Otro",
};

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(
    cents / 100
  );
}

/**
 * Dashboard de disputas para Zaltyko (super_admin).
 * Lista todas las disputas activas con metadata y permite mediar.
 */
export function DisputesDashboard() {
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("open");

  useEffect(() => {
    void load();
  }, [filter]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/disputes?status=${filter}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }

  async function mediate(disputeId: string, notes: string) {
    const res = await fetch(`/api/marketplace/disputes/${disputeId}/mediate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    if (res.ok) await load();
    else {
      const d = await res.json().catch(() => ({}));
      alert(`Error: ${d.error ?? res.statusText}`);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            Marketplace — Disputes
          </h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
            Zaltyko super-admin dashboard. Mediación de conflictos entre academias.
          </p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["open", "investigating", "resolved_buyer", "resolved_seller", ""].map(
            (s) => (
              <button
                key={s || "all"}
                type="button"
                onClick={() => setFilter(s)}
                style={{
                  padding: "6px 12px",
                  background: filter === s ? "#0f172a" : "white",
                  color: filter === s ? "white" : "#475569",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {s ? STATUS_LABELS[s] ?? s : "Todas"}
              </button>
            )
          )}
        </div>
      </header>

      {loading ? (
        <p style={{ color: "#64748b" }}>Cargando…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#64748b" }}>Sin disputes {filter ? `en estado "${STATUS_LABELS[filter]}"` : ""}.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <article
              key={r.dispute.id}
              style={{
                padding: 16,
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
                    {REASON_LABELS[r.dispute.reason] ?? r.dispute.reason} · Order {r.order.id.slice(0, 8)}
                  </h3>
                  <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 8px" }}>
                    {r.dispute.description}
                  </p>
                  <p style={{ color: "#94a3b8", fontSize: 11, margin: 0 }}>
                    {r.sellerAcademy.name} · {formatPrice(r.order.totalCents, r.order.currency)} ·{" "}
                    {new Date(r.dispute.createdAt).toLocaleDateString("es-ES")}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      background:
                        r.dispute.status === "open" ? "#fee2e2" : "#dbeafe",
                      color:
                        r.dispute.status === "open" ? "#991b1b" : "#1e40af",
                      borderRadius: 100,
                      fontSize: 11,
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    {STATUS_LABELS[r.dispute.status] ?? r.dispute.status}
                  </span>
                  {r.dispute.status === "open" && (
                    <button
                      type="button"
                      onClick={() => {
                        const notes = prompt("Notas de mediación:");
                        if (notes) mediate(r.dispute.id, notes);
                      }}
                      style={{
                        display: "block",
                        padding: "6px 12px",
                        background: "#0f172a",
                        color: "white",
                        border: 0,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Mediar
                    </button>
                  )}
                </div>
              </div>
              {r.dispute.resolutionNotes && (
                <p
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: "1px solid #f1f5f9",
                    fontSize: 12,
                    color: "#475569",
                  }}
                >
                  Resolución: {r.dispute.resolutionNotes}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
