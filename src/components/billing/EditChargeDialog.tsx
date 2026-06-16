"use client";

import { FormEvent, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface Charge {
  id: string;
  status: "pending" | "paid" | "overdue" | "cancelled" | "partial";
  paymentMethod: string | null;
  notes: string | null;
  label: string;
  amountCents: number;
  dueDate: string | null;
}

interface EditChargeDialogProps {
  charge: Charge;
  academyId: string;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditChargeDialog({
  charge,
  academyId,
  open,
  onClose,
  onUpdated,
}: EditChargeDialogProps) {
  const [status, setStatus] = useState(charge.status);
  const [paymentMethod, setPaymentMethod] = useState(charge.paymentMethod || "");
  const [notes, setNotes] = useState(charge.notes || "");
  const [label, setLabel] = useState(charge.label);
  const [amountEuros, setAmountEuros] = useState(""); // UI en euros (se convierte a céntimos al guardar)
  const [dueDate, setDueDate] = useState(
    charge.dueDate ? new Date(charge.dueDate).toISOString().split("T")[0] : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatus(charge.status);
      setPaymentMethod(charge.paymentMethod || "");
      setNotes(charge.notes || "");
      setLabel(charge.label);
      // Convertir céntimos a euros para mostrar en UI
      setAmountEuros((charge.amountCents / 100).toFixed(2));
      setDueDate(charge.dueDate ? new Date(charge.dueDate).toISOString().split("T")[0] : "");
      setError(null);
    }
  }, [open, charge]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // MEJORA UX: Convertir euros a céntimos para guardar en DB
      // El usuario introduce el importe en euros (ej: 50.00) y se convierte a céntimos (5000)
      const amountEurosNum = parseFloat(amountEuros.replace(",", "."));
      if (!amountEurosNum || amountEurosNum <= 0 || isNaN(amountEurosNum)) {
        throw new Error("El importe debe ser mayor a 0");
      }
      const amountCents = Math.round(amountEurosNum * 100);

      const updateData: any = {
        status,
        paymentMethod: paymentMethod || null,
        notes: notes || null,
        label,
        amountCents,
        dueDate: dueDate || null,
      };

      if (status === "paid" && charge.status !== "paid") {
        updateData.paidAt = new Date().toISOString();
      }

      const res = await fetch(`/api/charges/${charge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Error al actualizar el cargo");
      }

      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Editar cargo"
      description="Modifica los datos del cargo"
      open={open}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Label *</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Importe (€) *</label>
          <input
            type="number"
            step="0.01"
            value={amountEuros}
            onChange={(e) => setAmountEuros(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            required
            min="0.01"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Estado *</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            required
          >
            <option value="pending">Pendiente</option>
            <option value="paid">Pagado</option>
            <option value="overdue">Atrasado</option>
            <option value="cancelled">Cancelado</option>
            <option value="partial">Parcial</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Método de pago</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Sin especificar</option>
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
            <option value="bizum">Bizum</option>
            <option value="card_manual">Tarjeta</option>
            <option value="other">Otro</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Fecha de vencimiento</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            rows={3}
          />
        </div>
      </form>
    </Modal>
  );
}

