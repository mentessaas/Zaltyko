"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreateChargeDialog } from "@/components/billing/CreateChargeDialog";

interface ChargeItem {
  id: string;
  label: string;
  amountCents: number;
  currency: string;
  period: string;
  status: "pending" | "paid" | "overdue" | "cancelled" | "partial";
  createdAt: string;
  paidAt?: string | null;
}

interface AthleteAccountSectionProps {
  academyId: string;
  athleteId: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  partial: "bg-blue-100 text-blue-800",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  overdue: "Atrasado",
  cancelled: "Cancelado",
  partial: "Parcial",
};

function formatAmount(cents: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("es-ES", { year: "numeric", month: "short" });
}

export function AthleteAccountSection({ academyId, athleteId }: AthleteAccountSectionProps) {
  const [charges, setCharges] = useState<ChargeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [summary, setSummary] = useState({
    pendingTotal: 0,
    paidThisYear: 0,
  });

  const loadCharges = async () => {
    setLoading(true);
    try {
      // Load all charges for this athlete to calculate accurate totals
      const res = await fetch(`/api/charges?academyId=${academyId}&athleteId=${athleteId}&limit=200`);
      if (!res.ok) throw new Error("Error al cargar cargos");

      const data = await res.json();
      const allCharges = data.items || [];
      
      // Show last 5 for the table
      setCharges(allCharges.slice(0, 5));

      // Calculate summary from ALL charges (not just the 5 shown)
      const now = new Date();
      const currentYear = now.getFullYear();
      let pendingTotal = 0;
      let paidThisYear = 0;

      allCharges.forEach((charge: ChargeItem) => {
        if (charge.status === "pending" || charge.status === "overdue") {
          pendingTotal += charge.amountCents;
        }
        if (charge.status === "paid") {
          const paidDate = charge.paidAt ? new Date(charge.paidAt) : new Date(charge.createdAt);
          const chargeYear = paidDate.getFullYear();
          if (chargeYear === currentYear) {
            paidThisYear += charge.amountCents;
          }
        }
      });

      setSummary({ pendingTotal, paidThisYear });
    } catch (error) {
      console.error("Error loading charges:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCharges();
  }, [academyId, athleteId]);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <header>
        <h2 className="text-lg font-semibold text-foreground">Cuenta del atleta</h2>
        <p className="text-sm text-muted-foreground">
          Cargos y pagos asociados a este atleta.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando información...</p>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Total pendiente actual:</span>
              <span className="ml-2 font-semibold text-foreground">
                {formatAmount(summary.pendingTotal)}
              </span>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Total pagado este año:</span>
              <span className="ml-2 font-semibold text-foreground">
                {formatAmount(summary.paidThisYear)}
              </span>
            </div>
          </div>

          {/* Últimos cargos */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Últimos cargos</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreateOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Nuevo cargo
              </Button>
            </div>

            {charges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay cargos registrados para este atleta.
              </p>
            ) : (
              <div className="space-y-2">
                {charges.map((charge) => (
                  <div
                    key={charge.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/30 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{charge.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatPeriod(charge.period)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{formatAmount(charge.amountCents, charge.currency)}</span>
                      <Badge className={STATUS_COLORS[charge.status] || ""}>
                        {STATUS_LABELS[charge.status] || charge.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Nuevo cargo para este atleta
            </Button>
            {charges.length > 0 && (
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/app/${academyId}/billing?tab=student-charges&athleteId=${athleteId}`}>
                  Ver todos los cobros
                </Link>
              </Button>
            )}
          </div>
        </>
      )}

      <CreateChargeDialog
        academyId={academyId}
        athleteId={athleteId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={loadCharges}
      />
    </div>
  );
}

