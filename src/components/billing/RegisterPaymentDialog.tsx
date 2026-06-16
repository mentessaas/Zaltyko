"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { z } from "zod";

import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { paymentMethodEnum } from "@/db/schema/enums";

interface ChargeItem {
  id: string;
  label: string;
  amountCents: number;
  currency: string;
  status: "pending" | "paid" | "overdue" | "cancelled" | "partial";
}

interface RegisterPaymentDialogProps {
  charge: ChargeItem;
  academyId: string;
  open: boolean;
  onClose: () => void;
  onRegistered: () => void;
}

type PaymentMethod = typeof paymentMethodEnum.enumValues[number];

const formSchema = z.object({
  paymentDate: z.date(),
  paymentMethod: z.enum(paymentMethodEnum.enumValues).nullable(),
});

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  bizum: "Bizum",
  card_manual: "Tarjeta",
  other: "Otro",
};

function formatAmount(cents: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function RegisterPaymentDialog({
  charge,
  academyId,
  open,
  onClose,
  onRegistered,
}: RegisterPaymentDialogProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [paymentDate, setPaymentDate] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const today = new Date();
      setPaymentDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
      setPaymentMethod(null);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const paymentDateObj = new Date(paymentDate);
    if (Number.isNaN(paymentDateObj.getTime())) {
      setError("La fecha de pago no es válida.");
      return;
    }

    const formData = {
      paymentDate: paymentDateObj,
      paymentMethod,
    };

    const validation = formSchema.safeParse(formData);
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || "Error de validación.");
      return;
    }

    startTransition(async () => {
      try {
        const paymentDateObj = validation.data.paymentDate;
        const res = await fetch(`/api/charges/${charge.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "paid",
            paidAt: paymentDateObj.toISOString(),
            paymentMethod: validation.data.paymentMethod,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Error al registrar el pago.");
        }

        toast.pushToast({
          title: "Pago registrado",
          description: "El pago ha sido registrado correctamente.",
          variant: "success",
        });
        onRegistered();
        onClose();
      } catch (err: any) {
        setError(err.message || "Error desconocido al registrar el pago.");
      }
    });
  };

  return (
    <Modal
      title="Registrar pago"
      description="Marca este cargo como pagado y registra el método de pago utilizado."
      open={open}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="register-payment-form" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar pago"}
          </Button>
        </div>
      }
    >
      <form id="register-payment-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div>
          <Label htmlFor="amount" className="mb-1 block text-sm font-medium">
            Importe
          </Label>
          <Input
            id="amount"
            value={formatAmount(charge.amountCents, charge.currency)}
            disabled
            className="bg-muted"
          />
        </div>

        <div>
          <Label htmlFor="paymentDate" className="mb-1 block text-sm font-medium">
            Fecha de pago <span className="text-destructive">*</span>
          </Label>
          <Input
            id="paymentDate"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            disabled={isPending}
            max={new Date().toISOString().split("T")[0]}
          />
        </div>

        <div>
          <Label htmlFor="paymentMethod" className="mb-1 block text-sm font-medium">
            Método de pago
          </Label>
          <Select
            value={paymentMethod || ""}
            onValueChange={(value) => setPaymentMethod(value as PaymentMethod | null)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un método" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Sin especificar</SelectItem>
              {paymentMethodEnum.enumValues.map((method) => (
                <SelectItem key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </form>
    </Modal>
  );
}

