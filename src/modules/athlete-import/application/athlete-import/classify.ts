/**
 * Decides, row by row and in file order, what the import does. Pure: the
 * preview and the confirmation (under the organization lock) call it with the
 * same rows and their own reading of the academy, so both always agree.
 */
import {
  type AthleteImportField,
  athleteDuplicateKey,
  athleteNameKey,
  type ImportIssue,
  nameKey,
  type NormalizedImportRow,
} from "../../domain/athlete-import-rows";
import type {
  AthleteImportRowStatus,
  Classified,
  ExistingAthlete,
  ExistingContact,
  GroupRow,
  ImportContext,
  PlannedRow,
} from "./model";

function issue(
  severity: ImportIssue["severity"],
  field: AthleteImportField | null,
  code: string,
  message: string
): ImportIssue {
  return { severity, field, code, message };
}

const personKey = (person: { givenName: string; familyName: string }) =>
  `${nameKey(person.givenName)}|${nameKey(person.familyName)}`;

/**
 * Duplicates (conservative):
 * - with a date of birth: same name and date in the academy (archived too) or
 *   earlier in the file; the same name with no date also stops the row;
 * - without a date of birth: any athlete with the same name stops the row.
 *
 * Tutors: an email or phone that belongs to one active tutor of the academy
 * reuses that tutor's family only when the tutor's name matches too and the
 * tutor has exactly one active family. Shared contacts or a different name
 * are row errors, never a guess.
 *
 * @internal Uso exclusivo de athlete-import/*; la API pública está en
 * athlete-import-service.ts.
 */
export function classifyImportRows(
  rows: readonly NormalizedImportRow[],
  context: Omit<ImportContext, "today">
): Classified[] {
  const groupsByName = new Map<string, GroupRow[]>();
  for (const group of context.groups) {
    const key = nameKey(group.name);
    groupsByName.set(key, [...(groupsByName.get(key) ?? []), group]);
  }
  const existingExact = new Map<string, ExistingAthlete>();
  const existingByName = new Map<string, ExistingAthlete[]>();
  for (const athlete of context.athletes) {
    if (athlete.dateOfBirth !== null) existingExact.set(athleteDuplicateKey(athlete), athlete);
    const key = athleteNameKey(athlete);
    existingByName.set(key, [...(existingByName.get(key) ?? []), athlete]);
  }
  const guardiansByContact = new Map<string, Map<string, ExistingContact>>();
  for (const contact of context.contacts) {
    const key = `${contact.kind}:${contact.value}`;
    const guardians = guardiansByContact.get(key) ?? new Map<string, ExistingContact>();
    guardians.set(contact.guardianId, contact);
    guardiansByContact.set(key, guardians);
  }

  const seenExact = new Map<string, number>();
  const seenByName = new Map<string, Array<{ row: number; dated: boolean }>>();
  const familyKeyByContact = new Map<string, { key: string; row: number; tutor: string }>();
  const takenByGroup = new Map<string, number>();
  const remaining =
    context.usage.limit === null ? Number.POSITIVE_INFINITY : Math.max(0, context.usage.limit - context.usage.current);
  let planned = 0;

  return rows.map((row) => {
    const issues = [...row.issues];
    const values = {
      givenName: row.givenName,
      familyName: row.familyName,
      dateOfBirth: row.dateOfBirth,
      group: row.group,
      guardianName: row.guardian ? `${row.guardian.givenName} ${row.guardian.familyName}`.trim() : null,
      guardianEmail: row.guardian?.email ?? null,
      guardianPhone: row.guardian?.phone ?? null,
    };
    const done = (status: AthleteImportRowStatus, plan: PlannedRow | null = null): Classified => ({
      preview: { row: row.row, status, issues, values },
      plan,
    });
    const fail = (status: AthleteImportRowStatus, field: AthleteImportField | null, code: string, message: string) => {
      issues.push(issue("error", field, code, message));
      return done(status);
    };

    if (issues.some((item) => item.severity === "error")) return done("error");

    // Duplicates in the file.
    const nameOnly = athleteNameKey(row);
    const sameNameInFile = seenByName.get(nameOnly) ?? [];
    const exactKey = row.dateOfBirth ? athleteDuplicateKey(row) : null;
    const firstExact = exactKey ? seenExact.get(exactKey) : undefined;
    const undatedEarlier = sameNameInFile.find((entry) => !row.dateOfBirth || !entry.dated);
    seenByName.set(nameOnly, [...sameNameInFile, { row: row.row, dated: Boolean(row.dateOfBirth) }]);
    if (exactKey && firstExact === undefined) seenExact.set(exactKey, row.row);
    if (firstExact !== undefined) {
      return fail("duplicate", null, "DUPLICATE_IN_FILE", `Repite la gimnasta de la fila ${firstExact} (mismo nombre y fecha de nacimiento).`);
    }
    if (undatedEarlier) {
      return fail(
        "duplicate",
        null,
        "DUPLICATE_IN_FILE_POSSIBLE",
        `Puede ser la misma gimnasta de la fila ${undatedEarlier.row}: mismo nombre y alguna de las dos sin fecha de nacimiento.`
      );
    }

    // Duplicates in the academy.
    const existing = exactKey ? existingExact.get(exactKey) : undefined;
    if (existing) {
      return fail(
        "duplicate",
        null,
        "DUPLICATE_EXISTING",
        existing.isActive
          ? "Ya existe en la academia una gimnasta con el mismo nombre y fecha de nacimiento."
          : "Ya existe una gimnasta archivada con el mismo nombre y fecha de nacimiento; reactívala desde su ficha."
      );
    }
    const sameName = existingByName.get(nameOnly) ?? [];
    if (row.dateOfBirth ? sameName.some((athlete) => athlete.dateOfBirth === null) : sameName.length > 0) {
      return fail(
        "duplicate",
        null,
        "DUPLICATE_POSSIBLE",
        row.dateOfBirth
          ? "Ya existe una gimnasta con este nombre sin fecha de nacimiento. Revisa su ficha antes de importarla."
          : "Ya existe una gimnasta con este nombre y la fila no tiene fecha de nacimiento para distinguirlas."
      );
    }

    let group: GroupRow | null = null;
    if (row.group) {
      const matches = groupsByName.get(nameKey(row.group)) ?? [];
      if (matches.length === 0) {
        return fail("error", "group", "GROUP_NOT_FOUND", "No hay ningún grupo activo con ese nombre en la academia.");
      }
      if (matches.length > 1) {
        return fail("error", "group", "GROUP_AMBIGUOUS", "Hay varios grupos activos con ese nombre; renombra uno para distinguirlos.");
      }
      group = matches[0]!;
    }

    let existingFamilyId: string | null = null;
    let newFamilyKey = `row:${row.row}`;
    const guardian = row.guardian;
    if (guardian && (guardian.email || guardian.phone)) {
      const byEmail = guardian.email ? [...(guardiansByContact.get(`email:${guardian.email}`)?.values() ?? [])] : [];
      const byPhone = guardian.phone ? [...(guardiansByContact.get(`phone:${guardian.phone}`)?.values() ?? [])] : [];
      if (byEmail.length > 1 || byPhone.length > 1) {
        return fail(
          "error",
          byEmail.length > 1 ? "guardianEmail" : "guardianPhone",
          "GUARDIAN_AMBIGUOUS",
          "Ese contacto lo comparten varios tutores de la academia; da de alta a esta gimnasta desde Gimnastas."
        );
      }
      if (byEmail[0] && byPhone[0] && byEmail[0].guardianId !== byPhone[0].guardianId) {
        return fail(
          "error",
          "guardianEmail",
          "GUARDIAN_CONFLICT",
          "El email y el teléfono del tutor pertenecen a dos tutores distintos de la academia."
        );
      }
      const known = byEmail[0] ?? byPhone[0];
      if (known) {
        if (personKey(known) !== personKey(guardian)) {
          return fail(
            "error",
            "guardianGivenName",
            "GUARDIAN_NAME_MISMATCH",
            "Ese email o teléfono ya es de otro tutor de la academia con un nombre distinto. Revisa el nombre o el contacto."
          );
        }
        if (known.familyIds.length !== 1) {
          return fail(
            "error",
            "guardianEmail",
            "GUARDIAN_FAMILY_UNCLEAR",
            known.familyIds.length === 0
              ? "El tutor ya existe pero no tiene una familia activa; da de alta a esta gimnasta desde Gimnastas."
              : "El tutor ya existe en varias familias; da de alta a esta gimnasta desde Gimnastas para elegir la familia."
          );
        }
        existingFamilyId = known.familyIds[0]!;
        issues.push(
          issue("warning", "guardianEmail", "GUARDIAN_EXISTING", "El tutor ya está en la academia: la gimnasta se añade a su familia.")
        );
      } else {
        const viaEmail = guardian.email ? familyKeyByContact.get(`email:${guardian.email}`) : undefined;
        const viaPhone = guardian.phone ? familyKeyByContact.get(`phone:${guardian.phone}`) : undefined;
        if (viaEmail && viaPhone && viaEmail.key !== viaPhone.key) {
          return fail(
            "error",
            "guardianEmail",
            "GUARDIAN_CONFLICT_IN_FILE",
            `El email del tutor coincide con la fila ${viaEmail.row} y el teléfono con la fila ${viaPhone.row}.`
          );
        }
        const sibling = viaEmail ?? viaPhone;
        if (sibling && sibling.tutor !== personKey(guardian)) {
          return fail(
            "error",
            "guardianGivenName",
            "GUARDIAN_NAME_MISMATCH_IN_FILE",
            `Ese email o teléfono del tutor aparece en la fila ${sibling.row} con otro nombre. Unifica el tutor.`
          );
        }
        if (sibling) {
          newFamilyKey = sibling.key;
          issues.push(issue("warning", null, "SIBLING", `Comparte tutor con la fila ${sibling.row}: irán a la misma familia.`));
        }
        // Every contact of this tutor points to the family, so a later row
        // with only the other contact joins it too.
        const owner = sibling ?? { key: newFamilyKey, row: row.row, tutor: personKey(guardian) };
        if (guardian.email && !viaEmail) familyKeyByContact.set(`email:${guardian.email}`, owner);
        if (guardian.phone && !viaPhone) familyKeyByContact.set(`phone:${guardian.phone}`, owner);
      }
    }

    if (group) {
      const taken = takenByGroup.get(group.groupId) ?? 0;
      if (group.capacity !== null && group.occupancy + taken >= group.capacity) {
        return fail("skipped", "group", "GROUP_FULL", "El grupo no tiene plazas libres.");
      }
    }
    if (planned >= remaining) {
      return fail(
        "skipped",
        null,
        "PLAN_LIMIT",
        `Supera el límite de ${context.usage.limit ?? 0} gimnastas de tu plan. Amplía el plan para importarla.`
      );
    }
    planned += 1;
    if (group) takenByGroup.set(group.groupId, (takenByGroup.get(group.groupId) ?? 0) + 1);
    return done("create", { row, group, existingFamilyId, newFamilyKey });
  });
}
