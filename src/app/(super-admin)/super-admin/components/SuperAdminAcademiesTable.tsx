"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PauseCircle, PlayCircle, Trash2 } from "lucide-react";

import type { SuperAdminAcademyRow } from "@/lib/superAdminService";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<SuperAdminAcademyRow[]>(initialItems);
  const [total, setTotal] = useState(initialTotal || initialItems.length);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SuperAdminAcademyFilters>({});

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
  ) => {
    if (!userId) return;
    const response = await fetch(`/api/super-admin/academies/${academyId}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: method === "PATCH" ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      console.error("Mutation failed", await response.text());
      return;
    }

    await fetchAcademies(filters);
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
                      onClick={() => {
                        const confirmMessage = academy.isSuspended
                          ? "¿Reactivar la academia?"
                          : "¿Suspender la academia? Los usuarios no podrán acceder.";
                        if (window.confirm(confirmMessage)) {
                          mutateAcademy(academy.id, { isSuspended: !academy.isSuspended }, "PATCH");
                        }
                      }}
                      disabled={loading}
                    >
                      {academy.isSuspended ? (
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
                      onClick={() => {
                        if (
                          window.confirm(
                            "Esta acción eliminará la academia y sus datos asociados. ¿Confirmas?",
                          )
                        ) {
                          mutateAcademy(academy.id, {}, "DELETE");
                        }
                      }}
                      disabled={loading}
                    >
                      <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.8} />
                      Eliminar
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
    </div>
  );
}

