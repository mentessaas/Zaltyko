import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { assertAcademyOwner } from "@/lib/actor-pages/guard";

/**
 * Página de configuración de subdominio.
 *
 * TODO(2026-09-24): restaurar la lectura de `public_slug` y `subdomain_enabled`
 * cuando se añada la migration. Mientras tanto mostramos un notice con instrucciones
 * para que el owner solicite el cambio vía soporte.
 */
export default async function SubdomainSettingsPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await assertAcademyOwner(academyId, user))) notFound();

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
        Configuración de subdominio
      </h1>
      <p style={{ color: "#475569", lineHeight: 1.6 }}>
        Las columnas <code>public_slug</code> y <code>subdomain_enabled</code> aún
        no están migradas en la tabla <code>academies</code> (auditoría E2E
        2026-09-24). Solicita tu subdominio por soporte hasta que la migración
        esté disponible.
      </p>
      <p style={{ marginTop: "1rem" }}>
        AcademiaId: <code>{academyId}</code>
      </p>
    </main>
  );
}