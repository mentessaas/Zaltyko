import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { PublicAcademiesTable } from "@/components/admin/PublicAcademiesTable";

export const dynamic = "force-dynamic";

export default async function SuperAdminPublicAcademiesPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const devSession = await getDevSessionFromCookieStore(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !devSession) {
    redirect("/auth/login");
  }

  const profile = user ? await getCurrentProfile(user.id) : null;
  const effectiveProfile = profile ?? (devSession ? { role: "super_admin" } : null);

  if (!effectiveProfile || effectiveProfile.role !== "super_admin") {
    redirect("/app");
  }

  // Obtener todas las academias con su estado de visibilidad
  const items = await db
    .select({
      id: academies.id,
      name: academies.name,
      academyType: academies.academyType,
      country: academies.country,
      region: academies.region,
      city: academies.city,
      publicDescription: academies.publicDescription,
      logoUrl: academies.logoUrl,
      website: academies.website,
      contactEmail: academies.contactEmail,
      contactPhone: academies.contactPhone,
      address: academies.address,
      socialInstagram: academies.socialInstagram,
      socialFacebook: academies.socialFacebook,
      socialTwitter: academies.socialTwitter,
      socialYoutube: academies.socialYoutube,
      isPublic: academies.isPublic,
    })
    .from(academies)
    .orderBy(academies.name);

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Gestión de Academias Públicas</h1>
        <p className="mt-2 text-white/70">
          Activa o desactiva la visibilidad pública de las academias en el directorio.
        </p>
      </div>

      <PublicAcademiesTable
        academies={items.map((item) => ({
          ...item,
          academyType: String(item.academyType),
        })) as any}
      />
    </div>
  );
}

