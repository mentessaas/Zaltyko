"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, AlertCircle, CheckCircle, Clock, ArrowRight, Loader2, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FamilyPaymentMethodCard } from "@/components/billing/FamilyPaymentMethodCard";

interface ChargeData {
  id: string;
  label: string;
  amountCents: number;
  period: string;
  status: string;
  dueDate: string | null;
  notes: string | null;
  billingItemName: string | null;
  billingItemDescription: string | null;
}

interface MyPaymentsWidgetProps {
  charges: ChargeData[];
  academyId?: string;
}

const PAYABLE_STATUSES = new Set(["pending", "overdue", "failed"]);

export function MyPaymentsWidget({ charges, academyId }: MyPaymentsWidgetProps) {
  const [showAll, setShowAll] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();

  const payCharge = async (chargeId: string) => {
    setPayingId(chargeId);
    setActionError(null);
    try {
      const res = await fetch(`/api/family/charges/${chargeId}/pay`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.error === "NO_SAVED_CARD") {
          setActionError("Añade una tarjeta para poder pagar.");
        } else if (json.error === "REQUIRES_ACTION") {
          setActionError("Tu banco pide autenticación. Inténtalo desde tu app bancaria.");
        } else if (json.error === "CONNECT_NOT_READY") {
          setActionError("La academia aún no tiene activados los pagos con tarjeta.");
        } else {
          setActionError("No se pudo completar el pago. Revisa tu tarjeta.");
        }
        return;
      }
      router.refresh();
    } catch {
      setActionError("Error de conexión al procesar el pago.");
    } finally {
      setPayingId(null);
    }
  };

  const openReceipt = async (chargeId: string) => {
    try {
      const res = await fetch(`/api/family/charges/${chargeId}/receipt`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.url) {
        window.open(json.url as string, "_blank", "noopener");
      } else {
        setActionError("El recibo aún no está disponible.");
      }
    } catch {
      setActionError("No se pudo abrir el recibo.");
    }
  };

  if (charges.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <p className="mt-2 text-sm font-medium text-foreground">¡Todo al día!</p>
          <p className="text-xs text-muted-foreground">No tienes pagos pendientes</p>
        </div>
        {academyId && <FamilyPaymentMethodCard academyId={academyId} />}
      </div>
    );
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Sin fecha";
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
    });
  };

  const formatPeriod = (period: string) => {
    // Formato: YYYY-MM
    const [year, month] = period.split("-");
    const monthNames = [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "pending":
        return {
          icon: Clock,
          label: "Pendiente",
          color: "text-amber-600",
          bgColor: "bg-amber-50",
          borderColor: "border-amber-500/50",
          badge: (
            <Badge
              variant="outline"
              className="border-amber-500/50 text-amber-600 bg-amber-50"
            >
              Pendiente
            </Badge>
          ),
        };
      case "overdue":
        return {
          icon: AlertCircle,
          label: "Vencido",
          color: "text-red-600",
          bgColor: "bg-red-50",
          borderColor: "border-red-500/50",
          badge: (
            <Badge variant="outline" className="border-red-500/50 text-red-600 bg-red-50">
              Vencido
            </Badge>
          ),
        };
      case "paid":
        return {
          icon: CheckCircle,
          label: "Pagado",
          color: "text-emerald-600",
          bgColor: "bg-emerald-50",
          borderColor: "border-emerald-500/50",
          badge: (
            <Badge
              variant="outline"
              className="border-emerald-500/50 text-emerald-600 bg-emerald-50"
            >
              Pagado
            </Badge>
          ),
        };
      case "failed":
        return {
          icon: AlertCircle,
          label: "Pago fallido",
          color: "text-red-600",
          bgColor: "bg-red-50",
          borderColor: "border-red-500/50",
          badge: (
            <Badge variant="outline" className="border-red-500/50 text-red-600 bg-red-50">
              Pago fallido
            </Badge>
          ),
        };
      case "refunded":
        return {
          icon: CreditCard,
          label: "Reembolsado",
          color: "text-amber-600",
          bgColor: "bg-amber-50",
          borderColor: "border-amber-500/50",
          badge: (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-50">
              Reembolsado
            </Badge>
          ),
        };
      default:
        return {
          icon: CreditCard,
          label: status,
          color: "text-muted-foreground",
          bgColor: "bg-muted",
          borderColor: "border-border",
          badge: <Badge variant="outline">{status}</Badge>,
        };
    }
  };

  // Separar pagos pendientes de pagados (incluye fallidos: siguen debiendose)
  const pendingCharges = charges.filter((c) => PAYABLE_STATUSES.has(c.status));

  // Calcular total pendiente
  const totalPending = pendingCharges.reduce(
    (sum, c) => sum + c.amountCents,
    0
  );

  return (
    <div className="space-y-4">
      {/* Resumen de pagos pendientes */}
      {pendingCharges.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium text-foreground">
                Total pendiente
              </span>
            </div>
            <span className="text-xl font-bold text-amber-700">
              {formatCurrency(totalPending)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {pendingCharges.length} pago(s) pendientes
          </p>
        </div>
      )}

      {/* Lista de pagos recientes */}
      <div className="space-y-2">
        {charges.slice(0, showAll ? charges.length : 4).map((charge, index) => {
          const statusInfo = getStatusInfo(charge.status);
          const StatusIcon = statusInfo.icon;

          return (
            <div
              key={charge.id}
              className={`flex flex-col gap-2 rounded-lg border p-3 ${statusInfo.bgColor} ${statusInfo.borderColor}`}
              style={{ animationDelay: `${index * 75}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusIcon className={`h-5 w-5 ${statusInfo.color}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {charge.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPeriod(charge.period)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">
                    {formatCurrency(charge.amountCents)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {charge.dueDate && `Vence: ${formatDate(charge.dueDate)}`}
                  </p>
                </div>
              </div>
              {/* Descripción del item de facturación */}
              {(charge.billingItemDescription || charge.notes) && (
                <div className="text-xs text-muted-foreground pl-8">
                  {charge.billingItemDescription && (
                    <p>{charge.billingItemDescription}</p>
                  )}
                  {charge.notes && (
                    <p className="italic mt-1">{charge.notes}</p>
                  )}
                </div>
              )}
              {/* Acciones: pagar (pendiente/vencido/fallido) o recibo (pagado) */}
              {academyId && PAYABLE_STATUSES.has(charge.status) && (
                <div className="pl-8">
                  <Button
                    size="sm"
                    onClick={() => payCharge(charge.id)}
                    disabled={payingId === charge.id}
                  >
                    {payingId === charge.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="mr-2 h-4 w-4" />
                    )}
                    Pagar ahora
                  </Button>
                </div>
              )}
              {academyId && charge.status === "paid" && (
                <div className="pl-8">
                  <Button variant="ghost" size="sm" onClick={() => openReceipt(charge.id)}>
                    <Receipt className="mr-2 h-4 w-4" /> Recibo
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {academyId && <FamilyPaymentMethodCard academyId={academyId} />}

      {/* Ver todos / ver menos */}
      {charges.length > 4 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? "Ver menos" : `Ver todos los pagos (${charges.length})`}
          <ArrowRight className={`ml-1 h-3 w-3 transition-transform ${showAll ? "-rotate-90" : "rotate-90"}`} />
        </Button>
      )}
    </div>
  );
}
