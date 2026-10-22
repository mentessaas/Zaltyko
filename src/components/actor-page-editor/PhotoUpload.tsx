"use client";

import { useState, useTransition } from "react";

/**
 * Componente de upload de foto/logo para actor_page.
 * Llama a `POST /api/actor-pages/[id]/photo` con multipart/form-data.
 */
export function PhotoUpload({
  actorPageId,
  currentUrl,
  onUploaded,
}: {
  actorPageId: string;
  currentUrl: string | null;
  onUploaded: (newUrl: string) => void;
}) {
  const [uploading, startUploading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    startUploading(async () => {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(`/api/actor-pages/${actorPageId}/photo`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          onUploaded(data.url);
        } else {
          const d = await res.json().catch(() => ({}));
          setError(d.detail ?? d.error ?? res.statusText);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado");
      }
    });
  }

  return (
    <div>
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentUrl}
          alt="Foto actual"
          style={{
            width: 80,
            height: 80,
            borderRadius: 8,
            objectFit: "cover",
            background: "#f1f5f9",
            marginBottom: 6,
          }}
        />
      ) : (
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 8,
            background: "#f1f5f9",
            marginBottom: 6,
            display: "grid",
            placeItems: "center",
            color: "#94a3b8",
            fontSize: 11,
          }}
        >
          sin foto
        </div>
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
        style={{ display: "block", fontSize: 12 }}
      />
      {uploading && <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>Subiendo…</p>}
      {error && <p style={{ fontSize: 11, color: "#dc2626", margin: "4px 0 0" }}>{error}</p>}
    </div>
  );
}
