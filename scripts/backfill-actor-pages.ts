#!/usr/bin/env tsx
/**
 * Backfill inicial para T1: crea una actor_pages por academia existente.
 *
 * Comportamiento:
 *   - Para cada academy con public_slug no nulo:
 *       crea actor_pages(entity_type='academy', entity_id, public_slug, ...)
 *     con public_visible = true y bloques básicos.
 *   - Idempotente: si ya existe actor_pages para (entity_type, entity_id), no crea duplicado.
 *
 * Uso:
 *   pnpm exec tsx scripts/backfill-actor-pages.ts --dry-run
 *   pnpm exec tsx scripts/backfill-actor-pages.ts
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, actorPages } from "@/db/schema";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

interface CreatedRow {
  academyId: string;
  academyName: string;
  slug: string;
}

async function main() {
  console.log(
    `[backfill-actor-pages] inicio ${dryRun ? "(DRY RUN)" : ""}`
  );

  const allAcademies = await db
    .select({
      id: academies.id,
      name: academies.name,
      city: academies.city,
      // publicSlug no existe en el schema actual; derivar de name.slugify() en runtime
      publicDescription: academies.publicDescription,
      logoUrl: academies.logoUrl,
      website: academies.website,
      contactEmail: academies.contactEmail,
      contactPhone: academies.contactPhone,
      socialInstagram: academies.socialInstagram,
    })
    .from(academies);

  let created = 0;
  let skipped = 0;
  const createdRows: CreatedRow[] = [];

  for (const a of allAcademies) {
    // publicSlug: derivar desde name (schema actual no expone publicSlug column)
    const publicSlug = a.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!publicSlug) {
      skipped++;
      continue;
    }

    const existing = await db
      .select({ id: actorPages.id })
      .from(actorPages)
      .where(
        and(
          eq(actorPages.entityType, "academy"),
          eq(actorPages.entityId, a.id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const socialLinks: Record<string, string> = {};
    if (a.socialInstagram) socialLinks.instagram = a.socialInstagram;

    const bioBlocks = [
      {
        type: "heading",
        heading: "Sobre nosotros",
      },
      {
        type: "text",
        text:
          a.publicDescription ??
          `${a.name} es una academia de gimnasia en Zaltyko. Reserva tu clase de prueba.`,
      },
    ];

    const row = {
      tenantId: null,
      academyId: a.id,
      entityType: "academy" as const,
      entityId: a.id,
      publicSlug: publicSlug,
      publicVisible: true,
      publishedAt: new Date(),
      displayName: a.name,
      tagline: a.city ? `Academia de gimnasia en ${a.city}` : "Academia de gimnasia",
      bioBlocks,
      photoUrl: a.logoUrl ?? null,
      contactEmail: a.contactEmail ?? null,
      contactPhone: a.contactPhone ?? null,
      socialLinks,
      theme: { primary_color: "#3b82f6" },
      seoTitle: `${a.name}${a.city ? ` - ${a.city}` : ""} | Zaltyko`,
      seoDescription:
        a.publicDescription ??
        `${a.name}${a.city ? `, academia de gimnasia en ${a.city}` : ""}. Reserva online y consulta horarios.`,
      seoImageUrl: a.logoUrl ?? null,
      language: "es",
      autoTranslate: false,
      consentStatus: "not_required" as const,
    };

    if (!dryRun) {
      await db.insert(actorPages).values(row);
    }
    created++;
    createdRows.push({
      academyId: a.id,
      academyName: a.name,
      slug: publicSlug,
    });
  }

  console.log(`[backfill-actor-pages] academias procesadas: ${allAcademies.length}`);
  console.log(`[backfill-actor-pages] creadas: ${created}`);
  console.log(`[backfill-actor-pages] saltadas (ya tenían slug o actor_page): ${skipped}`);

  if (createdRows.length > 0 && createdRows.length <= 20) {
    console.log("[backfill-actor-pages] detalle:");
    for (const r of createdRows) {
      console.log(`  - ${r.academyName} → zaltyko.com/a/${r.slug}`);
    }
  } else if (createdRows.length > 20) {
    console.log(
      `[backfill-actor-pages] (mostrando primeras 20 de ${createdRows.length})`
    );
    for (const r of createdRows.slice(0, 20)) {
      console.log(`  - ${r.academyName} → zaltyko.com/a/${r.slug}`);
    }
  }

  if (dryRun) {
    console.log("[backfill-actor-pages] DRY RUN: no se escribieron filas.");
  } else {
    console.log("[backfill-actor-pages] hecho.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-actor-pages] ERROR:", err);
  process.exit(1);
});
