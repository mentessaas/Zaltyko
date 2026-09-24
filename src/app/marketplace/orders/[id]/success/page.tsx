import Link from "next/link";

export default function MarketplaceSuccessPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div style={{ maxWidth: 560, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
        ¡Compra confirmada!
      </h1>
      <p style={{ color: "#475569", marginBottom: 24, lineHeight: 1.5 }}>
        Tu pago se ha procesado. El vendedor ha sido notificado y se pondrá en
        contacto contigo para coordinar la entrega.
      </p>
      <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 24 }}>
        Pedido: {params.id.slice(0, 8)}
      </p>
      <Link
        href="/marketplace"
        style={{
          display: "inline-block",
          padding: "10px 16px",
          background: "#0f172a",
          color: "white",
          borderRadius: 6,
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Volver al marketplace
      </Link>
    </div>
  );
}
