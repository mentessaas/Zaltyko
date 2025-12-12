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

export function StudentChargesTab({ academyId }: StudentChargesTabProps) {
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
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  // Initialize from URL params in useEffect to avoid render-time state updates
  useEffect(() => {
    if (searchParams) {
      const urlStatus = searchParams.get("status");
      const urlGroupId = searchParams.get("groupId");
      const urlAthleteId = searchParams.get("athleteId");
      
      if (urlStatus) setStatusFilter(urlStatus);
      if (urlGroupId) setGroupId(urlGroupId);
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
        // No incluir statusFilter para obtener todos los estados
      });

      const metricsRes = await fetch(`/api/charges?${metricsParams}`);
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setAllChargesForPeriod(metricsData.items || []);
      }
    } catch (error) {
      console.error("Error loading charges:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await fetch(`/api/groups?academyId=${academyId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Error loading groups:", res.status, errorData);
        setGroups([]);
        return;
      }
      const data = await res.json();
      if (data.items && Array.isArray(data.items)) {
        setGroups(data.items);
      } else {
        console.warn("Groups API returned unexpected format:", data);
        setGroups([]);
      }
    } catch (error) {
      console.error("Error loading groups:", error);
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    loadCharges();
  }, [academyId, period, statusFilter, onlyPendingOverdue, groupId, searchParams]);

  useEffect(() => {
    loadGroups();
  }, [academyId]);

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
      console.error("Error marking paid:", error);
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
      console.error("Error updating status:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Cobros a alumnos</h2>
        <p className="text-sm text-muted-foreground">
          Controla cuotas, matrículas y otros cargos a atletas.
        </p>
      </div>

      {/* Filtros */}
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-3">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={loadingGroups}
          >
            <option value="">Todos los grupos</option>
            {loadingGroups ? (
              <option value="" disabled>
                Cargando grupos...
              </option>
            ) : groups.length === 0 ? (
              <option value="" disabled>
                No hay grupos
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
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="overdue">Atrasado</option>
            <option value="paid">Pagado</option>
            <option value="cancelled">Cancelado</option>
            <option value="partial">Parcial</option>
          </select>
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
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
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total del periodo
            </p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatAmount(summaryMetrics.total)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Cobrado
            </p>
            <p className="mt-1 text-xl font-semibold text-green-600">
              {formatAmount(summaryMetrics.paid)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pendiente / Atrasado
            </p>
            <p className="mt-1 text-xl font-semibold text-yellow-600">
              {formatAmount(summaryMetrics.pendingOrOverdue)}
            </p>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando cargos...</p>
      ) : charges.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
          <p className="mb-4 text-sm text-muted-foreground">
            Aún no has creado ningún cargo para este periodo. Crea tu primer cargo para empezar a gestionar los cobros a tus atletas.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-4" variant="default">
            Crear primer cargo
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Atleta</th>
                <th className="px-4 py-3 font-medium">Grupo</th>
                <th className="px-4 py-3 font-medium">Concepto</th>
                <th className="px-4 py-3 font-medium">Periodo</th>
                <th className="px-4 py-3 font-medium">Importe</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium">Última actualización</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background">
              {charges.map((charge) => (
                <tr key={charge.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/${academyId}/athletes/${charge.athleteId}`}
                      className="text-primary hover:underline"
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
                        <p className="text-xs text-yellow-700">Clase extra</p>
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
        groups={groups.map((g) => ({ id: g.id, name: g.name, color: null }))}
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

