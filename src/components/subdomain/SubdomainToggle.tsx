"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Toggle para activar/desactivar el subdominio [slug].zaltyko.com.
 * El cambio se aplica al instante. El middleware detecta y reescribe.
 */
export function SubdomainToggle({
  academyId,
  academyName,
  slug,
  currentEnabled,
  canonicalWithSub,
  canonicalWithoutSub,
}: {
  academyId: string;
  academyName: string;
  slug: string;
  currentEnabled: boolean;
  canonicalWithSub: string;
  canonicalWithoutSub: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(currentEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !enabled;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/academy/subdomain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ academyId, enabled: next }),
        });
        if (res.ok) {
          setEnabled(next);
          router.refresh();
        } else {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? res.statusText);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error inesperado");
      }
    });
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Subdominio personalizado
        </h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
          {academyName} · slug actual: <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{slug}</code>
        </p>
      </header>

      <section
        style={{
          padding: 20,
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              Activar <code>{slug}.zaltyko.com</code>
            </h2>
            <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0", lineHeight: 1.4 }}>
              Disponible en plan Network. Tu academia obtendrá una URL propia
              con SEO consolidado.
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={enabled}
            style={{
              width: 56,
              height: 32,
              borderRadius: 100,
              background: enabled ? "#16a34a" : "#cbd5e1",
              border: 0,
              cursor: pending ? "wait" : "pointer",
              position: "relative",
              transition: "background .15s",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 4,
                left: enabled ? 28 : 4,
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "white",
                transition: "left .15s",
                boxShadow: "0 1px 3px rgba(0,0,0,.2)",
              }}
            />
          </button>
        </div>
        {error && (
          <p style={{ color: "#dc2626", fontSize: 13, marginTop: 12 }}>
            {error}
          </p>
        )}
      </section>

      <section
        style={{
          padding: 16,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px", textTransform: "uppercase", color: "#475569" }}>
          URL canónica actual
        </h3>
        <p style={{ margin: "4px 0", fontFamily: "monospace", color: enabled ? "#16a34a" : "#475569" }}>
          {enabled ? canonicalWithSub : canonicalWithoutSub}
        </p>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 8, lineHeight: 1.4 }}>
          Zaltyko usa un certificado TLS wildcard para <code>*.zaltyko.com</code>.
          Para activar subdominios en producción necesitas el DNS wildcard
          apuntando a la IP del servidor (Vercel lo gestiona automáticamente).
        </p>
      </section>

      <p style={{ marginTop: 16 }}>
        <a
          href={`/app/${academyId}/settings`}
          style={{ color: "#64748b", fontSize: 13 }}
        >
          ← Volver a ajustes
        </a>
      </p>
    </div>
  );
}
