import Link from "next/link";

export default function StoreCancelPage({
  params,
}: {
  params: { slug: string };
}) {
  return (
    <div style={{ maxWidth: 560, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
        Pago cancelado
      </h1>
      <p style={{ color: "#475569", marginBottom: 24, lineHeight: 1.5 }}>
        No se ha realizado ningún cargo. Puedes volver a la tienda cuando quieras.
      </p>
      <Link
        href={`/a/${params.slug}/tienda`}
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
        Volver a la tienda
      </Link>
    </div>
  );
}
