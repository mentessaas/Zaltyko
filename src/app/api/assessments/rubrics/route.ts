import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";

export const dynamic = 'force-dynamic';

export const GET = withTenant(async () => {
  return apiSuccess([], { total: 0 });
});

export const POST = withTenant(async () => {
  return apiError("NOT_IMPLEMENTED", "Not implemented", 501);
});
