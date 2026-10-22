import { sendEmailWithLogging } from "@/lib/email/email-service";
import { renderReportEmailHtml } from "@/lib/reports/report-export";

export async function sendReportEmail(args: {
  to: string;
  title: string;
  academyName: string;
  academyId: string;
  tenantId: string;
  period?: string;
  summary: Array<[string, string | number]>;
  table?: { headers: string[]; rows: Array<Array<string | number>> };
}): Promise<boolean> {
  const html = renderReportEmailHtml(args);
  return sendEmailWithLogging({
    to: args.to,
    subject: `${args.title} · ${args.academyName}`,
    html,
    template: "report-summary",
    tenantId: args.tenantId,
    academyId: args.academyId,
    metadata: { reportTitle: args.title, period: args.period ?? null },
  });
}
