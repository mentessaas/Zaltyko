"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Clock, UserPlus, AlertCircle } from "lucide-react";

interface WaitingListItem {
  id: string;
  athleteId: string;
  athleteName: string;
  position: number;
  addedAt: string;
  notes?: string;
}

interface WaitingListDialogProps {
  classId: string;
  className: string;
  open: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function WaitingListDialog({
  classId,
  className,
  open,
  onClose,
  onRefresh,
}: WaitingListDialogProps) {
  const [items, setItems] = useState<WaitingListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchWaitingList = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (user?.id) {
      }

      // Obtener lista de espera desde la API de reportes
      const response = await fetch(`/api/reports/class?classId=${classId}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error("Error al cargar la lista de espera");
      }

      const data = await response.json();

      // Por ahora, la lista de espera se maneja localmente
      // Este es un placeholder hasta implementar el endpoint completo
      setItems([]);
    } catch (err: any) {
      console.error("Error fetching waiting list:", err);
      setError(err.message ?? "Error al cargar la lista de espera");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchWaitingList();
    }
  }, [open, classId]);

  const handleRemoveFromList = async (item: WaitingListItem) => {
    if (!confirm("¿Quieres quitar a esta persona de la lista de espera?")) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/class-waiting-list/${item.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          throw new Error("Error al quitar de la lista");
        }

        setItems((prev) => prev.filter((i) => i.id !== item.id));
        onRefresh?.();
      } catch (err: any) {
        setError(err.message ?? "Error al quitar de la lista");
      }
    });
  };

  const handlePromote = async (item: WaitingListItem) => {
    startTransition(async () => {
      try {
        // Primero inscribir al atleta
        const response = await fetch("/api/class-enrollments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classId,
            athleteId: item.athleteId,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error ?? "Error al inscribir");
        }

        // Luego quitar de la lista de espera
        await fetch(`/api/class-waiting-list/${item.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        });

        setItems((prev) => prev.filter((i) => i.id !== item.id));
        onRefresh?.();
      } catch (err: any) {
        setError(err.message ?? "Error al promover");
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lista de espera"
      description={`Personas esperando espacio en "${className}"`}
      widthClassName="max-w-lg"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mr-2 inline h-4 w-4" />
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 py-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              No hay personas en la lista de espera
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    {item.position}
                  </div>
                  <div>
                    <p className="font-medium">{item.athleteName}</p>
                    <p className="text-xs text-muted-foreground">
                      Agregado el {new Date(item.addedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePromote(item)}
                    disabled={isPending}
                    className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                  >
                    <UserPlus className="mr-1 inline h-3 w-3" />
                    Inscribir
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveFromList(item)}
                    disabled={isPending}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
