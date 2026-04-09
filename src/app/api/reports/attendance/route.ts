export const dynamic = 'force-dynamic';

import { apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import {
  calculateAthleteAttendance,
  calculateGroupAttendance,
  calculateGeneralAttendance,
  type AttendanceReportFilters,
} from "@/lib/reports/attendance-calculator";

const reportSchema = z.object({
  academyId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  athleteId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  reportType: z.enum(["athlete", "group", "general"]).default("general"),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    athleteId: url.searchParams.get("athleteId"),
    groupId: url.searchParams.get("groupId"),
    classId: url.searchParams.get("classId"),
    reportType: url.searchParams.get("reportType") || "general",
  };

  const validated = reportSchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const filters: AttendanceReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
    athleteId: validated.athleteId,
    groupId: validated.groupId,
    classId: validated.classId,
  };

  try {
    switch (validated.reportType) {
      case "athlete":
        if (!validated.athleteId) {
          return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
        }
        const athleteReport = await calculateAthleteAttendance(filters);
        return apiSuccess({ type: "athlete", data: athleteReport });

      case "group":
        if (!validated.groupId) {
          return apiError("GROUP_ID_REQUIRED", "Group ID is required", 400);
        }
        const groupReports = await calculateGroupAttendance(filters);
        return apiSuccess({ type: "group", data: groupReports });

      case "general":
      default:
        const generalStats = await calculateGeneralAttendance(filters);
        return apiSuccess({ type: "general", data: generalStats });
    }
  } catch (error: any) {
    logger.error("Error generating attendance report:", error);
    return apiError("REPORT_FAILED", error.message, 500);
  }
});

