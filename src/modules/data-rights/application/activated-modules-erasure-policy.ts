/**
 * Política revisada de supresión y conservación de las tablas activadas en
 * producción el 12-11-2026 (objetivos y observaciones, titulares y
 * sustituciones, guion de sesión, solicitudes de prueba y acceso de equipo).
 *
 * Describe lo que hace PostgreSQL con las claves foráneas al borrar una
 * gimnasta, una pertenencia o una academia, y al suprimir una cuenta con
 * `account-erasure.ts` (tras el candidato de supresión de cuentas). No es un
 * procedimiento de borrado ni lo autoriza: ningún flujo de Zaltyko borra
 * gimnastas, fichas del equipo ni academias (se archivan), y el plan de
 * disposición sigue bloqueado.
 * `tests/data-rights-activated-modules-contract.test.ts` deduce cada efecto
 * de los candidatos SQL y falla si esta tabla y el SQL dejan de coincidir.
 */

/**
 * - `cascade_delete`: la fila se borra con el titular (directamente o porque
 *   cuelga en cascada de otra fila que se borra).
 * - `set_null`: la fila se conserva y la referencia al titular queda vacía.
 * - `blocks`: una clave NO ACTION/RESTRICT hace fallar el borrado hasta que
 *   alguien resuelva antes esa referencia. Nada se borra a medias.
 * - `not_linked`: la fila no depende del titular.
 */
export type ErasureEffect = "cascade_delete" | "set_null" | "blocks" | "not_linked";

export type ActivatedModule =
  | "athlete_progress"
  | "coach_assignment"
  | "session_plans"
  | "admissions"
  | "team_access";

export interface ActivatedTableErasurePolicy {
  table: string;
  module: ActivatedModule;
  /** Exportación de academia: valores (`values`) o solo recuento (`count_only`). */
  academyExport: "values" | "count_only";
  /** Borrar `zaltyko.athletes` (la ficha de la gimnasta). */
  onAthleteErasure: ErasureEffect;
  /** Borrar `zaltyko.organization_members` (la pertenencia de una cuenta a la academia). */
  onMemberErasure: ErasureEffect;
  /**
   * Suprimir la cuenta con el procedimiento de `account-erasure.ts`, que
   * requiere `docs/deployment/candidates/20261114120000_account_erasure_candidate.sql`.
   * La pertenencia (`organization_members`) no se borra: queda revocada y con
   * `user_id` vacío, así que la autoría por pertenencia no cambia (`not_linked`).
   * Es el efecto de las claves a `auth.users` tras ese candidato. Sin él, la
   * supresión responde 503 y no borra nada.
   */
  onAuthAccountErasure: ErasureEffect;
  /** Borrar `zaltyko.organizations`: todas cuelgan de la academia en cascada. */
  onAcademyErasure: "cascade_delete";
  retention: ActivatedTableRetention;
}

export type ActivatedTableRetention =
  | {
      kind: "while_academy_exists";
      /** Sin plazo propio ni borrado automático. */
      automaticAfterDays: null;
    }
  | {
      kind: "manual_anonymization_of_declined";
      /** Columna que marca la supresión; el CHECK exige estado `declined`. */
      marker: "anonymized_at";
      /** Columnas que el CHECK obliga a vaciar al anonimizar. */
      clearedColumns: readonly string[];
      /** Columnas que el servidor sustituye por un texto fijo. */
      replacedColumns: readonly string[];
      /** Sin plazo automático: la propuesta de 90 días espera decisión legal. */
      automaticAfterDays: null;
      proposedAfterDays: 90;
      status: "pending_legal_decision";
    };

const kept = { kind: "while_academy_exists", automaticAfterDays: null } as const;

function policy(
  table: string,
  module: ActivatedModule,
  academyExport: "values" | "count_only",
  onAthleteErasure: ErasureEffect,
  onMemberErasure: ErasureEffect,
  onAuthAccountErasure: ErasureEffect,
  retention: ActivatedTableRetention = kept
): ActivatedTableErasurePolicy {
  return {
    table,
    module,
    academyExport,
    onAthleteErasure,
    onMemberErasure,
    onAuthAccountErasure,
    onAcademyErasure: "cascade_delete",
    retention,
  };
}

export const ACTIVATED_MODULES_ERASURE_POLICY: readonly ActivatedTableErasurePolicy[] = [
  // Objetivos y observaciones: se borran con la gimnasta. La autoría de una
  // integrante del equipo es NO ACTION: borrar la pertenencia no puede borrar
  // el historial. Al suprimir la cuenta, la pertenencia se conserva revocada.
  policy("athlete_objectives", "athlete_progress", "values", "cascade_delete", "blocks", "not_linked"),
  policy("athlete_objective_status_history", "athlete_progress", "values", "cascade_delete", "blocks", "not_linked"),
  policy("athlete_observations", "athlete_progress", "values", "cascade_delete", "blocks", "not_linked"),
  // Titulares y sustituciones: quien asignó o sustituyó queda vacío (set null).
  policy("class_template_staff", "coach_assignment", "values", "not_linked", "set_null", "not_linked"),
  policy("session_staff_overrides", "coach_assignment", "values", "not_linked", "set_null", "not_linked"),
  // Guion de sesión: los vínculos a objetivos se borran con la gimnasta; el
  // guion y sus bloques son de la sesión y conservan su autoría.
  policy("session_plans", "session_plans", "values", "not_linked", "blocks", "not_linked"),
  policy("session_plan_blocks", "session_plans", "values", "not_linked", "blocks", "not_linked"),
  policy("session_plan_objectives", "session_plans", "values", "cascade_delete", "not_linked", "not_linked"),
  policy("class_plan_templates", "session_plans", "values", "not_linked", "blocks", "not_linked"),
  // Solicitudes de prueba: datos de contacto de familias y nombre/año de
  // nacimiento de menores. Una solicitud convertida sigue apuntando a la
  // gimnasta (NO ACTION): borrar esa ficha exige decidir antes qué hacer con
  // la solicitud. Las descartadas se pueden anonimizar.
  policy("admission_links", "admissions", "values", "not_linked", "blocks", "not_linked"),
  policy("admission_requests", "admissions", "values", "blocks", "blocks", "not_linked", {
    kind: "manual_anonymization_of_declined",
    marker: "anonymized_at",
    clearedColumns: ["contact_phone", "message", "athlete_birth_year"],
    replacedColumns: ["contact_name", "contact_email", "athlete_given_name"],
    automaticAfterDays: null,
    proposedAfterDays: 90,
    status: "pending_legal_decision",
  }),
  // Acceso de equipo: credenciales e identificadores de Auth; solo recuento.
  // Al suprimir la cuenta, la invitación aceptada conserva accepted_member_id
  // y vacía accepted_by_user_id; los recibos de reintento se borran.
  policy("organization_member_invitations", "team_access", "count_only", "not_linked", "blocks", "set_null"),
  policy("organization_member_invitation_scopes", "team_access", "count_only", "not_linked", "not_linked", "not_linked"),
  policy("organization_team_command_receipts", "team_access", "count_only", "not_linked", "blocks", "cascade_delete"),
];

const duplicated = ACTIVATED_MODULES_ERASURE_POLICY.map((entry) => entry.table).filter(
  (table, index, tables) => tables.indexOf(table) !== index
);
if (duplicated.length > 0) {
  throw new Error(`Duplicate activated-module erasure policy: ${duplicated.join(", ")}`);
}
