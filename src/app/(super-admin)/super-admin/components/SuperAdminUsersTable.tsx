"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, UserCog } from "lucide-react";

import type { SuperAdminUserRow } from "@/lib/superAdminService";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = ["owner", "admin", "coach", "athlete", "parent", "super_admin"] as const;

type SuperAdminUsersFilters = {
  role?: (typeof ROLE_OPTIONS)[number];
  status?: "active" | "suspended";
  search?: string;
};

interface SuperAdminUsersTableProps {
  initialItems: SuperAdminUserRow[];
}

function formatRole(role: string | null) {
  if (!role) return "Sin rol";
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "coach":
      return "Coach";
    case "athlete":
      return "Atleta";
    case "parent":
      return "Tutor";
    case "super_admin":
      return "Super Admin";
    default:
      return role;
  }
}

export function SuperAdminUsersTable({ initialItems }: SuperAdminUsersTableProps) {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<SuperAdminUserRow[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SuperAdminUsersFilters>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      const roleKey = item.role ?? "unknown";
      counts[roleKey] = (counts[roleKey] ?? 0) + 1;
    });
    return counts;
  }, [items]);

  const fetchUsers = async (activeFilters: SuperAdminUsersFilters) => {
    if (!userId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeFilters.role) params.set("role", activeFilters.role);
      if (activeFilters.status) params.set("status", activeFilters.status);
      if (activeFilters.search) params.set("q", activeFilters.search);

      const response = await fetch(`/api/super-admin/users?${params.toString()}`, {
        headers: { "x-user-id": userId },
        cache: "no-store",
      });
      if (!response.ok) {
        console.error("Fetch users failed", await response.text());
        return;
      }
      const payload = await response.json();
      setItems(payload.items ?? []);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = async (partial: Partial<SuperAdminUsersFilters>) => {
    const next = { ...filters, ...partial };
    setFilters(next);
    await fetchUsers(next);
  };

  const mutateUser = async (profileId: string, body: Record<string, unknown>) => {
    if (!userId) return;
    const response = await fetch(`/api/super-admin/users/${profileId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error("Update user failed", await response.text());
      return;
    }
    await fetchUsers(filters);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-300">Usuarios</p>
          <h2 className="text-xl font-semibold text-white">Control de roles y estados</h2>
          <p className="text-xs text-slate-300">
            {items.length} usuarios listados ·{" "}
            {Object.entries(roleCounts)
              .map(([role, count]) => `${formatRole(role)}: ${count}`)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-white/40 focus:border-white/60 focus:outline-none"
            value={filters.role ?? ""}
            onChange={(event) =>
              handleFilterChange({ role: event.target.value || undefined })
            }
          >
            <option value="">Rol (todos)</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {formatRole(role)}
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
            <option value="active">Activos</option>
            <option value="suspended">Suspendidos</option>
          </select>
          <input
            type="search"
            placeholder="Buscar por nombre o correo"
            className="max-w-xs rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-400 focus:border-white/60 focus:outline-none"
            onBlur={(event) => handleFilterChange({ search: event.target.value || undefined })}
          />
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 bg-white/10 text-slate-100 hover:border-white/40 hover:bg-white/20"
            onClick={() => handleFilterChange({ role: undefined, status: undefined, search: undefined })}
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
              <th className="px-4 py-3 text-left font-semibold">Usuario</th>
              <th className="px-4 py-3 text-left font-semibold">Rol</th>
              <th className="px-4 py-3 text-left font-semibold">Estado</th>
              <th className="px-4 py-3 text-left font-semibold">Plan</th>
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-slate-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-300">
                  No se encontraron usuarios.
                </td>
              </tr>
            )}
            {items.map((user) => (
              <tr
                key={user.id}
                className="cursor-pointer transition hover:bg-white/5"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, select")) return;
                  router.push(`/super-admin/users/${user.id}`);
                }}
              >
                <td className="px-4 py-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-white">{user.fullName ?? "Sin nombre"}</p>
                    <p className="text-xs text-slate-300">{user.email ?? "Sin correo"}</p>
                    <p className="text-xs text-slate-400">
                      Registrado:{" "}
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString("es-ES")
                        : "—"}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <select
                    className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100 focus:border-white/40 focus:outline-none"
                    value={user.role ?? ""}
                    onChange={(event) => mutateUser(user.id, { role: event.target.value })}
                    disabled={loading || user.role === "super_admin"}
                  >
                    <option value={user.role ?? ""}>{formatRole(user.role)}</option>
                    {ROLE_OPTIONS.filter((option) => option !== user.role).map((option) => (
                      <option key={option} value={option}>
                        {formatRole(option)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-4">
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
                      user.isSuspended
                        ? "bg-rose-500/15 text-rose-300"
                        : "bg-emerald-500/15 text-emerald-300",
                    )}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.8} />
                    {user.isSuspended ? "Suspendido" : "Activo"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {user.planCode ? (
                    <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                      {user.planCode}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Sin plan</span>
                  )}
                </td>
                <td className="px-4 py-4 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "border-white/20 bg-white/10 text-slate-100 hover:border-white/40 hover:bg-white/20",
                      user.isSuspended && "border-emerald-500/40 text-emerald-200",
                    )}
                    onClick={() =>
                      mutateUser(user.id, {
                        isSuspended: !user.isSuspended,
                      })
                    }
                    disabled={loading || user.role === "super_admin"}
                  >
                    <UserCog className="mr-2 h-4 w-4" strokeWidth={1.8} />
                    {user.isSuspended ? "Reactivar" : "Suspender"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

