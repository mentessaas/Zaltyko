import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PDFOptions {
  title: string;
  academyName: string;
  logoUrl?: string;
}

export async function generateAttendancePDF(
  data: {
    title: string;
    academyName: string;
    stats: {
      totalSessions: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      attendanceRate: number;
    };
    details?: Array<{
      date: string;
      className: string;
      status: string;
    }>;
  },
  options?: PDFOptions
): Promise<Buffer> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = margin;

  // Título
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.title, margin, yPos);
  yPos += 10;

  // Academia
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Academia: ${data.academyName}`, margin, yPos);
  yPos += 15;

  // Estadísticas
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Estadísticas de Asistencia", margin, yPos);
  yPos += 10;

  const statsData = [
    ["Total Sesiones", data.stats.totalSessions.toString()],
    ["Presentes", data.stats.present.toString()],
    ["Ausentes", data.stats.absent.toString()],
    ["Tarde", data.stats.late.toString()],
    ["Justificados", data.stats.excused.toString()],
    ["Tasa de Asistencia", `${data.stats.attendanceRate.toFixed(2)}%`],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [["Métrica", "Valor"]],
    body: statsData,
    theme: "striped",
    headStyles: { fillColor: [66, 139, 202] },
    margin: { left: margin, right: margin },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Detalles de sesiones si existen
  if (data.details && data.details.length > 0) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Detalle de Sesiones", margin, yPos);
    yPos += 10;

    const detailsData = data.details.map((detail) => [
      detail.date,
      detail.className,
      detail.status,
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [["Fecha", "Clase", "Estado"]],
      body: detailsData,
      theme: "striped",
      headStyles: { fillColor: [66, 139, 202] },
      margin: { left: margin, right: margin },
    });
  }

  // Pie de página
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth - margin - 30,
      doc.internal.pageSize.getHeight() - 10
    );
    doc.text(
      `Generado el ${new Date().toLocaleDateString("es-ES")}`,
      margin,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export async function generateFinancialPDF(
  data: {
    title: string;
    academyName: string;
    period: string;
    revenue: number;
    pending: number;
    paid: number;
  },
  options?: PDFOptions
): Promise<Buffer> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = margin;

  // Título
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.title, margin, yPos);
  yPos += 10;

  // Información
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Academia: ${data.academyName}`, margin, yPos);
  yPos += 5;
  doc.text(`Periodo: ${data.period}`, margin, yPos);
  yPos += 15;

  // Estadísticas financieras
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Resumen Financiero", margin, yPos);
  yPos += 10;

  const financialData = [
    ["Ingresos Totales", `${data.revenue.toFixed(2)} €`],
    ["Pagado", `${data.paid.toFixed(2)} €`],
    ["Pendiente", `${data.pending.toFixed(2)} €`],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [["Concepto", "Monto"]],
    body: financialData,
    theme: "striped",
    headStyles: { fillColor: [66, 139, 202] },
    margin: { left: margin, right: margin },
  });

  // Pie de página
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth - margin - 30,
      doc.internal.pageSize.getHeight() - 10
    );
    doc.text(
      `Generado el ${new Date().toLocaleDateString("es-ES")}`,
      margin,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  return Buffer.from(doc.output("arraybuffer"));
}
