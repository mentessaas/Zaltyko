import { z } from "zod";
import { sql } from "drizzle-orm";
import { directoryRequest } from "@/lib/directory/auth";
import {
  rows,
  getEntry,
  materializeOperationalEntry,
} from "@/lib/directory/service";
import { apiSuccess, apiError } from "@/lib/api-response";
// @auth-flexible route-guard-reason: verified account; favorites only reference eligible public directory entries.
export async function POST(request: Request) {
  return directoryRequest(request, async (user) => {
    const { entryId, save } = z
      .object({ entryId: z.string().uuid(), save: z.boolean() })
      .parse(await request.json());
    if (save && !(await getEntry(entryId)))
      return apiError("NOT_FOUND", "Ficha no disponible", 404);
    if (save) await materializeOperationalEntry(entryId);
    if (save)
      await rows(
        sql`INSERT INTO directory_favorites(user_id,entry_id) VALUES(${user.id}::uuid,${entryId}::uuid) ON CONFLICT DO NOTHING`
      );
    else
      await rows(
        sql`DELETE FROM directory_favorites WHERE user_id=${user.id}::uuid AND entry_id=${entryId}::uuid`
      );
    return apiSuccess({ saved: save });
  });
}
