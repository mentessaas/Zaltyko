"use client";

import { useEffect, useState } from "react";

type Counts = {
  academies: number;
  actor_pages: number;
  listings: number;
  sales: number;
  orders: number;
  disputes: number;
  ratings: number;
};

type Last30 = {
  sales_cents: number;
  orders_cents: number;
  sales_count: number;
  orders_count: number;
};

type Analytics = { counts: Counts; last_30d: Last30 };

function formatEUR(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/analytics");
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <p style={{ color: "#64748b", padding: 24 }}>Cargando analytics…</p>;
  }
  if (!data) {
    return <p style={{ color: "#dc2626", padding: 24 }}>Error cargando analytics</p>;
  }

  const c = data.counts;
  const last = data.last_30d;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Analytics — Zaltyko</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
          Vista global del SaaS. Solo super-admin.
        </p>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#475569", textTransform: "uppercase" }}>
          Conteos globales
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          <Card label="Academias" value={c.academies} />
          <Card label="Páginas públicas" value={c.actor_pages} />
          <Card label="Listings activos" value={c.listings} />
          <Card label="Ventas tienda" value={c.sales} />
          <Card label="Órdenes marketplace" value={c.orders} />
          <Card label="Disputes abiertos" value={c.disputes} highlight={c.disputes > 0} />
          <Card label="Ratings totales" value={c.ratings} />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#475569", textTransform: "uppercase" }}>
          Últimos 30 días
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          <Card label="GMV tienda" value={formatEUR(last.sales_cents)} wide />
          <Card label="GMV marketplace" value={formatEUR(last.orders_cents)} wide />
          <Card label="N° ventas tienda" value={last.sales_count} wide />
          <Card label="N° órdenes marketplace" value={last.orders_count} wide />
        </div>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  highlight,
  wide,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      style={{
        padding: 16,
        background: highlight ? "#fef3c7" : "white",
        border: `1px solid ${highlight ? "#fcd34d" : "#e2e8f0"}`,
        borderRadius: 8,
      }}
    >
      <p style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: wide ? 22 : 24, fontWeight: 700, color: "#0f172a", margin: "6px 0 0" }}>
        {value}
      </p>
    </div>
  );
}
