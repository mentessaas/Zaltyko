/* eslint-disable no-console */
import "dotenv/config";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";

// Mapeo de regiones a ciudades por defecto
const REGION_CITY_MAP: Record<string, string> = {
  // España
  madrid: "Madrid",
  "pais-vasco": "Bilbao",
  andalucia: "Sevilla",
  catalunya: "Barcelona",
  valencia: "Valencia",
  // México
  bc: "Tijuana",
  cmx: "Ciudad de México",
  nl: "Monterrey",
  jal: "Guadalajara",
  // Otras regiones comunes
  bilbao: "Bilbao",
  "baja-california": "Tijuana",
};

async function updateAcademiesCities() {
  try {
    console.log("🔄 Actualizando ciudades de academias existentes...\n");

    // Obtener todas las academias
    const allAcademies = await db.select().from(academies);

    console.log(`📊 Encontradas ${allAcademies.length} academias en total\n`);

    let updated = 0;
    let skipped = 0;

    for (const academy of allAcademies) {
      // Si ya tiene ciudad y no está vacía, saltar
      if (academy.city && academy.city.trim() !== "") {
        console.log(`⏭️  ${academy.name}: Ya tiene ciudad (${academy.city})`);
        skipped++;
        continue;
      }
      let cityToSet: string | null = null;

      // Si tiene región, intentar mapear a ciudad
      if (academy.region) {
        const regionLower = academy.region.toLowerCase();
        // Buscar coincidencia exacta o parcial
        const matchedKey = Object.keys(REGION_CITY_MAP).find(
          (key) => regionLower.includes(key) || key.includes(regionLower)
        );
        if (matchedKey) {
          cityToSet = REGION_CITY_MAP[matchedKey];
        }
      }

      // Si no se encontró ciudad por región, usar valores por defecto según país
      if (!cityToSet && academy.country) {
        const countryUpper = academy.country.toUpperCase();
        if (countryUpper === "ES" || countryUpper === "ESP") {
          // Para España, usar la región como ciudad si no hay mapeo
          cityToSet = academy.region || "Madrid";
        } else if (countryUpper === "MX" || countryUpper === "MEX") {
          // Para México, usar la región como ciudad si no hay mapeo
          cityToSet = academy.region || "Ciudad de México";
        }
      }

      // Si aún no hay ciudad, usar un valor por defecto genérico
      if (!cityToSet) {
        cityToSet = academy.region || "Ciudad principal";
      }

      // Actualizar la academia
      await db
        .update(academies)
        .set({ city: cityToSet })
        .where(eq(academies.id, academy.id));

      console.log(`✅ ${academy.name}: ${cityToSet}`);
      updated++;
    }

    console.log(`\n✨ Proceso completado:`);
    console.log(`   - Actualizadas: ${updated}`);
    console.log(`   - Omitidas: ${skipped}`);
  } catch (error) {
    console.error("❌ Error actualizando ciudades:", error);
    process.exit(1);
  }
}

updateAcademiesCities()
  .then(() => {
    console.log("\n🎉 ¡Actualización completada!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error);
    process.exit(1);
  });

