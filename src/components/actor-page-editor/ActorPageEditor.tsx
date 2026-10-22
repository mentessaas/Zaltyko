"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

type ActorPage = {
  id: string;
  entityType: "academy" | "coach" | "athlete" | "supplier";
  entityId: string;
  publicSlug: string;
  publicVisible: boolean;
  publishedAt: string | null;
  displayName: string;
  tagline: string | null;
  bioBlocks: Array<Record<string, unknown>>;
  photoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  socialLinks: Record<string, string>;
  seoTitle: string | null;
  seoDescription: string | null;
  language: string;
};

import {
  BLOCKS_BY_TYPE,
  ENTITY_LABEL,
  type EntityType,
} from "@/lib/actor-pages/blocks-config";
import { ThemeSection } from "@/components/actor-page-editor/ThemeSection";
import { PhotoUpload } from "@/components/actor-page-editor/PhotoUpload";
import type { Theme } from "@/lib/actor-pages/theme";

type BlockDraft = Record<string, unknown> & { id?: string; type?: string };

function defaultBlocksFor(entityType: EntityType): BlockDraft[] {
  const defs = BLOCKS_BY_TYPE[entityType] ?? [];
  return defs.slice(0, 4).map((b) => ({ type: b.type, heading: b.heading, level: 2 }));
}

/**
 * Editor no-code de la página pública de un actor.
 * Sprint 2: reordenamiento + visibilidad + publicar/despublicar.
 * Sprint 4: genérico para los 4 tipos (academy, coach, athlete, supplier).
 */
export function ActorPageEditor({
  entityType,
  entityId,
  initialPage,
}: {
  entityType: EntityType;
  entityId: string;
  initialPage: ActorPage | null;
}) {
  const router = useRouter();
  const [page, setPage] = useState<ActorPage>(
    initialPage ?? {
      id: "",
      entityType,
      entityId,
      publicSlug: "",
      publicVisible: false,
      publishedAt: null,
      displayName: "",
      tagline: null,
      bioBlocks: defaultBlocksFor(entityType),
      photoUrl: null,
      contactEmail: null,
      contactPhone: null,
      socialLinks: {},
      seoTitle: null,
      seoDescription: null,
      language: "es",
    }
  );
  const [saving, startSaving] = useTransition();
  const [publishing, startPublishing] = useTransition();
  const [translating, startTranslating] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function update<K extends keyof ActorPage>(key: K, value: ActorPage[K]) {
    setPage((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    startSaving(async () => {
      const body = {
        displayName: page.displayName,
        tagline: page.tagline,
        bioBlocks: page.bioBlocks,
        photoUrl: page.photoUrl,
        contactEmail: page.contactEmail,
        contactPhone: page.contactPhone,
        socialLinks: page.socialLinks,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        language: page.language,
      };
      if (page.id) {
        await fetch(`/api/actor-pages/${page.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setSavedAt(new Date());
      router.refresh();
    });
  }

  async function togglePublish() {
    startPublishing(async () => {
      const action = page.publicVisible ? "unpublish" : "publish";
      const res = await fetch(`/api/actor-pages/${page.id}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        update("publicVisible", action === "publish");
        if (action === "publish") {
          update("publishedAt", new Date().toISOString());
        } else {
          update("publishedAt", null);
        }
        router.refresh();
      } else {
        const detail = await res.json().catch(() => ({}));
        alert(`No se pudo ${action}: ${detail.detail ?? res.statusText}`);
      }
    });
  }

  async function translate() {
    const target = page.language === "es" ? "en" : "es";
    startTranslating(async () => {
      try {
        const res = await fetch(`/api/actor-pages/${page.id}/translate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.blocks)) {
            update("bioBlocks", data.blocks);
          }
        } else {
          const d = await res.json().catch(() => ({}));
          alert(`Error: ${d.error ?? res.statusText}`);
        }
      } catch (e) {
        alert(`Error: ${e instanceof Error ? e.message : "unknown"}`);
      }
    });
  }

  function moveBlock(idx: number, delta: -1 | 1) {
    const next = [...page.bioBlocks];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    update("bioBlocks", next);
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Página pública — {ENTITY_LABEL[entityType]}
          </h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
            {page.publicSlug ? (
              <>
                <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>
                  zaltyko.com/{entityType === 'academy' ? 'a' : entityType === 'coach' ? 'c' : entityType === 'athlete' ? 'g' : 'p'}/{page.publicSlug}
                </code>
              </>
            ) : (
              <em>Sin slug todavía</em>
            )}
            {savedAt && (
              <span style={{ marginLeft: 12, color: "#16a34a" }}>
                ✓ Guardado {savedAt.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={save}
            disabled={saving || !page.displayName}
            style={{
              padding: "8px 14px",
              background: "#0f172a",
              color: "white",
              border: 0,
              borderRadius: 6,
              cursor: saving ? "wait" : "pointer",
              fontWeight: 600,
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            onClick={togglePublish}
            disabled={publishing || !page.id}
            style={{
              padding: "8px 14px",
              background: page.publicVisible ? "#dc2626" : "#16a34a",
              color: "white",
              border: 0,
              borderRadius: 6,
              cursor: publishing ? "wait" : "pointer",
              fontWeight: 600,
            }}
          >
            {publishing
              ? "Procesando..."
              : page.publicVisible
              ? "Despublicar"
              : "Publicar"}
          </button>
        </div>
      </header>

      <section style={fieldGroup}>
        <label style={label}>Nombre a mostrar</label>
        <input
          type="text"
          value={page.displayName}
          onChange={(e) => update("displayName", e.target.value)}
          style={inputStyle}
          maxLength={120}
        />
      </section>

      <section style={fieldGroup}>
        <label style={label}>Tagline (1 línea)</label>
        <input
          type="text"
          value={page.tagline ?? ""}
          onChange={(e) => update("tagline", e.target.value || null)}
          style={inputStyle}
          maxLength={160}
          placeholder="Academia de gimnasia en Madrid"
        />
      </section>

      <section style={fieldGroup}>
        <label style={label}>Email de contacto (público)</label>
        <input
          type="email"
          value={page.contactEmail ?? ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            update("contactEmail", e.target.value || null)
          }
          style={inputStyle}
          placeholder="info@academia.com"
        />
      </section>

      <section style={fieldGroup}>
        <label style={label}>Teléfono</label>
        <input
          type="tel"
          value={page.contactPhone ?? ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            update("contactPhone", e.target.value || null)
          }
          style={inputStyle}
        />
      </section>

      <section style={fieldGroup}>
        <label style={label}>URL de foto / logo</label>
        <input
          type="url"
          value={page.photoUrl ?? ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            update("photoUrl", e.target.value || null)
          }
          style={inputStyle}
          placeholder="https://..."
        />
        {page.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.photoUrl}
            alt="preview"
            style={{ width: 80, height: 80, borderRadius: 8, marginTop: 8, objectFit: "cover" }}
          />
        ) : null}
      </section>

      <section style={fieldGroup}>
        <label style={label}>Idioma de la página</label>
        <select
          value={page.language}
          onChange={(e) => update("language", e.target.value)}
          style={inputStyle}
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </section>

      <section style={fieldGroup}>
        <label style={label}>Bloques de contenido</label>
        <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 12px" }}>
          Reordena los bloques con las flechas. Sprint 3 permitirá editar el contenido de cada bloque.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {page.bioBlocks.map((b, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  background: "#0f172a",
                  color: "white",
                  borderRadius: 100,
                }}
              >
                {String(b.type ?? "block")}
              </span>
              <span style={{ flex: 1, fontSize: 14 }}>
                {typeof b.heading === "string" ? b.heading : String(b.type ?? "")}
              </span>
              <button
                type="button"
                onClick={() => moveBlock(i, -1)}
                disabled={i === 0}
                style={miniBtn}
                aria-label="Subir"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveBlock(i, 1)}
                disabled={i === page.bioBlocks.length - 1}
                style={miniBtn}
                aria-label="Bajar"
              >
                ↓
              </button>
            </div>
          ))}
        </div>
      </section>

      <ThemeSection theme={"light" as Theme} onChange={() => {}} />

      <section style={fieldGroup}>
        <label style={label}>SEO</label>
        <input
          type="text"
          placeholder="Título para Google"
          value={page.seoTitle ?? ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            update("seoTitle", e.target.value || null)
          }
          style={inputStyle}
        />
        <textarea
          placeholder="Descripción para Google (155-160 chars)"
          value={page.seoDescription ?? ""}
          onChange={(e) =>
            update("seoDescription", e.target.value || null)
          }
          style={{ ...inputStyle, minHeight: 60, marginTop: 8 }}
          maxLength={200}
        />
      </section>
    </div>
  );
}

const fieldGroup: React.CSSProperties = {
  marginBottom: 20,
  paddingBottom: 20,
  borderBottom: "1px solid #f1f5f9",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#0f172a",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontFamily: "inherit",
};

const miniBtn: React.CSSProperties = {
  padding: "4px 8px",
  border: "1px solid #cbd5e1",
  borderRadius: 4,
  background: "white",
  cursor: "pointer",
  fontSize: 12,
};

// =============================================================================
// THEMING: campos extra en el editor (Sprint 4)
// =============================================================================
// Añadir después de la sección SEO:

// Theme fields — añadir al state inicial:
//   theme: { primary_color: "#3b82f6", background: "light", font_family: "system", border_radius: "md" }

// (Patches al state arriba)
// Añadir UI en el render: <ThemeSection />
