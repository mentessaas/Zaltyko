import { withFinancialReport } from "@/lib/reports/financial-report-handler";

export const dynamic = "force-dynamic";

// @route-auth tenant
export const GET = withFinancialReport("delinquency");
