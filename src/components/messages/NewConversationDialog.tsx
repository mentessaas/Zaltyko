"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

interface Recipient {
  profileId: string;
  name: string;
  photoUrl: string | null;
  group: "staff" | "family";
  subtitle: string;
}

interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
  academyId: string;
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ open, onClose, academyId, onCreated }: NewConversationDialogProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedId(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/messages/recipients?academyId=${academyId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) {
          setRecipients(data.data?.items ?? []);
        } else {
          setError(data.message ?? "No se pudieron cargar los destinatarios.");
        }
      })
      .catch((err) => {
        logger.error("Error fetching recipients:", err);
        if (!cancelled) setError("No se pudieron cargar los destinatarios.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, academyId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return recipients;
    return recipients.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.subtitle.toLowerCase().includes(needle)
    );
  }, [recipients, query]);

  const staffResults = filtered.filter((r) => r.group === "staff");
  const familyResults = filtered.filter((r) => r.group === "family");

  const handleClose = () => {
    if (isCreating) return;
    onClose();
  };

  const handleCreate = async () => {
    if (!selectedId) return;
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: [selectedId],
          academyId,
          metadata: { type: "p2p", context: "general" },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? "No se pudo iniciar la conversación.");
      }
      onCreated(data.data.id ?? data.data.conversationId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido al iniciar la conversación.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nueva conversación"
      description="Busca a un compañero o a una familia para empezar a hablar."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleCreate} disabled={!selectedId || isCreating}>
            {isCreating ? "Creando…" : "Iniciar conversación"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando destinatarios…</p>
        ) : recipients.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay compañeros o familias disponibles todavía.
          </p>
        ) : (
          <div className="max-h-72 space-y-4 overflow-y-auto">
            {staffResults.length > 0 && (
              <RecipientGroup title="Equipo" items={staffResults} selectedId={selectedId} onSelect={setSelectedId} />
            )}
            {familyResults.length > 0 && (
              <RecipientGroup title="Familias" items={familyResults} selectedId={selectedId} onSelect={setSelectedId} />
            )}
            {staffResults.length === 0 && familyResults.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados para "{query}".</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function RecipientGroup({
  title,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  items: Recipient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => {
          const isSelected = item.profileId === selectedId;
          return (
            <li key={item.profileId}>
              <button
                type="button"
                onClick={() => onSelect(item.profileId)}
                className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  isSelected ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  {item.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
