"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PauseCircle, PlayCircle, Trash2, Loader2 } from "lucide-react";

import type { SuperAdminAcademyRow } from "@/lib/superAdminService";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type SuperAdminAcademyFilters = {
  plan?: string;
  type?: string;
  country?: string;
  status?: "active" | "suspended";
};

function formatAcademyType(value: string | null) {
  switch (value) {
    case "artistica":
      return "Gimnasia artística";
    case "ritmica":
      return "Gimnasia rítmica";
    case "trampolin":
      return "Trampolín";
    case "general":
      return "General / Mixta";
    default:
      return value ?? "Sin tipo";
  }
}

interface SuperAdminAcademiesTableProps {
  initialItems: SuperAdminAcademyRow[];
  initialTotal: number;
}

export function SuperAdminAcademiesTable({
  initialItems,
  initialTotal,
}: SuperAdminAcademiesTableProps) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<SuperAdminAcademyRow[]>(initialItems);
  const [total, setTotal] = useState(initialTotal || initialItems.length);
  const [loading, setLoading] = useState(false);
  const [mutatingAcademyId, setMutatingAcademyId] = useState<string | null>(null);
  const [filters, setFilters] = useState<SuperAdminAcademyFilters>({});
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    academyId: string;
    action: "suspend" | "delete";
    academyName: string;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  const planOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((academy) => {
      if (academy.planCode) set.add(academy.planCode);
    });
    return Array.from(set).sort();
  }, [items]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((academy) => {
      if (academy.academyType) set.add(academy.academyType);
    });
    return Array.from(set).sort();
  }, [items]);

  const handleFilterChange = async (partial: Partial<SuperAdminAcademyFilters>) => {
    const nextFilters = { ...filters, ...partial };
    setFilters(nextFilters);
    await fetchAcademies(nextFilters);
  };

  const fetchAcademies = async (activeFilters: SuperAdminAcademyFilters) => {
    if (!userId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeFilters.plan) params.set("plan", activeFilters.plan);
      if (activeFilters.type) params.set("type", activeFilters.type);
      if (activeFilters.country) params.set("country", activeFilters.country);
      if (activeFilters.status) params.set("status", activeFilters.status);

      const response = await fetch(`/api/super-admin/academies?${params.toString()}`, {
        headers: {
          "x-user-id": userId,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        console.error("Error fetching academias", await response.text());
        return;
      }

      const payload = await response.json();
      setItems(payload.items ?? []);
      setTotal(payload.total ?? payload.items?.length ?? 0);
    } finally {
      setLoading(false);
    }
  };

  const mutateAcademy = async (
    academyId: string,
    payload: Record<string, unknown>,
    method: "PATCH" | "DELETE",
    optimisticUpdate = true,
  ) => {
    if (!userId) return;

    const academy = items.find((a) => a.id === academyId);
    if (!academy) return;

    // Optimistic update: actualizar UI inmediatamente
    if (optimisticUpdate) {
      if (method === "DELETE") {
        setItems((prevItems) => prevItems.filter((item) => item.id !== academyId));
        setTotal((prev) => Math.max(0, prev - 1));
      } else {
        setItems((prevItems) =>
          prevItems.map((item) => {
            if (item.id === academyId) {
              return {
                ...item,
                ...payload,
              };
            }
            return item;
          })
        );
      }
    }

    setMutatingAcademyId(academyId);
    try {
      const response = await fetch(`/api/super-admin/academies/${academyId}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: method === "PATCH" ? JSON.stringify(payload) : undefined,
      });

      if (!response.ok) {
        // Revertir optimistic update en caso de error
        if (optimisticUpdate) {
          await fetchAcademies(filters);
        }
        const error = await response.json().catch(() => ({}));
        toast.pushToast({
          title: "Error al actualizar academia",
          description: error.message || "No se pudo completar la operación",
          variant: "error",
        });
        return;
      }

      toast.pushToast({
        title: method === "DELETE" ? "Academia eliminada" : "Academia actualizada",
        description: method === "DELETE" 
          ? "La academia ha sido eliminada correctamente"
          : "Los cambios se han aplicado correctamente",
        variant: "success",
      });

      // Refrescar datos para asegurar sincronización
      await fetchAcademies(filters);
    } catch (error: any) {
      // Revertir optimistic update en caso de error
      if (optimisticUpdate) {
        await fetchAcademies(filters);
      }
      console.error("Mutation failed", error);
      toast.pushToast({
        title: "Error",
        description: error.message || "Ocurrió un error inesperado",
        variant: "error",
      });
    } finally {
      setMutatingAcademyId(null);
    }
  };

  const handleSuspend = (academy: SuperAdminAcademyRow) => {
    setPendingAction({
      academyId: academy.id,
      action: "suspend",
      academyName: academy.name || "Sin nombre",
    });
    setConfirmDialogOpen(true);
  };

  const handleDelete = (academy: SuperAdminAcademyRow) => {
    setPendingAction({
      academyId: academy.id,
      action: "delete",
      academyName: academy.name || "Sin nombre",
    });
    setConfirmDialogOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;

    if (pendingAction.action === "delete") {
      await mutateAcademy(pendingAction.academyId, {}, "DELETE");
    } else {
      const academy = items.find((a) => a.id === pendingAction.academyId);
      if (academy) {
        await mutateAcademy(pendingAction.academyId, { isSuspended: !academy.isSuspended }, "PATCH");
      }
    }

    setPendingAction(null);
    setConfirmDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-300">Academias</p>
          <h2 className="text-xl font-semibold text-white">Gestión centralizada</h2>
          <p className="text-xs text-slate-300">Total: {total} academias registradas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-white/40 focus:border-white/60 focus:outline-none"
            value={filters.plan ?? ""}
            onChange={(event) =>
              handleFilterChange({ plan: event.target.value || undefined })
            }
          >
            <option value="">Plan (todos)</option>
            {planOptions.map((plan) => (
              <option key={plan} value={plan}>
                {plan.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-white/40 focus:border-white/60 focus:outline-none"
            value={filters.type ?? ""}
            onChange={(event) =>
              handleFilterChange({ type: event.target.value || undefined })
            }
          >
            <option value="">Tipo (todos)</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {formatAcademyType(type)}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-white/40 focus:border-white/60 focus:outline-none"
            value={filters.status ?? ""}
            onChange={(event) =>
              handleFilterChange({
                status: (event.target.value as "active" | "suspended" | "") || undefined,
              })
            }
          >
            <option value="">Estado</option>
            <option value="active">Activa</option>
            <option value="suspended">Suspendida</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 bg-white/10 text-slate-100 hover:border-white/40 hover:bg-white/20"
            onClick={() =>
              handleFilterChange({ plan: undefined, type: undefined, country: undefined, status: undefined })
            }
            disabled={loading}
          >
            Restablecer
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/10 text-xs uppercase tracking-wide text-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Academia</th>
              <th className="px-4 py-3 text-left font-semibold">Plan</th>
              <th className="px-4 py-3 text-left font-semibold">Estado</th>
              <th className="px-4 py-3 text-left font-semibold">Creación</th>
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-slate-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-300">
                  No se encontraron academias con los filtros actuales.
                </td>
              </tr>
            )}
            {items.map((academy) => (
              <tr
                key={academy.id}
                className="cursor-pointer transition hover:bg-white/5"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  router.push(`/super-admin/academies/${academy.id}`);
                }}
              >
                <td className="px-4 py-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-white">{academy.name ?? "Sin nombre"}</p>
                    <p className="text-xs text-slate-300">
                      {academy.country ?? "Sin país"} · {formatAcademyType(academy.academyType)}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-1">
                    <p className="font-semibold uppercase text-white">
                      {academy.planCode ?? "Sin plan"}
                    </p>
                    <p className="text-xs text-slate-300">{academy.planNickname ?? "—"}</p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
                      academy.isSuspended
                        ? "bg-rose-500/15 text-rose-300"
                        : "bg-emerald-500/15 text-emerald-300",
                    )}
                  >
                    {academy.isSuspended ? "Suspendida" : "Activa"}
                  </span>
                </td>
                <td className="px-4 py-4 text-xs text-slate-300">
                  {academy.createdAt
                    ? new Date(academy.createdAt).toLocaleDateString("es-ES")
                    : "—"}
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/20 bg-white/5 text-slate-100 hover:border-white/40 hover:bg-white/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSuspend(academy);
                      }}
                      disabled={loading || mutatingAcademyId === academy.id}
                    >
                      {mutatingAcademyId === academy.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.8} />
                          Procesando...
                        </>
                      ) : academy.isSuspended ? (
                        <>
                          <PlayCircle className="mr-2 h-4 w-4" strokeWidth={1.8} />
                          Reactivar
                        </>
                      ) : (
                        <>
                          <PauseCircle className="mr-2 h-4 w-4" strokeWidth={1.8} />
                          Suspender
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-rose-500/40 bg-rose-500/10 text-rose-200 hover:border-rose-400 hover:bg-rose-400/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(academy);
                      }}
                      disabled={loading || mutatingAcademyId === academy.id}
                    >
                      {mutatingAcademyId === academy.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.8} />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.8} />
                          Eliminar
                        </>
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        ¿Necesitas editar detalles avanzados de una academia? Ingresa como owner desde{" "}
        <Link href="/onboarding" className="font-semibold text-emerald-300 hover:underline">
          onboarding forzado
        </Link>{" "}
        mientras desarrollamos la delegación directa.
      </p>

      {pendingAction && (
        <ConfirmDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          title={
            pendingAction.action === "delete"
              ? "Eliminar academia"
              : `Suspender academia`
          }
          description={
            pendingAction.action === "delete"
              ? `¿Estás seguro de eliminar "${pendingAction.academyName}"? Esta acción eliminará la academia y todos sus datos asociados. Esta acción no se puede deshacer.`
              : `¿Estás seguro de suspender "${pendingAction.academyName}"? Los usuarios no podrán acceder hasta que sea reactivada.`
          }
          variant="destructive"
          confirmText={pendingAction.action === "delete" ? "Eliminar" : "Suspender"}
          onConfirm={handleConfirmAction}
          onCancel={() => {
            setPendingAction(null);
            setConfirmDialogOpen(false);
          }}
          loading={mutatingAcademyId === pendingAction?.academyId}
        />
      )}
    </div>
  );
}

