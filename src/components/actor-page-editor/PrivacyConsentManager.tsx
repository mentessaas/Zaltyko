"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Item = {
  athleteId: string;
  athleteName: string;
  athleteDob: string | null;
  pageId: string;
  pageSlug: string | null;
  pageVisible: boolean;
  consentStatus: string;
  decision: {
    canPublish: boolean;
    reason: string;
    requiresGuardianConsent: boolean;
  };
  consents: Array<{
    id: string;
    consentScope: string;
    grantedAt: string;
    revokedAt: string | null;
    revokedReason: string | null;
  }>;
};

/**
 * Manager de consentimiento parental.
 * Sprint 3: granted/revoked con audit. Sprint 3.5 añadirá firma digital avanzada.
 */
export function PrivacyConsentManager({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function grant(item: Item) {
    startTransition(async () => {
      const res = await fetch("/api/actor-consents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actorPageId: item.pageId,
          guardianRelationship: "parent",
          consentScope: "public_page",
        }),
      });
      if (res.ok) {
        setMsg({ type: "ok", text: `Consentimiento firmado para ${item.athleteName}.` });
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: `Error: ${d.error ?? res.statusText}` });
      }
    });
  }

  function revoke(item: Item) {
    if (!confirm(`¿Retirar el consentimiento de publicar la página de ${item.athleteName}? La página será despublicada inmediatamente.`)) {
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/actor-consents", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actorPageId: item.pageId,
          reason: "guardian_request",
        }),
      });
      if (res.ok) {
        setMsg({ type: "ok", text: `Consentimiento retirado para ${item.athleteName}. La página se ha despublicado.` });
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: `Error: ${d.error ?? res.statusText}` });
      }
    });
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
        Privacidad y consentimiento
      </h1>
      <p style={{ color: "#475569", fontSize: 14, marginBottom: 24 }}>
        Gestiona aquí si la página pública de cada atleta puede estar visible.
        Solo publicamos datos profesionales (deportes, niveles, achievements). Nunca
        publicamos emails, teléfonos ni datos médicos.
      </p>

      {msg && (
        <div
          role="status"
          style={{
            padding: "10px 14px",
            background: msg.type === "ok" ? "#dcfce7" : "#fee2e2",
            color: msg.type === "ok" ? "#166534" : "#991b1b",
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {msg.text}
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ color: "#64748b", fontStyle: "italic" }}>
          No tienes atletas con página pública activa en esta academia.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item) => {
            const active = item.consents.find(
              (c) => !c.revokedAt && c.consentScope === "public_page"
            );
            const age = item.athleteDob
              ? Math.floor(
                  (Date.now() - new Date(item.athleteDob).getTime()) /
                    (365.25 * 24 * 3600 * 1000)
                )
              : null;
            const blockedUnder13 = age !== null && age < 13;
            return (
              <article
                key={item.athleteId}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: 16,
                  background: "white",
                }}
              >
                <header
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                      {item.athleteName}
                    </h2>
                    <p style={{ color: "#64748b", fontSize: 13, margin: "2px 0 0" }}>
                      {age !== null ? `${age} años` : "Sin fecha de nacimiento"}
                      {item.pageSlug && (
                        <>
                          {" · "}
                          <code
                            style={{
                              background: "#f1f5f9",
                              padding: "1px 6px",
                              borderRadius: 3,
                            }}
                          >
                            zaltyko.com/g/{item.pageSlug}
                          </code>
                        </>
                      )}
                    </p>
                  </div>
                  <StatusBadge
                    visible={item.pageVisible}
                    blocked={blockedUnder13}
                    hasConsent={Boolean(active)}
                  />
                </header>

                {blockedUnder13 ? (
                  <p
                    style={{
                      background: "#fef3c7",
                      color: "#92400e",
                      padding: "8px 12px",
                      borderRadius: 6,
                      fontSize: 13,
                      margin: 0,
                    }}
                  >
                    Por política de Zaltyko, los atletas menores de 13 años no
                    pueden tener página pública. Esto se aplica automáticamente.
                  </p>
                ) : active ? (
                  <ConsentGranted
                    grantedAt={active.grantedAt}
                    onRevoke={() => revoke(item)}
                    disabled={busy}
                  />
                ) : (
                  <ConsentRequired
                    decision={item.decision}
                    onGrant={() => grant(item)}
                    disabled={busy}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  visible,
  blocked,
  hasConsent,
}: {
  visible: boolean;
  blocked: boolean;
  hasConsent: boolean;
}) {
  let bg = "#f1f5f9";
  let color = "#475569";
  let text = "Borrador";
  if (blocked) {
    bg = "#fee2e2";
    color = "#991b1b";
    text = "Bloqueado";
  } else if (visible && hasConsent) {
    bg = "#dcfce7";
    color = "#166534";
    text = "Pública";
  } else if (!hasConsent) {
    bg = "#fef3c7";
    color = "#92400e";
    text = "Requiere consentimiento";
  }
  return (
    <span
      style={{
        padding: "3px 10px",
        background: bg,
        color,
        borderRadius: 100,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  );
}

function ConsentGranted({
  grantedAt,
  onRevoke,
  disabled,
}: {
  grantedAt: string;
  onRevoke: () => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        background: "#f0fdf4",
        padding: "12px 14px",
        borderRadius: 6,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 13, color: "#166534" }}>
        ✓ Consentimiento firmado el{" "}
        <strong>{new Date(grantedAt).toLocaleDateString()}</strong>
      </div>
      <button
        type="button"
        onClick={onRevoke}
        disabled={disabled}
        style={{
          padding: "6px 12px",
          background: "white",
          color: "#dc2626",
          border: "1px solid #fecaca",
          borderRadius: 4,
          cursor: disabled ? "wait" : "pointer",
          fontSize: 13,
        }}
      >
        Retirar consentimiento
      </button>
    </div>
  );
}

function ConsentRequired({
  decision,
  onGrant,
  disabled,
}: {
  decision: { reason: string; requiresGuardianConsent: boolean };
  onGrant: () => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        background: "#fef3c7",
        padding: "12px 14px",
        borderRadius: 6,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 13, color: "#92400e" }}>
        Se requiere tu consentimiento para publicar esta página.
        <br />
        <span style={{ fontSize: 11, color: "#a16207" }}>
          {decision.reason}
        </span>
      </div>
      <button
        type="button"
        onClick={onGrant}
        disabled={disabled}
        style={{
          padding: "8px 14px",
          background: "#16a34a",
          color: "white",
          border: 0,
          borderRadius: 4,
          cursor: disabled ? "wait" : "pointer",
          fontWeight: 600,
        }}
      >
        Firmar consentimiento
      </button>
    </div>
  );
}
