"use client";

type Entry = {
  id: string;
  action: string;
  module: string | null;
  resourceType: string | null;
  resourceId: string | null;
  description: string | null;
  status: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  "actor_page.publish": "Publicación",
  "actor_page.unpublish": "Despublicación",
  "marketplace.order.paid": "Orden pagada",
  "marketplace.notification.failed": "Notificación fallida",
  "marketplace.dispute.resolved": "Disputa resuelta",
  "marketplace.dispute.zaltyko_mediated": "Mediación Zaltyko",
};

/**
 * Timeline de auditoría: muestra los últimos 100 eventos del academy.
 * Útil para debug + transparency + GDPR.
 */
export function AuditTimeline({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return (
      <p style={{ color: "#64748b", padding: 24, textAlign: "center" }}>
        Sin eventos registrados aún.
      </p>
    );
  }

  return (
    <ol
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        maxWidth: 760,
      }}
    >
      {entries.map((e) => (
        <li
          key={e.id}
          style={{
            display: "flex",
            gap: 12,
            padding: "10px 12px",
            borderBottom: "1px solid #f1f5f9",
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 100,
              background:
                e.status === "success"
                  ? "#dcfce7"
                  : e.status === "failed"
                  ? "#fee2e2"
                  : "#dbeafe",
              color:
                e.status === "success"
                  ? "#166534"
                  : e.status === "failed"
                  ? "#991b1b"
                  : "#1e40af",
              flexShrink: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {e.status ?? "—"}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
              {ACTION_LABELS[e.action] ?? e.action}
            </p>
            {e.description && (
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                {e.description}
              </p>
            )}
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>
              {new Date(e.createdAt).toLocaleString("es-ES")}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
