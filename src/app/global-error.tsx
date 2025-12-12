"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <head>
        <style>{`
          body {
            margin: 0;
            font-family: system-ui, -apple-system, sans-serif;
            background: #f9fafb;
          }
        `}</style>
      </head>
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ maxWidth: "28rem", width: "100%", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>Error crítico</h1>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              Ha ocurrido un error crítico en la aplicación. Por favor, recarga la página.
            </p>
            <button
              onClick={reset}
              style={{
                borderRadius: "0.375rem",
                backgroundColor: "#2563eb",
                color: "white",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                border: "none",
                cursor: "pointer",
              }}
            >
              Recargar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

