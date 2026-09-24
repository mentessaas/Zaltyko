"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Listing = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  condition: string;
  quantityAvailable: number;
  quantitySold: number;
  imagesUrls: string[];
  zaltykoCommissionCents: number;
};

type Seller = {
  id: string;
  name: string;
  publicSlug: string;
  city: string | null;
};

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

export function ListingDetail({
  listing,
  seller,
}: {
  listing: Listing;
  seller: Seller;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [buyerAcademySlug, setBuyerAcademySlug] = useState("");
  const [submitting, startSubmitting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remaining = listing.quantityAvailable - listing.quantitySold;
  const totalCents = listing.priceCents * quantity;
  const commission = listing.zaltykoCommissionCents * quantity;
  const net = totalCents - commission;

  async function buy() {
    setError(null);
    if (!buyerAcademySlug) {
      setError("Introduce el slug de la academia compradora.");
      return;
    }
    if (quantity < 1 || quantity > remaining) {
      setError(`Cantidad debe estar entre 1 y ${remaining}.`);
      return;
    }
    startSubmitting(async () => {
      try {
        const res = await fetch("/api/marketplace/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId: listing.id,
            quantity,
            buyerAcademySlug,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(data?.message ?? "No se pudo iniciar la compra.");
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de red.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{listing.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Vendido por{" "}
              <a
                href={`/marketplace/${seller.publicSlug}`}
                className="font-medium text-zaltyko-teal hover:underline"
              >
                {seller.name}
              </a>
              {seller.city && ` · ${seller.city}`}
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {listing.condition === "new" ? "Nuevo" : "Reacondicionado"}
          </span>
        </div>

        {listing.imagesUrls.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {listing.imagesUrls.slice(0, 4).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt={`${listing.title} - imagen ${i + 1}`}
                className="h-48 w-full rounded-xl object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {listing.description && (
          <p className="mt-4 text-base leading-relaxed text-foreground whitespace-pre-wrap">
            {listing.description}
          </p>
        )}

        <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Detalles</h2>
          <div className="grid gap-2 text-sm">
            <Row label="Precio unitario" value={formatPrice(listing.priceCents, listing.currency)} />
            <Row label="Unidades disponibles" value={String(remaining)} />
            <Row
              label="Comisión Zaltyko"
              value={formatPrice(listing.zaltykoCommissionCents, listing.currency)}
              muted
            />
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">Comprar</h2>
          <div className="grid gap-3">
            <div>
              <label style={fieldLabel}>Cantidad</label>
              <input
                type="number"
                min={1}
                max={remaining}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                style={fieldInput}
              />
            </div>
            <div>
              <label style={{ ...fieldLabel, marginTop: 14 }}>
                Slug de la academia compradora
              </label>
              <input
                type="text"
                value={buyerAcademySlug}
                onChange={(e) => setBuyerAcademySlug(e.target.value)}
                placeholder="academia-ejemplo"
                style={fieldInput}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-4 text-sm">
              <Row label="Total" value={formatPrice(totalCents, listing.currency)} />
              <Row label="Comisión Zaltyko" value={formatPrice(commission, listing.currency)} muted />
              <Row label="Neto vendedor" value={formatPrice(net, listing.currency)} />
            </div>
            <button
              type="button"
              onClick={buy}
              disabled={submitting || remaining < 1}
              className="mt-2 inline-flex items-center justify-center rounded-full bg-zaltyko-teal px-6 py-3 text-sm font-semibold text-white hover:bg-zaltyko-primary-dark disabled:opacity-50"
            >
              {submitting ? "Procesando…" : remaining < 1 ? "Sin stock" : "Comprar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        color: muted ? "#94a3b8" : "#0f172a",
        fontSize: muted ? 12 : 14,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#0f172a",
  marginBottom: 4,
};
const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontFamily: "inherit",
};
