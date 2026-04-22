import { apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";

export const dynamic = 'force-dynamic';

export const GET = withTenant(async () => {
  return apiSuccess({ items: [], total: 0 });
});
