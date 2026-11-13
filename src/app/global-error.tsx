"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Global error:", error);
  }, [error]);

  // Sustituye al layout raíz, así que no hay Tailwind ni la fuente cargada:
  // estilos en línea con valores de las escalas del mundo («Magnesio sobre
  // tapiz») y la pila Archivo/sistema, sin dependencias externas.
  return (
    <html lang="es">
      <head>
        <style>{`
          body {
            margin: 0;
            font-family: Archivo, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
            background: #F4F6F2;
            color: #0B1430;
          }
          .zaltyko-global-error-retry { background: #1E3FA8; }
          .zaltyko-global-error-retry:hover { background: #14307F; }
          .zaltyko-global-error-retry:focus-visible { outline: 2px solid #1E3FA8; outline-offset: 2px; }
        `}</style>
      </head>
      <body>
        <header style={{ background: "#14307F", height: "4rem", display: "flex", alignItems: "center", padding: "0 1.25rem" }}>
          <span style={{ color: "#FFFFFF", fontWeight: 900, fontStretch: "72%", letterSpacing: "0.02em", fontSize: "1.125rem" }}>
            ZALTYKO
          </span>
        </header>
        <main style={{ display: "flex", minHeight: "calc(100vh - 4rem)", alignItems: "center", justifyContent: "center", padding: "2.5rem 1.5rem", boxSizing: "border-box" }}>
          <div style={{ maxWidth: "36rem", width: "100%" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(2.25rem, 5vw, 4rem)", fontWeight: 900, fontStretch: "72%", lineHeight: 0.92, textTransform: "uppercase" }}>
              Error crítico
            </h1>
            <p style={{ margin: "1.5rem 0 0", paddingTop: "1.25rem", borderTop: "3px solid #0B1430", color: "#3E4A66", lineHeight: 1.75 }}>
              Ha ocurrido un error crítico en la aplicación. Por favor, recarga la página.
            </p>
            <button
              type="button"
              onClick={reset}
              className="zaltyko-global-error-retry"
              style={{
                marginTop: "2rem",
                minHeight: "44px",
                borderRadius: "8px",
                color: "#FFFFFF",
                padding: "0.625rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                fontFamily: "inherit",
                border: "none",
                boxShadow: "0 1px 0 rgba(11,20,48,0.25)",
                cursor: "pointer",
              }}
            >
              Recargar
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
