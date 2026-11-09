import Link from "next/link";

export default async function MarketplaceSuccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div style={{ maxWidth: 560, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
        ¡Compra confirmada!
      </h1>
      <p style={{ color: "#3E4A66", marginBottom: 24, lineHeight: 1.5 }}>
        Tu pago se ha procesado. El vendedor ha sido notificado y se pondrá en
        contacto contigo para coordinar la entrega.
      </p>
      <p style={{ color: "#8A93A8", fontSize: 13, marginBottom: 24 }}>
        Pedido: {id.slice(0, 8)}
      </p>
      <Link
        href="/marketplace"
        style={{
          display: "inline-block",
          padding: "10px 16px",
          background: "#0B1430",
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
