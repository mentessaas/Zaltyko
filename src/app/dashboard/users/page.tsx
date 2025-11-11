import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  authUsers,
  invitations,
  memberships,
  profileRoleEnum,
  profiles,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import InviteUserForm from "@/components/admin/InviteUserForm";
import { getRoleLabel } from "@/lib/roles";

interface UsersPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function UsersAdminPage({ searchParams }: UsersPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/dashboard");
  }

  const isSuperAdmin = profile.role === "super_admin";
  const isAdmin = isSuperAdmin || profile.role === "admin" || profile.role === "owner";

  if (!isAdmin) {
    redirect("/dashboard");
  }

  const roleFilterParam = typeof searchParams.role === "string" ? searchParams.role : undefined;
  const queryParam = typeof searchParams.q === "string" ? searchParams.q : undefined;
  const tenantParam = typeof searchParams.tenant === "string" ? searchParams.tenant : undefined;

  const effectiveTenantId = isSuperAdmin
    ? tenantParam ?? profile.tenantId ?? null
    : profile.tenantId;

  const hasTenant = Boolean(effectiveTenantId);

  const filters = [];

  if (hasTenant) {
    filters.push(eq(profiles.tenantId, effectiveTenantId));
  }

  if (roleFilterParam && profileRoleEnum.enumValues.includes(roleFilterParam)) {
    filters.push(eq(profiles.role, roleFilterParam));
  }

  if (queryParam) {
    const pattern = `%${queryParam}%`;
    filters.push(
      or(
        ilike(authUsers.email, pattern),
        ilike(profiles.name, pattern)
      )
    );
  }

  const whereClause =
    filters.length === 0 ? undefined : and(...filters);

  const academyCount = sql<number>`count(distinct ${memberships.academyId})`.as("academyCount");

  const usersList = hasTenant
    ? await db
        .select({
          id: profiles.id,
          name: profiles.name,
          role: profiles.role,
          email: authUsers.email,
          createdAt: profiles.createdAt,
          academyCount,
        })
        .from(profiles)
        .leftJoin(authUsers, eq(authUsers.id, profiles.userId))
        .leftJoin(memberships, eq(memberships.userId, profiles.userId))
        .where(whereClause)
        .groupBy(
          profiles.id,
          profiles.name,
          profiles.role,
          profiles.createdAt,
          authUsers.email
        )
        .orderBy(asc(authUsers.email))
        .limit(200)
    : [];

  const pendingInvitations = hasTenant
    ? await db
        .select({
          id: invitations.id,
          email: invitations.email,
          role: invitations.role,
          status: invitations.status,
          expiresAt: invitations.expiresAt,
          createdAt: invitations.createdAt,
        })
        .from(invitations)
        .where(
          and(eq(invitations.tenantId, effectiveTenantId!), eq(invitations.status, "pending"))
        )
        .orderBy(sql`${invitations.createdAt} desc`)
        .limit(50)
    : [];

  const academyOptions = hasTenant
    ? await db
        .select({
          id: academies.id,
          name: academies.name,
        })
        .from(academies)
        .where(eq(academies.tenantId, effectiveTenantId!))
        .orderBy(asc(academies.name))
    : [];

  const availableRoles = profileRoleEnum.enumValues.filter((role) =>
    role === "super_admin" ? isSuperAdmin : true
  );

  return (
    <div className="space-y-8 p-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Usuarios de la academia</h1>
            <p className="text-muted-foreground">
              Gestiona roles, invitaciones y membresías dentro del tenant.
            </p>
          </div>
        </div>

        <form className="flex flex-wrap gap-3 pt-4" method="get">
          <input
            type="search"
            name="q"
            placeholder="Buscar por nombre o correo"
            defaultValue={queryParam ?? ""}
            className="flex-1 min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          />
          <select
            name="role"
            defaultValue={roleFilterParam ?? ""}
            className="min-w-[180px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          >
            <option value="">Todos los roles</option>
            {profileRoleEnum.enumValues.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          {isSuperAdmin && (
            <input
              type="text"
              name="tenant"
              placeholder="Tenant ID"
              defaultValue={tenantParam ?? ""}
              className="min-w-[240px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
          )}
          <button
            type="submit"
            className="rounded-md bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:from-emerald-300 hover:to-lime-200"
          >
            Aplicar filtros
          </button>
        </form>
      </header>

      {isSuperAdmin && !hasTenant && (
        <div className="rounded-md border border-dashed border-emerald-300 bg-emerald-50/50 p-4 text-sm text-emerald-900">
          Selecciona un tenant en el filtro para visualizar usuarios e invitar nuevos miembros.
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border bg-card shadow">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium text-right">Academias</th>
                <th className="px-4 py-3 font-medium">Creado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background text-foreground">
              {usersList.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    {hasTenant
                      ? "No hay usuarios que coincidan con los filtros."
                      : "Selecciona un tenant para empezar."}
                  </td>
                </tr>
              )}
              {usersList.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.email ?? "—"}</td>
                  <td className="px-4 py-3">{row.name ?? "Pendiente"}</td>
                  <td className="px-4 py-3 capitalize">{row.role.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(row.academyCount ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.createdAt ? row.createdAt.toLocaleDateString("es-ES") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4 shadow">
            <h2 className="text-lg font-semibold">Invitar nuevo usuario</h2>
            <p className="text-sm text-muted-foreground">
              Envía un acceso personalizado según el rol y academias disponibles.
            </p>
            <InviteUserForm
              tenantId={effectiveTenantId ?? undefined}
              availableRoles={availableRoles}
              academies={academyOptions}
              disabled={!hasTenant}
              showTenantSelector={isSuperAdmin}
              defaultTenant={tenantParam ?? profile.tenantId ?? ""}
            />
          </div>

          <div className="rounded-lg border bg-card p-4 shadow">
            <h2 className="text-lg font-semibold">Invitaciones pendientes</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {pendingInvitations.length === 0 ? (
                <li className="text-muted-foreground">No hay invitaciones activas.</li>
              ) : (
                pendingInvitations.map((invite) => (
                  <li
                    key={invite.id}
                    className="rounded-md border border-dashed border-emerald-200 bg-emerald-50/70 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{invite.email}</p>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Rol: {getRoleLabel(invite.role)}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Expira:{" "}
                        {invite.expiresAt
                          ? new Date(invite.expiresAt).toLocaleDateString("es-ES")
                          : "—"}
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}


