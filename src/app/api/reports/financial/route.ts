export const dynamic = 'force-dynamic';

import { withFinancialReport } from "@/lib/reports/financial-report-handler";

// @route-auth tenant
export const GET = withFinancialReport("summary");
