import Link from "next/link";

export default async function StoreSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sale?: string }>;
}) {
  const [{ slug }, { sale }] = await Promise.all([params, searchParams]);
  return (
    <div style={{ maxWidth: 560, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
        ¡Gracias por tu compra!
      </h1>
      <p style={{ color: "#3E4A66", marginBottom: 24, lineHeight: 1.5 }}>
        Tu pago se ha procesado correctamente. La academia te contactará para
        coordinar la entrega.
      </p>
      {sale && (
        <p style={{ color: "#8A93A8", fontSize: 13, marginBottom: 24 }}>
          Referencia: {sale.slice(0, 8)}
        </p>
      )}
      <Link
        href={`/a/${slug}`}
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
        Volver a la academia
      </Link>
    </div>
  );
}
