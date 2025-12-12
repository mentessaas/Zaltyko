import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
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
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
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
          return NextResponse.json({ error: "ATHLETE_ID_REQUIRED" }, { status: 400 });
        }
        const athleteReport = await calculateAthleteAttendance(filters);
        return NextResponse.json({ type: "athlete", data: athleteReport });

      case "group":
        if (!validated.groupId) {
          return NextResponse.json({ error: "GROUP_ID_REQUIRED" }, { status: 400 });
        }
        const groupReports = await calculateGroupAttendance(filters);
        return NextResponse.json({ type: "group", data: groupReports });

      case "general":
      default:
        const generalStats = await calculateGeneralAttendance(filters);
        return NextResponse.json({ type: "general", data: generalStats });
    }
  } catch (error: any) {
    console.error("Error generating attendance report:", error);
    return NextResponse.json(
      { error: "REPORT_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

