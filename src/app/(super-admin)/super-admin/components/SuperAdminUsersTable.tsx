"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, UserCog, Users, Loader2 } from "lucide-react";

import type { SuperAdminUserRow } from "@/lib/superAdminService";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  const toast = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<SuperAdminUserRow[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);
  const [filters, setFilters] = useState<SuperAdminUsersFilters>({});
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    profileId: string;
    body: Record<string, unknown>;
    userData: SuperAdminUserRow;
  } | null>(null);

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

  const fetchUsers = useCallback(async (activeFilters: SuperAdminUsersFilters) => {
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
  }, [userId]);

  const handleFilterChange = useCallback(async (partial: Partial<SuperAdminUsersFilters>) => {
    const next = { ...filters, ...partial };
    setFilters(next);
    await fetchUsers(next);
  }, [filters, fetchUsers]);

  const handleSyncAthletes = useCallback(async () => {
    if (!userId || syncing) return;
    setSyncing(true);
    try {
      const response = await fetch("/api/super-admin/athletes/sync-users", {
        method: "POST",
        headers: { "x-user-id": userId },
      });
      const data = await response.json();
      if (data.ok) {
        toast.pushToast({
          title: data.message || "Atletas sincronizados correctamente",
          variant: "success",
        });
        await fetchUsers(filters);
      } else {
        toast.pushToast({
          title: data.message || "Error al sincronizar atletas",
          variant: "error",
        });
      }
    } catch (error: any) {
      console.error("Error sincronizando atletas:", error);
      toast.pushToast({
        title: "Error al sincronizar atletas",
        variant: "error",
      });
    } finally {
      setSyncing(false);
    }
  }, [userId, syncing, fetchUsers, filters, toast]);

  const executeMutation = useCallback(async (profileId: string, body: Record<string, unknown>, optimisticUpdate = true) => {
    if (!userId) return;
    
    // Optimistic update: actualizar UI inmediatamente
    if (optimisticUpdate) {
      setItems((prevItems) =>
        prevItems.map((item) => {
          if (item.id === profileId) {
            return {
              ...item,
              ...(body.role && { role: body.role }),
              ...(body.isSuspended !== undefined && { isSuspended: body.isSuspended }),
            };
          }
          return item;
        })
      );
    }
    
    setMutatingUserId(profileId);
    try {
      const response = await fetch(`/api/super-admin/users/${profileId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        // Revertir optimistic update en caso de error
        if (optimisticUpdate) {
          await fetchUsers(filters);
        }
        const error = await response.json().catch(() => ({}));
        toast.pushToast({
          title: "Error al actualizar usuario",
          description: error.message || "No se pudo completar la operación",
          variant: "error",
        });
        return;
      }
      
      toast.pushToast({
        title: body.isSuspended !== undefined 
          ? (body.isSuspended ? "Usuario suspendido" : "Usuario reactivado")
          : "Usuario actualizado",
        description: "Los cambios se han aplicado correctamente",
        variant: "success",
      });
      
      // Refrescar datos para asegurar sincronización
      await fetchUsers(filters);
    } catch (error: any) {
      // Revertir optimistic update en caso de error
      if (optimisticUpdate) {
        await fetchUsers(filters);
      }
      console.error("Update user failed", error);
      toast.pushToast({
        title: "Error al actualizar usuario",
        description: error.message || "Ocurrió un error inesperado",
        variant: "error",
      });
    } finally {
      setMutatingUserId(null);
    }
  }, [userId, fetchUsers, filters, toast]);

  const mutateUser = useCallback(async (profileId: string, body: Record<string, unknown>, userData?: SuperAdminUserRow) => {
    if (!userId) return;
    
    // Si es una acción destructiva (suspender/reactivar), pedir confirmación
    if (body.isSuspended !== undefined && userData) {
      setPendingAction({ profileId, body, userData });
      setConfirmDialogOpen(true);
      return;
    }
    
    await executeMutation(profileId, body);
  }, [userId, executeMutation]);

  const handleConfirmAction = useCallback(async () => {
    if (pendingAction) {
      await executeMutation(pendingAction.profileId, pendingAction.body);
      setPendingAction(null);
      setConfirmDialogOpen(false);
    }
  }, [pendingAction, executeMutation]);

  return (
    <div className="w-full space-y-6">
      <div className="flex w-full flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 shadow-md sm:rounded-2xl sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-300">Usuarios</p>
          <h2 className="text-lg font-semibold text-white sm:text-xl">Control de roles y estados</h2>
          <p className="break-words text-xs text-slate-300 sm:text-sm">
            {items.length} usuarios listados ·{" "}
            {Object.entries(roleCounts)
              .map(([role, count]) => `${formatRole(role)}: ${count}`)
              .join(" · ")}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            className="border-zaltyko-primary/60 bg-zaltyko-primary/20 text-zaltyko-primary-light hover:border-zaltyko-primary-light hover:bg-zaltyko-primary/30 hover:text-white"
            onClick={handleSyncAthletes}
            disabled={syncing || loading}
          >
            {syncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <Users className="mr-2 h-4 w-4" />
                Sincronizar atletas
              </>
            )}
          </Button>
          <select
            className="h-10 w-full rounded-lg border-2 border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-slate-100 transition-all duration-200 hover:border-white/40 focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/20 min-h-[44px] sm:min-h-[40px] sm:w-auto"
            value={filters.role ?? ""}
            onChange={(event) => {
              const roleValue = event.target.value as typeof ROLE_OPTIONS[number] | "";
              handleFilterChange({ role: roleValue || undefined });
            }}
          >
            <option value="">Rol (todos)</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {formatRole(role)}
              </option>
            ))}
          </select>
          <select
            className="h-10 w-full rounded-lg border-2 border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-slate-100 transition-all duration-200 hover:border-white/40 focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/20 min-h-[44px] sm:min-h-[40px] sm:w-auto"
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
            className="h-10 w-full rounded-lg border-2 border-white/20 bg-white/10 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 transition-all duration-200 focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/20 min-h-[44px] sm:min-h-[40px] sm:max-w-xs"
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

      <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-md sm:rounded-2xl">
        <div className="w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/10 text-xs uppercase tracking-wide text-slate-200">
              <tr>
                <th className="px-3 py-3 text-left font-semibold sm:px-4">Usuario</th>
                <th className="px-3 py-3 text-left font-semibold sm:px-4">Rol</th>
                <th className="px-3 py-3 text-left font-semibold sm:px-4">Estado</th>
                <th className="hidden px-3 py-3 text-left font-semibold sm:table-cell sm:px-4">Plan</th>
                <th className="px-3 py-3 text-right font-semibold sm:px-4">Acciones</th>
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
                    onChange={(event) => {
                      const newRole = event.target.value as typeof ROLE_OPTIONS[number];
                      if (newRole !== user.role && ROLE_OPTIONS.includes(newRole)) {
                        mutateUser(user.id, { role: newRole });
                      }
                    }}
                    disabled={loading || mutatingUserId === user.id || user.role === "super_admin"}
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
                        : "bg-zaltyko-primary/15 text-zaltyko-primary-light",
                    )}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.8} />
                    {user.isSuspended ? "Suspendido" : "Activo"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {user.planCode ? (
                    <span className="inline-flex rounded-full bg-zaltyko-primary/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-zaltyko-primary-light">
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
                      user.isSuspended && "border-zaltyko-primary/40 text-zaltyko-primary-light",
                    )}
                    onClick={() =>
                      mutateUser(user.id, {
                        isSuspended: !user.isSuspended,
                      }, user)
                    }
                    disabled={loading || mutatingUserId === user.id || user.role === "super_admin"}
                  >
                    {mutatingUserId === user.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.8} />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <UserCog className="mr-2 h-4 w-4" strokeWidth={1.8} />
                        {user.isSuspended ? "Reactivar" : "Suspender"}
                      </>
                    )}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      {pendingAction && (
        <ConfirmDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          title={pendingAction.body.isSuspended !== undefined && !pendingAction.userData.isSuspended ? "Suspender usuario" : "Reactivar usuario"}
          description={
            pendingAction.body.isSuspended !== undefined && !pendingAction.userData.isSuspended
              ? `¿Estás seguro de suspender a ${pendingAction.userData.fullName || pendingAction.userData.email}? No podrá acceder al sistema hasta que sea reactivado.`
              : `¿Estás seguro de reactivar a ${pendingAction.userData.fullName || pendingAction.userData.email}? Podrá acceder al sistema nuevamente.`
          }
          variant="destructive"
          confirmText={pendingAction.body.isSuspended !== undefined && !pendingAction.userData.isSuspended ? "Suspender" : "Reactivar"}
          onConfirm={handleConfirmAction}
          onCancel={() => {
            setPendingAction(null);
            setConfirmDialogOpen(false);
          }}
          loading={mutatingUserId === pendingAction?.profileId}
        />
      )}
    </div>
  );
}

