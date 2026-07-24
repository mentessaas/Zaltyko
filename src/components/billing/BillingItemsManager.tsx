"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";
import { logger } from "@/lib/logger";

export interface BillingItem {
  id: string;
  name: string;
  description: string | null;
  amountCents: number;
  currency: string;
  periodicity: "one_time" | "monthly" | "yearly";
  isActive: boolean;
}

interface BillingItemsManagerProps {
  academyId: string;
}

const PERIODICITY_LABELS: Record<BillingItem["periodicity"], string> = {
  one_time: "Pago único",
  monthly: "Mensual",
  yearly: "Anual",
};

const EMPTY_FORM = {
  name: "",
  description: "",
  amountEuros: "",
  periodicity: "monthly" as BillingItem["periodicity"],
  isActive: true,
};

function formatAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency || "EUR" }).format(
    amountCents / 100
  );
}

export function BillingItemsManager({ academyId }: BillingItemsManagerProps) {
  const { pushToast } = useToast();
  const [items, setItems] = useState<BillingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BillingItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BillingItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/billing-items?academyId=${academyId}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("No se pudieron cargar los conceptos de cobro.");
      // La API responde con apiSuccess -> { ok, data: { items } }.
      const payload = await response.json();
      const list = payload?.data?.items ?? payload?.items ?? [];
      setItems(list);
    } catch (err) {
      logger.error("Error loading billing items:", err);
      setError(err instanceof Error ? err.message : "Error al cargar los conceptos de cobro.");
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (item: BillingItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? "",
      amountEuros: (item.amountCents / 100).toFixed(2),
      periodicity: item.periodicity,
      isActive: item.isActive,
    });
    setError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setError(null);

    if (!form.name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }

    const parsed = parseFloat(form.amountEuros.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) {
      setError("El importe debe ser mayor que 0.");
      return;
    }
    const amountCents = Math.round(parsed * 100);

    setSaving(true);
    try {
      const isEdit = Boolean(editing);
      const response = await fetch(
        isEdit ? `/api/billing-items/${editing!.id}` : "/api/billing-items",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", "x-academy-id": academyId },
          body: JSON.stringify({
            ...(isEdit ? {} : { academyId }),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            amountCents,
            periodicity: form.periodicity,
            isActive: form.isActive,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? "No se pudo guardar el concepto de cobro.");
      }

      setDialogOpen(false);
      await loadItems();
      pushToast({
        title: isEdit ? "Concepto actualizado" : "Concepto creado",
        description: "Los cambios se han guardado correctamente.",
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      setError(message);
      pushToast({ title: "No se pudo guardar", description: message, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/billing-items/${pendingDelete.id}`, {
        method: "DELETE",
        headers: { "x-academy-id": academyId },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? "No se pudo eliminar el concepto de cobro.");
      }

      setPendingDelete(null);
      await loadItems();
      pushToast({
        title: "Concepto eliminado",
        description: "El concepto de cobro se eliminó correctamente.",
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      pushToast({ title: "No se pudo eliminar", description: message, variant: "error" });
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Conceptos de cobro</h2>
          <p className="text-sm text-muted-foreground">
            Define los conceptos reutilizables (matrícula, cuota, equipación…) que luego puedes
            asignar al crear cargos.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo concepto
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando conceptos…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
          Todavía no hay conceptos de cobro. Crea el primero para poder reutilizarlo en los cargos.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/40 p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{item.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {PERIODICITY_LABELS[item.periodicity]}
                  </span>
                  {!item.isActive && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Inactivo
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="mt-1 truncate text-sm text-muted-foreground">{item.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-foreground">
                  {formatAmount(item.amountCents, item.currency)}
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(item)}
                  className="text-sm font-semibold text-red-600 hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "Editar concepto de cobro" : "Nuevo concepto de cobro"}
        description="Los conceptos se reutilizan al crear cargos a las gimnastas."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Nombre *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej. Matrícula anual"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Importe (€) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amountEuros}
                onChange={(e) => setForm((f) => ({ ...f, amountEuros: e.target.value }))}
                placeholder="Ej: 50.00"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Periodicidad</label>
              <select
                value={form.periodicity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, periodicity: e.target.value as BillingItem["periodicity"] }))
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="one_time">Pago único</option>
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span>Activo (aparece al crear cargos)</span>
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Eliminar concepto de cobro"
        description={`¿Seguro que quieres eliminar "${pendingDelete?.name ?? ""}"? Los cargos ya emitidos conservan su importe, pero dejarán de estar vinculados a este concepto.`}
        variant="destructive"
        confirmText="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
        loading={deleting}
      />
    </section>
  );
}
