import { z } from "zod";
import { sql } from "drizzle-orm";
import { directoryRequest } from "@/lib/directory/auth";
import {
  rows,
  getEntry,
  materializeOperationalEntry,
} from "@/lib/directory/service";
import { EntryInputSchema } from "@/lib/directory/contracts";
import { apiCreated, apiError } from "@/lib/api-response";
// @auth-flexible route-guard-reason: verified account, limits and validation; suggestions never publish directly.
export async function POST(request: Request) {
  return directoryRequest(request, async (user) => {
    const body = z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("proposal"), entry: EntryInputSchema }),
        z.object({
          kind: z.enum(["correction", "removal"]),
          entryId: z.string().uuid(),
          message: z.string().trim().min(10).max(2000),
        }),
      ])
      .parse(await request.json());
    const entryId = body.kind === "proposal" ? null : body.entryId;
    if (entryId && !(await getEntry(entryId)))
      return apiError("NOT_FOUND", "Ficha no disponible", 404);
    if (entryId) await materializeOperationalEntry(entryId);
    const result = await rows(
      sql`INSERT INTO directory_revisions(entry_id,user_id,kind,data) VALUES(${entryId}::uuid,${user.id}::uuid,${body.kind},${JSON.stringify(body.kind === "proposal" ? body.entry : { message: body.message })}::jsonb) RETURNING id,status`
    );
    return apiCreated(result[0]);
  });
}
