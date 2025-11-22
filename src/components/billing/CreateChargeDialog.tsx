"use client";

import { FormEvent, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface BillingItem {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
}

interface AthleteOption {
  id: string;
  name: string;
}

interface CreateChargeDialogProps {
  academyId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  athleteId?: string; // Pre-selected athlete
}

export function CreateChargeDialog({
  academyId,
  open,
  onClose,
  onCreated,
  athleteId: preselectedAthleteId,
}: CreateChargeDialogProps) {
  const [athleteId, setAthleteId] = useState(preselectedAthleteId || "");
  const [billingItemId, setBillingItemId] = useState("");
  const [label, setLabel] = useState("");
  const [amountEuros, setAmountEuros] = useState(""); // UI en euros (se convierte a céntimos al guardar)
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAthleteId(preselectedAthleteId || "");
    setBillingItemId("");
    setLabel("");
    setAmountEuros("");
    setDueDate("");
    setNotes("");
    setPaymentMethod("");
    setLabelWasManuallyEdited(false);
    setError(null);

    // Load billing items
    fetch(`/api/billing-items?academyId=${academyId}&isActive=true`)
      .then((res) => res.json())
      .then((data) => setBillingItems(data.items || []))
      .catch(console.error);

    // Load athletes
    fetch(`/api/athletes?academyId=${academyId}&limit=1000`)
      .then((res) => res.json())
      .then((data) => setAthletes(data.items || []))
      .catch(console.error);
  }, [open, academyId, preselectedAthleteId]);

  // Helper para formatear periodo a nombre de mes en español
  const formatPeriodToMonthName = (periodStr: string): string => {
    const [year, month] = periodStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  };

  // Autogenerar label cuando se selecciona un concepto
  // Usamos un flag para evitar regenerar si el usuario ya editó manualmente
  const [labelWasManuallyEdited, setLabelWasManuallyEdited] = useState(false);

  useEffect(() => {
    if (billingItemId && billingItems.length > 0) {
      const item = billingItems.find((i) => i.id === billingItemId);
      if (item) {
        // Convertir céntimos a euros para mostrar en UI
        setAmountEuros(String((item.amountCents / 100).toFixed(2)));
        // Autogenerar label solo si no fue editado manualmente
        if (!labelWasManuallyEdited) {
          const monthName = formatPeriodToMonthName(period);
          setLabel(`${item.name} – ${monthName}`);
        }
      }
    } else if (!billingItemId) {
      // Si se deselecciona el concepto, resetear el flag
      setLabelWasManuallyEdited(false);
    }
  }, [billingItemId, billingItems, period, labelWasManuallyEdited]);

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

      // MEJORA UX: Autogenerar label si está vacío
      // Formato: "NombreConcepto – mes año" (ej: "Cuota mensual – noviembre 2025")
      let finalLabel = label.trim();
      if (!finalLabel && billingItemId) {
        const item = billingItems.find((i) => i.id === billingItemId);
        if (item) {
          const monthName = formatPeriodToMonthName(period);
          finalLabel = `${item.name} – ${monthName}`;
        }
      }
      if (!finalLabel) {
        const monthName = formatPeriodToMonthName(period);
        finalLabel = `Cargo – ${monthName}`;
      }

      const res = await fetch("/api/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          athleteId,
          billingItemId: billingItemId || undefined,
          label: finalLabel,
          amountCents,
          currency: "EUR",
          period,
          dueDate: dueDate || undefined,
          notes: notes || undefined,
          paymentMethod: paymentMethod || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Error al crear el cargo");
      }

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Nuevo cargo"
      description="Crea un nuevo cargo para un atleta"
      open={open}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !athleteId || !amountEuros}>
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
          <label className="block text-sm font-medium mb-1">Atleta *</label>
          <select
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            required
            disabled={!!preselectedAthleteId}
          >
            <option value="">Seleccionar atleta</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Concepto</label>
          <select
            value={billingItemId}
            onChange={(e) => setBillingItemId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Otro / Sin concepto</option>
            {billingItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.amountCents / 100}€)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Label *</label>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setLabelWasManuallyEdited(true);
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Ej: Cuota grupo Principiantes – noviembre 2025"
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
            placeholder="50.00"
            required
            min="0.01"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Periodo *</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            required
          />
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

