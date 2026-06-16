import { apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";

export const dynamic = 'force-dynamic';

export const POST = withTenant(async () => {
  return apiError("NOT_IMPLEMENTED", "Not implemented", 501);
});
