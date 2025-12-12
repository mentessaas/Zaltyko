import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ReceiptData {
  receiptId: string;
  academyName: string;
  athleteName: string;
  amount: number;
  currency: string;
  period: string;
  items: Array<{
    description: string;
    amount: number;
  }>;
  date: Date;
}

export async function generateReceiptPDF(data: ReceiptData): Promise<Buffer> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = margin;

  // Título
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("RECIBO", pageWidth / 2, yPos, { align: "center" });
  yPos += 15;

  // Información de la academia
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(data.academyName, pageWidth / 2, yPos, { align: "center" });
  yPos += 10;

  // Información del recibo
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Recibo Nº: ${data.receiptId}`, margin, yPos);
  yPos += 5;
  doc.text(`Fecha: ${data.date.toLocaleDateString("es-ES")}`, margin, yPos);
  yPos += 5;
  doc.text(`Periodo: ${data.period}`, margin, yPos);
  yPos += 5;
  doc.text(`Atleta: ${data.athleteName}`, margin, yPos);
  yPos += 15;

  // Conceptos
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Conceptos", margin, yPos);
  yPos += 10;

  const itemsData = data.items.map((item) => [
    item.description,
    `${item.amount.toFixed(2)} ${data.currency}`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [["Descripción", "Importe"]],
    body: itemsData,
    theme: "striped",
    headStyles: { fillColor: [66, 139, 202] },
    margin: { left: margin, right: margin },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Total
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(
    `TOTAL: ${data.amount.toFixed(2)} ${data.currency}`,
    pageWidth - margin,
    yPos,
    { align: "right" }
  );

  // Pie de página
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text(
    "Este es un recibo generado automáticamente",
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 10,
    { align: "center" }
  );

  return Buffer.from(doc.output("arraybuffer"));
}
