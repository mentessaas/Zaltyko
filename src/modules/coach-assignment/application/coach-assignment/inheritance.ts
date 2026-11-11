import { sql } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

import { isCoachAssignmentStorageAvailable } from "./storage";

/**
 * Las sesiones recién generadas de una clase heredan sus titulares. La llama
 * session-service.insertTemplateSessionsInRange dentro de su transacción y
 * bajo el cerrojo de la plantilla, con los ids que acaba de insertar. Sin el
 * candidato aplicado no hace nada: la generación de sesiones sigue igual.
 */
export async function inheritClassCoachesForNewSessions(
  tx: TransactionClient,
  input: { organizationId: string; classTemplateId: string; sessionIds: readonly string[] }
): Promise<number> {
  if (input.sessionIds.length === 0) return 0;
  if (!(await isCoachAssignmentStorageAvailable(tx))) return 0;
  const result = await tx.execute(sql`
    insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id, assignment_role)
    select session.organization_id, session.id, titular.staff_profile_id, 'coach'
    from zaltyko.sessions session
    join zaltyko.class_template_staff titular
      on titular.organization_id = session.organization_id
     and titular.class_template_id = session.class_template_id
    where session.organization_id = ${input.organizationId}::uuid
      and session.class_template_id = ${input.classTemplateId}::uuid
      and session.id = any(${sqlUuidArray([...input.sessionIds])})
    on conflict (organization_id, session_id, staff_profile_id) do update set assignment_role = 'coach'
  `);
  return result.rowCount ?? 0;
}
