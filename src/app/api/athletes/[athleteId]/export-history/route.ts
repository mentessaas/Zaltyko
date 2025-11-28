import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { generateAttendancePDF } from "@/lib/reports/pdf-generator";

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const athleteId = (context.params as { athleteId?: string } | undefined)?.athleteId;

  if (!athleteId) {
    return NextResponse.json({ error: "ATHLETE_ID_REQUIRED" }, { status: 400 });
  }

  try {
    // Obtener historial completo
    const historyResponse = await fetch(
      `${request.url.split("/export-history")[0]}/history`,
      {
        headers: {
          cookie: request.headers.get("cookie") || "",
        },
      }
    );

    if (!historyResponse.ok) {
      throw new Error("Error al obtener historial");
    }

    const historyData = await historyResponse.json();

    // Generar PDF (placeholder hasta instalar jsPDF)
    const pdfBuffer = await generateAttendancePDF({
      title: `Historial de Evaluaciones`,
      academyName: "Academia", // TODO: obtener nombre real
      stats: {
        totalSessions: historyData.items?.length || 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        attendanceRate: 0,
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="historial-${athleteId}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Error exporting history:", error);
    return NextResponse.json(
      { error: "EXPORT_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

