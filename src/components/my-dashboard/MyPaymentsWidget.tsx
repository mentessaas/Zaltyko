"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, AlertCircle, CheckCircle, Clock, ArrowRight, Loader2, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FamilyPaymentMethodCard } from "@/components/billing/FamilyPaymentMethodCard";
import { confirmScaChallenge, parseScaRecoveryDetails } from "@/lib/stripe/confirm-sca-client";
import { waitForChargePaid } from "@/lib/billing/wait-for-charge-paid";
import { formatMinorCurrency, getCurrencyForCountry } from "@/lib/currency";
import { formatDateForCountry } from "@/lib/date-utils";
import { useAcademyContext } from "@/hooks/use-academy-context";

interface ChargeData {
  id: string;
  label: string;
  amountCents: number;
  currency?: string | null;
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

const PAYABLE_STATUSES = new Set(["pending", "overdue", "failed", "requires_action"]);

export function MyPaymentsWidget({ charges, academyId }: MyPaymentsWidgetProps) {
  const { academyCountry } = useAcademyContext();
  const defaultCurrency = getCurrencyForCountry(academyCountry);
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
          // El banco pide 3DS: completamos el reto aquí mismo con el
          // client_secret del PaymentIntent en vez de derivar a la app bancaria.
          const sca = parseScaRecoveryDetails(json.details);
          if (!sca) {
            setActionError("Tu banco pide autenticación. Inténtalo desde tu app bancaria.");
            return;
          }
          const confirmation = await confirmScaChallenge(sca);
          if (!confirmation.ok) {
            setActionError(confirmation.message);
            return;
          }
          // El reto 3DS fue OK en Stripe, pero el webhook
          // `payment_intent.succeeded` reconcilia la fila en DB con asincronía.
          // Sondeamos el endpoint de status hasta `paid` (o 5s) y solo
          // entonces refrescamos: si no, ganamos la carrera y la lista muestra
          // el cargo aún en "Pago fallido".
          await waitForChargePaid({
            fetchStatus: async (signal) => {
              const r = await fetch(`/api/family/charges/${chargeId}/status`, { signal });
              if (!r.ok) return null;
              const j = await r.json().catch(() => null);
              const status = (j?.data?.status ?? null) as string | null;
              return status ? { status } : null;
            },
          });
          router.refresh();
          return;
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

  const formatChargeAmount = (charge: Pick<ChargeData, "amountCents" | "currency">) =>
    formatMinorCurrency(charge.amountCents, charge.currency ?? defaultCurrency);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Sin fecha";
    return formatDateForCountry(dateStr, academyCountry, "d MMM");
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
          color: "text-amber-600 dark:text-amber-300",
          bgColor: "bg-amber-50 dark:bg-amber-950/40",
          borderColor: "border-amber-500/50",
          badge: (
            <Badge
              variant="outline"
              className="border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300"
            >
              Pendiente
            </Badge>
          ),
        };
      case "overdue":
        return {
          icon: AlertCircle,
          label: "Vencido",
          color: "text-red-600 dark:text-red-300",
          bgColor: "bg-red-50 dark:bg-red-950/40",
          borderColor: "border-red-500/50",
          badge: (
            <Badge variant="outline" className="border-red-500/50 text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300">
              Vencido
            </Badge>
          ),
        };
      case "paid":
        return {
          icon: CheckCircle,
          label: "Pagado",
          color: "text-emerald-600 dark:text-emerald-300",
          bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
          borderColor: "border-emerald-500/50",
          badge: (
            <Badge
              variant="outline"
              className="border-emerald-500/50 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              Pagado
            </Badge>
          ),
        };
      case "failed":
        return {
          icon: AlertCircle,
          label: "Pago fallido",
          color: "text-red-600 dark:text-red-300",
          bgColor: "bg-red-50 dark:bg-red-950/40",
          borderColor: "border-red-500/50",
          badge: (
            <Badge variant="outline" className="border-red-500/50 text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300">
              Pago fallido
            </Badge>
          ),
        };
      case "requires_action":
        return {
          icon: AlertCircle,
          label: "Autenticación pendiente",
          color: "text-orange-600 dark:text-orange-300",
          bgColor: "bg-orange-50 dark:bg-orange-950/40",
          borderColor: "border-orange-500/50",
          badge: (
            <Badge variant="outline" className="border-orange-500/50 text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-300">
              Autenticación pendiente
            </Badge>
          ),
        };
      case "refunded":
        return {
          icon: CreditCard,
          label: "Reembolsado",
          color: "text-amber-600 dark:text-amber-300",
          bgColor: "bg-amber-50 dark:bg-amber-950/40",
          borderColor: "border-amber-500/50",
          badge: (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300">
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
  const pendingCurrencies = new Set(
    pendingCharges.map((charge) => (charge.currency ?? defaultCurrency).toUpperCase())
  );
  const pendingCurrency = pendingCurrencies.size === 1 ? [...pendingCurrencies][0] : null;

  return (
    <div className="space-y-4">
      {/* Resumen de pagos pendientes */}
      {pendingCharges.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 p-3 dark:bg-amber-950/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium text-foreground">
                Total pendiente
              </span>
            </div>
            <span className="text-xl font-bold text-amber-700 dark:text-amber-300">
              {pendingCurrency ? formatMinorCurrency(totalPending, pendingCurrency) : "Varias monedas"}
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
                    {formatChargeAmount(charge)}
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

      {actionError && <p className="text-sm text-red-600 dark:text-red-300" role="alert">{actionError}</p>}

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
