import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O3 · contrato estático del candidato de acceso de equipo y de las guardas
 * del servicio que las pruebas de PostgreSQL ejercitan. Si alguien quita una
 * guarda (por ejemplo `status='pending'` en el consumo del token), esto falla
 * aunque la carrera no se reproduzca en una ejecución concreta.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const CANDIDATE = "docs/deployment/candidates/20261105120000_canonical_team_access_candidate.sql";
const SERVICE = "src/modules/staff/application/canonical-team-access.ts";
const MANIFEST = "src/modules/staff/application/canonical-team-access-schema.ts";
const TABLES = ["organization_member_invitations", "organization_member_invitation_scopes", "organization_team_command_receipts"];

describe("candidato SQL de acceso de equipo", () => {
  const sql = read(CANDIDATE).toLowerCase();

  it("se marca como pendiente de autorización y fuerza RLS con REVOKE en las tres tablas", () => {
    expect(sql).toContain("requiere autorización de elvis");
    for (const table of TABLES) {
      expect(sql, table).toContain(`alter table zaltyko.${table} enable row level security;`);
      expect(sql, table).toContain(`alter table zaltyko.${table} force row level security;`);
      expect(sql, table).toContain(`zaltyko.${table}`);
    }
    expect(sql).toMatch(/revoke all on table zaltyko\.organization_member_invitations, zaltyko\.organization_member_invitation_scopes,\s+zaltyko\.organization_team_command_receipts from public, anon, authenticated;/);
    expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/\bgrant\b|create policy/);
  });

  it("admite una sola invitación pendiente por ficha del equipo, también en el manifiesto exacto", () => {
    expect(sql).toContain("create unique index organization_member_invitations_pending_profile_uq\n  on zaltyko.organization_member_invitations(organization_id,staff_profile_id) where status='pending' and staff_profile_id is not null;");
    expect(read(MANIFEST)).toContain(`index(["organization_id", "staff_profile_id"], true, false, "status='pending'::text AND staff_profile_id IS NOT NULL")`);
  });

  it("exige exactamente un destino y deja documentados el borrado de fichas y la conservación", () => {
    expect(sql).toContain("check ((staff_profile_id is not null and invitee_given_name is null and invitee_family_name is null)");
    const fk = sql.match(/foreign key \(organization_id, staff_profile_id\) references zaltyko\.staff_profiles\(organization_id,id\)[^\n]*/)![0];
    expect(fk).not.toMatch(/on delete/);
    expect(sql).toContain("no flow deletes team profiles");
    expect(sql).toContain("retention: closed invitations keep email and names");
  });
});

describe("guardas del servicio de acceso de equipo", () => {
  const source = read(SERVICE);

  it("el consumo del token solo actualiza una invitación pendiente y no caducada", () => {
    const consume = source.match(/update zaltyko\.organization_member_invitations set status='accepted'[\s\S]*?returning id`\)/)?.[0] ?? "";
    expect(consume).toContain("and status='pending'");
    expect(consume).toContain("and expires_at>clock_timestamp()");
    expect(source).toContain("if (consumed.rows.length !== 1) throw invalidInvitation();");
  });

  it("solo guarda el hash del token y lo genera con 256 bits", () => {
    expect(source).toContain("randomBytes(32).toString(\"base64url\")");
    expect(source).not.toMatch(/insert into zaltyko\.organization_member_invitations[\s\S]{0,200}\$\{token\}/);
  });

  it("no se fía solo de email_confirmed_at: exige una identidad verificada para ese correo", () => {
    expect(source).toContain("email_confirmed_at is not null");
    expect(source).toContain("from auth.identities i");
    expect(source).toContain("i.provider='email'");
    expect(source).toContain("identity_data->>'email_verified'");
  });
});
