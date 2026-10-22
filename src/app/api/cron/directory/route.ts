import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { apiSuccess } from "@/lib/api-response";
import { flag } from "@/lib/directory/contracts";
import { maintainDirectory } from "@/lib/directory/maintenance";
import { directoryFailure } from "@/lib/directory/auth";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;
  if (!flag("admin"))
    return apiSuccess({ skipped: true, reason: "DIRECTORY_DISABLED" });
  try {
    const execution = await runCronWithLease(
      "cron:directory",
      maintainDirectory
    );
    return apiSuccess(execution.acquired ? execution.value : { skipped: true });
  } catch (e) {
    return directoryFailure(e);
  }
}
export const POST = GET;
