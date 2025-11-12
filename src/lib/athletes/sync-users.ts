import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { athletes, profiles, academies } from "@/db/schema";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Sincroniza atletas existentes con perfiles de usuario.
 * Crea usuarios en auth.users y perfiles en profiles para atletas que no tienen user_id.
 * 
 * @returns Objeto con estadísticas de la sincronización
 */
export async function syncAthletesWithUsers(): Promise<{
  total: number;
  synced: number;
  skipped: number;
  errors: number;
  details: Array<{ athleteId: string; athleteName: string; userId: string | null; error?: string }>;
}> {
  const adminClient = getSupabaseAdminClient();
  const details: Array<{ athleteId: string; athleteName: string; userId: string | null; error?: string }> = [];
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  // Obtener todos los atletas sin user_id
  const athletesWithoutUser = await db
    .select({
      athleteId: athletes.id,
      athleteName: athletes.name,
      tenantId: athletes.tenantId,
      academyId: athletes.academyId,
    })
    .from(athletes)
    .where(isNull(athletes.userId));

  const total = athletesWithoutUser.length;

  for (const athlete of athletesWithoutUser) {
    try {
      // Generar email simulado basado en el nombre del atleta
      const sanitizedName = athlete.athleteName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
        .replace(/[^a-z0-9\s]/g, "") // Eliminar caracteres especiales
        .replace(/\s+/g, "_") // Reemplazar espacios con guiones bajos
        .substring(0, 50); // Limitar longitud

      const email = `${sanitizedName}_${athlete.athleteId.substring(0, 8)}@gymnasaas.local`;

      // Verificar si ya existe un usuario con este email (por si acaso)
      const existingUser = await adminClient.auth.admin.getUserByEmail(email);
      if (existingUser.data?.user) {
        // Si ya existe, usar ese usuario
        const userId = existingUser.data.user.id;
        
        // Verificar si ya tiene un perfil
        const [existingProfile] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .limit(1);

        if (!existingProfile) {
          // Crear perfil si no existe
          await db.insert(profiles).values({
            userId,
            tenantId: athlete.tenantId,
            name: athlete.athleteName,
            role: "athlete",
            activeAcademyId: athlete.academyId,
            canLogin: false,
          });
        }

        // Vincular atleta con usuario
        await db
          .update(athletes)
          .set({ userId })
          .where(eq(athletes.id, athlete.athleteId));

        synced++;
        details.push({
          athleteId: athlete.athleteId,
          athleteName: athlete.athleteName,
          userId,
        });
        continue;
      }

      // Crear nuevo usuario en auth.users
      const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          role: "athlete",
          can_login: false,
          athlete_id: athlete.athleteId,
        },
      });

      if (userError || !userData?.user) {
        errors++;
        details.push({
          athleteId: athlete.athleteId,
          athleteName: athlete.athleteName,
          userId: null,
          error: userError?.message ?? "Error al crear usuario",
        });
        continue;
      }

      const userId = userData.user.id;

      // Crear perfil en profiles
      try {
        await db.insert(profiles).values({
          userId,
          tenantId: athlete.tenantId,
          name: athlete.athleteName,
          role: "athlete",
          activeAcademyId: athlete.academyId,
          canLogin: false,
        });
      } catch (profileError: any) {
        // Si el perfil ya existe (por alguna razón), actualizarlo
        if (profileError?.code === "23505") {
          await db
            .update(profiles)
            .set({
              tenantId: athlete.tenantId,
              name: athlete.athleteName,
              role: "athlete",
              activeAcademyId: athlete.academyId,
              canLogin: false,
            })
            .where(eq(profiles.userId, userId));
        } else {
          throw profileError;
        }
      }

      // Vincular atleta con usuario
      await db
        .update(athletes)
        .set({ userId })
        .where(eq(athletes.id, athlete.athleteId));

      synced++;
      details.push({
        athleteId: athlete.athleteId,
        athleteName: athlete.athleteName,
        userId,
      });
    } catch (error: any) {
      errors++;
      details.push({
        athleteId: athlete.athleteId,
        athleteName: athlete.athleteName,
        userId: null,
        error: error?.message ?? "Error desconocido",
      });
      console.error(`Error sincronizando atleta ${athlete.athleteId}:`, error);
    }
  }

  return {
    total,
    synced,
    skipped,
    errors,
    details,
  };
}

