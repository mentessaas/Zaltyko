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
import { PageHeader } from "@/components/ui/page-header";
import { StatsCard } from "@/components/ui/stats-card";
import { MailPlus, ShieldCheck, UserCog, Users as UsersIcon } from "lucide-react";

interface UsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UsersAdminPage({ searchParams }: UsersPageProps) {
  const params = await searchParams;
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

  const roleFilterParam = typeof params.role === "string" ? params.role : undefined;
  const queryParam = typeof params.q === "string" ? params.q : undefined;
  const tenantParam = typeof params.tenant === "string" ? params.tenant : undefined;

  const effectiveTenantId = isSuperAdmin
    ? tenantParam ?? profile.tenantId ?? null
    : profile.tenantId;

  const hasTenant = Boolean(effectiveTenantId);

  const filters = [];
  const validRoles = ["super_admin", "admin", "owner", "coach", "athlete", "parent"] as const;

  if (hasTenant && effectiveTenantId) {
    filters.push(eq(profiles.tenantId, effectiveTenantId) as any);
  }

  if (roleFilterParam && validRoles.includes(roleFilterParam as typeof validRoles[number])) {
    filters.push(eq(profiles.role, roleFilterParam as typeof validRoles[number]));
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

  const availableRoles = validRoles.filter((role) =>
    role === "super_admin" ? isSuperAdmin : true
  );

  // Stats
  const roleStats = usersList.reduce((acc, user) => {
    const role = user.role ?? "unknown";
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Equipo" },
        ]}
        title="Equipo"
        description="Gestiona usuarios, roles e invitaciones dentro de tu tenant."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatsCard
          title="Total usuarios"
          value={usersList.length}
          icon={<UsersIcon className="h-6 w-6" strokeWidth={1.5} />}
          variant="default"
        />
        <StatsCard
          title="Propietarios y admins"
          value={(roleStats.owner || 0) + (roleStats.admin || 0)}
          icon={<ShieldCheck className="h-6 w-6" strokeWidth={1.5} />}
          variant="success"
        />
        <StatsCard
          title="Entrenadores"
          value={roleStats.coach || 0}
          icon={<UserCog className="h-6 w-6" strokeWidth={1.5} />}
          variant="info"
        />
        <StatsCard
          title="Invitaciones pendientes"
          value={pendingInvitations.length}
          icon={<MailPlus className="h-6 w-6" strokeWidth={1.5} />}
          variant="warning"
        />
      </div>

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <form className="flex flex-wrap gap-3" method="get">
          <input
            type="search"
            name="q"
            placeholder="Buscar por nombre o correo"
            defaultValue={queryParam ?? ""}
            key={queryParam}
            className="min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            name="role"
            defaultValue={roleFilterParam ?? ""}
            key={roleFilterParam}
            className="min-w-[180px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todos los roles</option>
            {validRoles.map((role) => (
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
              className="min-w-[240px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            Aplicar filtros
          </button>
        </form>
      </section>

      {isSuperAdmin && !hasTenant && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
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
                    className="rounded-md border border-dashed border-border bg-muted/30 p-3"
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

