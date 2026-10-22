import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export interface ReportTable {
  name: string;
  rows: Array<Record<string, unknown>>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createReportWorkbook(tables: ReportTable[]): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const table of tables) {
    const worksheet = XLSX.utils.json_to_sheet(table.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, table.name.slice(0, 31));
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function generateReportTablePdf(args: {
  title: string;
  academyName: string;
  period?: string;
  summary: Array<[string, string | number]>;
  table?: { headers: string[]; rows: Array<Array<string | number>> };
}): Buffer {
  const doc = new jsPDF();
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(args.title, margin, y);
  y += 10;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Academia: ${args.academyName}`, margin, y);
  y += 6;
  if (args.period) {
    doc.text(`Periodo: ${args.period}`, margin, y);
    y += 6;
  }
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Métrica", "Valor"]],
    body: args.summary.map(([label, value]) => [label, String(value)]),
    theme: "striped",
    headStyles: { fillColor: [13, 71, 161] },
    margin: { left: margin, right: margin },
  });

  if (args.table && args.table.rows.length > 0) {
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
    autoTable(doc, {
      startY: y,
      head: [args.table.headers],
      body: args.table.rows.map((row) => row.map((cell) => String(cell))),
      theme: "striped",
      headStyles: { fillColor: [0, 121, 107] },
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text(`Generado el ${new Date().toLocaleDateString("es-ES")}`, margin, doc.internal.pageSize.getHeight() - 10);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin - 30, doc.internal.pageSize.getHeight() - 10);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export function renderReportEmailHtml(args: {
  title: string;
  academyName: string;
  period?: string;
  summary: Array<[string, string | number]>;
  table?: { headers: string[]; rows: Array<Array<string | number>> };
}): string {
  const summaryRows = args.summary
    .map(([label, value]) => `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(label)}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${escapeHtml(value)}</td></tr>`)
    .join("");
  const table = args.table && args.table.rows.length > 0
    ? `<table style="width:100%;border-collapse:collapse;margin-top:20px"><thead><tr>${args.table.headers.map((header) => `<th style="padding:8px;text-align:left;background:#00796b;color:#fff">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${args.table.rows.map((row) => `<tr>${row.map((cell) => `<td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><div style="max-width:680px;margin:0 auto"><h1 style="color:#0d47a1">${escapeHtml(args.title)}</h1><p><strong>Academia:</strong> ${escapeHtml(args.academyName)}${args.period ? ` · <strong>Periodo:</strong> ${escapeHtml(args.period)}` : ""}</p><table style="width:100%;border-collapse:collapse">${summaryRows}</table>${table}<p style="margin-top:24px;color:#64748b;font-size:12px">Informe generado desde Zaltyko.</p></div></body></html>`;
}
