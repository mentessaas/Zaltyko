"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MoreVertical, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreateChargeDialog } from "./CreateChargeDialog";
import { EditChargeDialog } from "./EditChargeDialog";
import { GenerateChargesDialog } from "./GenerateChargesDialog";
import { RegisterPaymentDialog } from "./RegisterPaymentDialog";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";
import { logger } from "@/lib/logger";

interface ChargeItem {
  id: string;
  athleteId: string;
  athleteName: string;
  billingItemId: string | null;
  billingItemName: string | null;
  classId: string | null;
  label: string;
  amountCents: number;
  currency: string;
  period: string;
  dueDate: string | null;
  status: "pending" | "paid" | "overdue" | "cancelled" | "partial";
  paymentMethod: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  groupId: string | null;
  groupName: string | null;
}

interface StudentChargesTabProps {
  academyId: string;
  sportConfigs?: Array<{
    id: string;
    name: string;
    disciplineName: string;
    branchName: string;
    terminology?: Record<string, string>;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-zaltyko-mist/30 text-slate-600",
  paid: "bg-zaltyko-teal/12 text-zaltyko-teal",
  overdue: "bg-zaltyko-coral/12 text-zaltyko-coral",
  cancelled: "bg-zaltyko-white text-zaltyko-text-secondary",
  partial: "bg-zaltyko-indigo/10 text-zaltyko-indigo",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  overdue: "Atrasado",
  cancelled: "Cancelado",
  partial: "Parcial",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
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

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("es-ES", { year: "numeric", month: "long" });
}

export function StudentChargesTab({ academyId, sportConfigs = [] }: StudentChargesTabProps) {
  const searchParams = useSearchParams();
  const [charges, setCharges] = useState<ChargeItem[]>([]);
  const [allChargesForPeriod, setAllChargesForPeriod] = useState<ChargeItem[]>([]); // Para métricas sin filtro de estado
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editing, setEditing] = useState<ChargeItem | null>(null);
  const [registeringPayment, setRegisteringPayment] = useState<ChargeItem | null>(null);
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [onlyPendingOverdue, setOnlyPendingOverdue] = useState(false);
  const [groupId, setGroupId] = useState<string>("");
  const [sportConfigId, setSportConfigId] = useState<string>("");
  const [groups, setGroups] = useState<Array<{ id: string; name: string; sportConfigId?: string | null }>>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const terms = getTerminologyForSportConfig(sportConfigs, sportConfigId);
  const athletesTermLower = terms.athletes.toLowerCase();
  const groupsTermLower = terms.groups.toLowerCase();

  // Initialize from URL params in useEffect to avoid render-time state updates
  useEffect(() => {
    if (searchParams) {
      const urlStatus = searchParams.get("status");
      const urlGroupId = searchParams.get("groupId");
      const urlSportConfigId = searchParams.get("sportConfigId");
      const urlAthleteId = searchParams.get("athleteId");
      
      if (urlStatus) setStatusFilter(urlStatus);
      if (urlGroupId) setGroupId(urlGroupId);
      if (urlSportConfigId) setSportConfigId(urlSportConfigId);
      // Note: athleteId filter is handled by the API call in loadCharges
    }
  }, [searchParams]);

  // MEJORA UX: Calcular métricas de resumen desde TODOS los cargos del periodo (sin filtro de estado)
  // Esto permite ver el resumen completo aunque se filtre por estado en la tabla
  // Las métricas se calculan en: total (todos), cobrado (status=paid), pendiente/atrasado (status=pending|overdue)
  const summaryMetrics = useMemo(() => {
    const total = allChargesForPeriod.reduce((sum, charge) => sum + charge.amountCents, 0);
    const paid = allChargesForPeriod
      .filter((charge) => charge.status === "paid")
      .reduce((sum, charge) => sum + charge.amountCents, 0);
    const pendingOrOverdue = allChargesForPeriod
      .filter((charge) => charge.status === "pending" || charge.status === "overdue")
      .reduce((sum, charge) => sum + charge.amountCents, 0);

    return { total, paid, pendingOrOverdue };
  }, [allChargesForPeriod]);

  const loadCharges = async () => {
    setLoading(true);
    try {
      // Determinar filtro de estado: si onlyPendingOverdue está activo, usar filtro combinado
      let effectiveStatusFilter = statusFilter;
      if (onlyPendingOverdue && !statusFilter) {
        effectiveStatusFilter = "pending,overdue"; // Filtro combinado
      }

      // Get athleteId from URL params if present
      const athleteId = searchParams?.get("athleteId") || null;

      // Cargar cargos filtrados para la tabla
      const params = new URLSearchParams({
        academyId,
        period,
        ...(effectiveStatusFilter && { status: effectiveStatusFilter }),
        ...(groupId && { groupId }),
        ...(sportConfigId && { sportConfigId }),
        ...(athleteId && { athleteId }),
      });

      const res = await fetch(`/api/charges?${params}`);
      if (!res.ok) throw new Error("Error al cargar cargos");

      const data = await res.json();
      setCharges(data.items || []);

      // MEJORA UX: Cargar TODOS los cargos del periodo (sin filtro de estado) para las métricas
      // Esto permite calcular correctamente las cards de resumen independientemente del filtro de estado
      const metricsParams = new URLSearchParams({
        academyId,
        period,
        ...(groupId && { groupId }), // Mantener filtro de grupo si existe
        ...(sportConfigId && { sportConfigId }),
        // No incluir statusFilter para obtener todos los estados
      });

      const metricsRes = await fetch(`/api/charges?${metricsParams}`);
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setAllChargesForPeriod(metricsData.items || []);
      }
    } catch (error) {
      logger.error("Error loading charges:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const params = new URLSearchParams({
        academyId,
        ...(sportConfigId && { sportConfigId }),
      });
      const res = await fetch(`/api/groups?${params}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        logger.error("Error loading groups:", res.status, errorData);
        setGroups([]);
        return;
      }
      const data = await res.json();
      if (data.items && Array.isArray(data.items)) {
        setGroups(data.items);
      } else {
        logger.warn("Groups API returned unexpected format:", data);
        setGroups([]);
      }
    } catch (error) {
      logger.error("Error loading groups:", error);
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    loadCharges();
  }, [academyId, period, statusFilter, onlyPendingOverdue, groupId, sportConfigId, searchParams]);

  useEffect(() => {
    setGroupId("");
    loadGroups();
  }, [academyId, sportConfigId]);

  const handleMarkPaid = async (chargeId: string) => {
    try {
      const res = await fetch(`/api/charges/${chargeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid", paidAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      loadCharges();
    } catch (error) {
      logger.error("Error marking paid:", error);
    }
  };

  const handleStatusChange = async (chargeId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/charges/${chargeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      loadCharges();
    } catch (error) {
      logger.error("Error updating status:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-zaltyko-navy">Cobros a {athletesTermLower}</h2>
        <p className="text-sm text-muted-foreground">
          Controla cuotas, matrículas y otros cargos a {athletesTermLower}.
        </p>
      </div>

      {/* Filtros */}
      <section className="flex flex-col gap-4 rounded-2xl border border-zaltyko-mist bg-white p-5 shadow-soft xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-3">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="min-h-11 rounded-[10px] border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
          />
          <select
            value={sportConfigId}
            onChange={(e) => setSportConfigId(e.target.value)}
            className="min-h-11 rounded-[10px] border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
          >
            <option value="">Todas las ramas</option>
            {sportConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.branchName} · {config.disciplineName}
              </option>
            ))}
          </select>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="min-h-11 rounded-[10px] border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
            disabled={loadingGroups}
          >
            <option value="">Todos los {groupsTermLower}</option>
            {loadingGroups ? (
              <option value="" disabled>
                Cargando {groupsTermLower}...
              </option>
            ) : groups.length === 0 ? (
              <option value="" disabled>
                No hay {groupsTermLower}
              </option>
            ) : (
              groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))
            )}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setOnlyPendingOverdue(false); // Reset checkbox when manually selecting status
            }}
            className="min-h-11 rounded-[10px] border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="overdue">Atrasado</option>
            <option value="paid">Pagado</option>
            <option value="cancelled">Cancelado</option>
            <option value="partial">Parcial</option>
          </select>
          <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-zaltyko-mist bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={onlyPendingOverdue}
              onChange={(e) => {
                setOnlyPendingOverdue(e.target.checked);
                if (e.target.checked) {
                  setStatusFilter(""); // Clear manual status filter when using quick filter
                }
              }}
              className="h-4 w-4"
            />
            <span>Solo pendientes / atrasados</span>
          </label>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setGenerateOpen(true)} variant="secondary" className="gap-2">
            Generar cargos de este mes
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo cargo
          </Button>
        </div>
      </section>

      {/* Cards de resumen */}
      {!loading && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-slate-400">
              Total del periodo
            </p>
            <p className="mt-1 font-display text-xl font-semibold text-zaltyko-navy">
              {formatAmount(summaryMetrics.total)}
            </p>
          </div>
          <div className="rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-slate-400">
              Cobrado
            </p>
            <p className="mt-1 font-display text-xl font-semibold text-zaltyko-teal">
              {formatAmount(summaryMetrics.paid)}
            </p>
          </div>
          <div className="rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-slate-400">
              Pendiente / Atrasado
            </p>
            <p className="mt-1 font-display text-xl font-semibold text-zaltyko-coral">
              {formatAmount(summaryMetrics.pendingOrOverdue)}
            </p>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando cargos...</p>
      ) : charges.length === 0 ? (
        <div className="rounded-2xl border border-zaltyko-mist bg-white p-12 text-center shadow-soft">
          <p className="mb-4 text-sm text-muted-foreground">
            Aún no has creado ningún cargo para este periodo. Crea tu primer cargo para empezar a gestionar los cobros a tus {athletesTermLower}.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-4" variant="default">
            Crear primer cargo
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zaltyko-mist bg-white shadow-soft">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-zaltyko-white">
              <tr className="text-left text-xs uppercase tracking-[0.05em] text-slate-400">
                <th className="px-4 py-3 font-medium">{terms.athlete}</th>
                <th className="px-4 py-3 font-medium">{terms.group}</th>
                <th className="px-4 py-3 font-medium">Concepto</th>
                <th className="px-4 py-3 font-medium">Periodo</th>
                <th className="px-4 py-3 font-medium">Importe</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium">Última actualización</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {charges.map((charge) => (
                <tr key={charge.id} className="hover:bg-zaltyko-white/80">
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/${academyId}/athletes/${charge.athleteId}`}
                      className="font-medium text-zaltyko-teal hover:underline"
                    >
                      {charge.athleteName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {charge.groupName || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{charge.label}</p>
                      {charge.classId && (
                        <p className="text-xs text-zaltyko-indigo">Clase extra</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatPeriod(charge.period)}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {formatAmount(charge.amountCents, charge.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_COLORS[charge.status] || ""}>
                      {STATUS_LABELS[charge.status] || charge.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {charge.paymentMethod
                      ? PAYMENT_METHOD_LABELS[charge.paymentMethod] || charge.paymentMethod
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {charge.updatedAt
                      ? new Date(charge.updatedAt).toLocaleDateString("es-ES")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(charge.status === "pending" || charge.status === "overdue") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRegisteringPayment(charge)}
                        >
                          Registrar pago
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(charge)}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateChargeDialog
        academyId={academyId}
        sportConfigId={sportConfigId}
        sportConfigs={sportConfigs}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={loadCharges}
      />

      {editing && (
        <EditChargeDialog
          charge={editing}
          academyId={academyId}
          open={!!editing}
          onClose={() => setEditing(null)}
          onUpdated={loadCharges}
        />
      )}

      <GenerateChargesDialog
        academyId={academyId}
        sportConfigId={sportConfigId}
        groups={groups.map((g) => ({ id: g.id, name: g.name, color: null }))}
        terminology={terms}
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={loadCharges}
      />

      {registeringPayment && (
        <RegisterPaymentDialog
          charge={registeringPayment}
          academyId={academyId}
          open={!!registeringPayment}
          onClose={() => setRegisteringPayment(null)}
          onRegistered={loadCharges}
        />
      )}
    </div>
  );
}
