import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  LEGACY_APP_FALLBACK,
  LEGACY_APP_REDIRECTS,
  LEGACY_APP_SEGMENT_DESTINATIONS,
  legacyAppDestination,
  ownerPathForLegacyAppSegment,
} from "@/lib/launch/legacy-app-redirects.mjs";
import { resolveAcademyWorkspaceUrl } from "@/lib/auth/academy-workspace";
import { getPreferredHomePath } from "@/lib/product/roles";
import { ITEM_ROUTES } from "@/lib/onboarding-routes";
import { NEXT_STEP_URLS } from "@/lib/onboarding/next-step-urls";

const ROOT = process.cwd();
const ACADEMY = "11111111-1111-4111-8111-111111111111";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

describe("retirada del panel antiguo /app", () => {
  it("el árbol src/app/app ya no existe", () => {
    expect(existsSync(join(ROOT, "src/app/app"))).toBe(false);
  });

  it("redirige /app y sus subrutas al equivalente de /owner (o /familia)", () => {
    const cases: Array<[string, string]> = [
      ["/app", "/owner"],
      ["/app/", "/owner"],
      [`/app/${ACADEMY}`, "/owner"],
      [`/app/${ACADEMY}/dashboard`, "/owner"],
      [`/app/${ACADEMY}/dashboard/at-a-glance`, "/owner"],
      [`/app/${ACADEMY}/athletes`, "/owner/athletes"],
      [`/app/${ACADEMY}/athletes/abc/progress`, "/owner/athletes"],
      [`/app/${ACADEMY}/athletes/abc/documents`, "/owner/athletes"],
      [`/app/${ACADEMY}/classes/xyz/recurring`, "/owner/classes"],
      [`/app/${ACADEMY}/groups`, "/owner/groups"],
      [`/app/${ACADEMY}/attendance/today`, "/owner/attendance"],
      [`/app/${ACADEMY}/coach/today-simple`, "/owner/attendance"],
      [`/app/${ACADEMY}/coaches`, "/owner/staff"],
      [`/app/${ACADEMY}/billing/receipts`, "/owner/payments"],
      [`/app/${ACADEMY}/trials`, "/owner/requests"],
      [`/app/${ACADEMY}/my-dashboard`, "/familia"],
      [`/app/${ACADEMY}/my-events`, "/familia"],
      // Sin equivalente: acaban en el inicio de /owner.
      [`/app/${ACADEMY}/reports/financial`, "/owner"],
      [`/app/${ACADEMY}/licenses`, "/owner"],
      [`/app/${ACADEMY}/settings`, "/owner"],
      [`/app/${ACADEMY}/events/e1/register`, "/owner"],
      ["/app/athlete/a1/public-page", "/owner"],
      ["/app/coach/c1/public-page", "/owner"],
      ["/app/supplier/s1/public-page", "/owner"],
    ];
    for (const [from, to] of cases) {
      expect(legacyAppDestination(from), from).toBe(to);
    }
    expect(legacyAppDestination("/apple")).toBeNull();
    expect(legacyAppDestination("/owner/athletes")).toBeNull();
  });

  it("la lista de next.config cubre cada segmento del mapa y termina en un comodín", () => {
    const sources = LEGACY_APP_REDIRECTS.map(([source]) => source);
    for (const segment of Object.keys(LEGACY_APP_SEGMENT_DESTINATIONS)) {
      expect(sources).toContain(`/app/:academyId/${segment}`);
      expect(sources).toContain(`/app/:academyId/${segment}/:path*`);
    }
    expect(sources.slice(-2)).toEqual(["/app", "/app/:path*"]);
    for (const [source, destination] of LEGACY_APP_REDIRECTS) {
      expect(source.startsWith("/app")).toBe(true);
      expect(destination).toMatch(/^\/(?:owner|familia)(?:\/|$)/);
      // El academyId de la URL antigua nunca se reutiliza en el destino.
      expect(destination).not.toContain(":");
    }
  });

  it("next.config.mjs aplica la lista con redirect permanente", () => {
    const config = readFileSync(join(ROOT, "next.config.mjs"), "utf8");
    expect(config).toContain("LEGACY_APP_REDIRECTS.map(([source, destination]) => ({ source, destination, permanent: true }))");
  });

  it("los enlaces internos, el login y el onboarding ya no apuntan a /app", async () => {
    expect(ownerPathForLegacyAppSegment("dashboard")).toBe(LEGACY_APP_FALLBACK);
    expect(
      getPreferredHomePath({ profileRole: "owner", membershipRole: "owner", academyId: ACADEMY })
    ).toBe("/owner");
    expect(
      getPreferredHomePath({ profileRole: "coach", membershipRole: "coach", academyId: ACADEMY })
    ).toBe("/owner/attendance");
    expect(
      getPreferredHomePath({ profileRole: "parent", membershipRole: "viewer", academyId: ACADEMY })
    ).toBe("/familia");
    for (const item of Object.values(ITEM_ROUTES)) {
      expect(item.href(ACADEMY)).toMatch(/^\/(?:owner|familia)/);
    }
    for (const url of Object.values(NEXT_STEP_URLS)) {
      expect(url.startsWith("/app")).toBe(false);
    }
    expect(typeof resolveAcademyWorkspaceUrl).toBe("function");
  });

  it("ningún archivo de src enlaza a /app (salvo compatibilidad documentada)", () => {
    const allowed = new Set([
      "src/components/notifications/NotificationCenter.tsx", // data.url antiguo, lo resuelve el redirect
      "src/components/ui/install-prompt.tsx",
      "src/app/robots.ts", // Disallow: /app para que los buscadores lo olviden
      "src/lib/launch/legacy-app-redirects.mjs",
      "src/lib/athletes/legacy-import-csv.ts", // comentario histórico
    ]);
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      const rel = relative(ROOT, file);
      if (allowed.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      if (/["'`]\/app(?:\/|["'`?])/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("no quedan rutas ni APIs de datos de salud de gimnastas", () => {
    for (const path of [
      "src/app/api/athletes/[athleteId]/documents",
      "src/app/api/licenses",
      "src/components/athletes/AthleteDocumentsSection.tsx",
      "src/components/athletes/DocumentUploadModal.tsx",
      "src/components/athletes/AthleteDocumentsList.tsx",
      "src/components/licenses/CreateLicenseDialog.tsx",
    ]) {
      expect(existsSync(join(ROOT, path)), path).toBe(false);
    }
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      const rel = relative(ROOT, file);
      // Los espejos Drizzle se conservan hasta aplicar la candidata SQL.
      if (rel.startsWith("src/db/")) continue;
      const text = readFileSync(file, "utf8");
      if (/athleteDocuments|athlete_documents|medicalCertificate|medical_certificate_expiry/.test(text)) {
        offenders.push(rel);
      }
    }
    // src/types/athletes.ts conserva la etiqueta del tipo de documento hasta la candidata.
    expect(offenders.filter((f) => f !== "src/types/athletes.ts")).toEqual([]);
  });

  it("lo que queda de las rutas retiradas no importa el esquema antiguo", () => {
    // Las rutas y componentes retirados se borraron enteros: ningún archivo
    // bajo los directorios de /app existe, así que no puede importarlo.
    expect(existsSync(join(ROOT, "src/app/app"))).toBe(false);
    for (const file of walk(join(ROOT, "src/components/athletes"))) {
      expect(readFileSync(file, "utf8")).not.toMatch(/from "@\/db\/schema[^"]*athlete-documents"/);
    }
  });

  it("la candidata SQL de salud existe, es destructiva y está protegida", () => {
    const sql = readFileSync(
      join(ROOT, "docs/deployment/candidates/20261114120000_retire_legacy_health_data_candidate.sql"),
      "utf8"
    );
    expect(sql).toContain("CANDIDATE ONLY");
    expect(sql).toContain("No aplicado en ningún entorno");
    expect(sql).toContain("zaltyko.retire_health_data");
    expect(sql).toContain("drop table if exists public.athlete_documents");
    expect(sql).toContain("drop column if exists medical_certificate_expiry");
    expect(existsSync(join(ROOT, "supabase/migrations/20261114120000_retire_legacy_health_data_candidate.sql"))).toBe(false);
  });
});
