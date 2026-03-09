"use client";

import { CreditCard, AlertCircle, CheckCircle, Clock, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ChargeData {
  id: string;
  label: string;
  amountCents: number;
  period: string;
  status: string;
  dueDate: string | null;
}

interface MyPaymentsWidgetProps {
  charges: ChargeData[];
}

export function MyPaymentsWidget({ charges }: MyPaymentsWidgetProps) {
  if (charges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <CheckCircle className="h-10 w-10 text-emerald-500" />
        <p className="mt-2 text-sm font-medium text-foreground">
          ¡Todo al día!
        </p>
        <p className="text-xs text-muted-foreground">
          No tienes pagos pendientes
        </p>
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

  // Separar pagos pendientes de pagados
  const pendingCharges = charges.filter(
    (c) => c.status === "pending" || c.status === "overdue"
  );
  const paidCharges = charges.filter((c) => c.status === "paid");

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
        {charges.slice(0, 4).map((charge) => {
          const statusInfo = getStatusInfo(charge.status);
          const StatusIcon = statusInfo.icon;

          return (
            <div
              key={charge.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${statusInfo.bgColor} ${statusInfo.borderColor}`}
            >
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
          );
        })}
      </div>

      {/* Si hay más de 4 pagos, mostrar indicador */}
      {charges.length > 4 && (
        <p className="text-center text-xs text-muted-foreground">
          + {charges.length - 4} pago(s) más
        </p>
      )}

      {/* Enlace para ver todos los pagos */}
      {(pendingCharges.length > 0 || paidCharges.length > 0) && (
        <Button variant="ghost" size="sm" className="w-full">
          Ver todos los pagos
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
