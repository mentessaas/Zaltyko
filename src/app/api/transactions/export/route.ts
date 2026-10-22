export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, athletes, charges } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";

export const runtime = "nodejs";

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const tenantOverride = url.searchParams.get("tenantId");
  const effectiveTenantId = context.profile.role === "super_admin"
    ? tenantOverride ?? context.tenantId ?? null
    : context.tenantId;

  if (!effectiveTenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const academyId = url.searchParams.get("academyId");
  if (academyId && !z.string().uuid().safeParse(academyId).success) {
    return NextResponse.json({ error: "INVALID_ACADEMY_ID" }, { status: 400 });
  }
  if (academyId) {
    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: effectiveTenantId,
      academyId,
      permission: "billing:read",
    });
    if (!scope.allowed) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
  }
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const status = url.searchParams.get("status");
  const format = url.searchParams.get("format") || "csv";

  const whereConditions = [
    eq(charges.tenantId, effectiveTenantId),
    academyId ? eq(charges.academyId, academyId) : undefined,
    startDate ? gte(charges.dueDate, startDate) : undefined,
    endDate ? lte(charges.dueDate, endDate) : undefined,
    status ? eq(charges.status, status as any) : undefined,
  ].filter(Boolean);

  let whereClause: ReturnType<typeof sql> | undefined;
  for (const condition of whereConditions) {
    whereClause = whereClause ? and(whereClause, condition) : condition;
  }

  const rows = await db
    .select({
      id: charges.id,
      label: charges.label,
      amountCents: charges.amountCents,
      currency: charges.currency,
      period: charges.period,
      dueDate: charges.dueDate,
      status: charges.status,
      paymentMethod: charges.paymentMethod,
      paidAt: charges.paidAt,
      athleteName: athletes.name,
      academyName: academies.name,
    })
    .from(charges)
    .leftJoin(
      athletes,
      and(
        eq(charges.athleteId, athletes.id),
        eq(athletes.tenantId, effectiveTenantId),
        eq(athletes.academyId, charges.academyId)
      )
    )
    .leftJoin(academies, and(eq(charges.academyId, academies.id), eq(academies.tenantId, effectiveTenantId)))
    .where(whereClause)
    .orderBy(asc(charges.dueDate))
    .limit(10000);

  // Evita CSV/XLSX injection cuando un usuario controla nombres o etiquetas
  // que empiezan por =, +, -, @ y Excel los interpreta como fórmulas.
  const safeSpreadsheetText = (value: string | null | undefined): string => {
    const text = value ?? "";
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  };

  // Helper para formatear fecha
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return "";
    if (typeof date === "object" && date instanceof Date) {
      return date.toISOString().split("T")[0];
    }
    const dateStr = String(date);
    return dateStr.split("T")[0];
  };

  // Helper para formatear monto
  const formatAmount = (cents: number, currency: string): string => {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  };

  // Helper para formatear status
  const formatStatus = (status: string): string => {
    const statusMap: Record<string, string> = {
      pending: "Pendiente",
      paid: "Pagado",
      cancelled: "Cancelado",
      refunded: "Reembolsado",
      failed: "Fallido",
    };
    return statusMap[status] || status;
  };

  // Helper para formatear payment method
  const formatPaymentMethod = (method: string | null): string => {
    if (!method) return "";
    const methodMap: Record<string, string> = {
      card: "Tarjeta",
      transfer: "Transferencia",
      cash: "Efectivo",
      stripe: "Stripe",
      paypal: "PayPal",
    };
    return methodMap[method] || method;
  };

  if (format === "excel") {
    // Export a Excel usando XLSX
    const XLSX = await import("xlsx");

    const exportRows = rows.map((row) => ({
      ID: row.id,
      Descripción: safeSpreadsheetText(row.label),
      Monto: formatAmount(row.amountCents, row.currency),
      Moneda: row.currency,
      Periodo: row.period,
      "Fecha de vencimiento": formatDate(row.dueDate),
      Estado: formatStatus(row.status),
      "Método de pago": formatPaymentMethod(row.paymentMethod),
      "Fecha de pago": formatDate(row.paidAt),
      Atleta: safeSpreadsheetText(row.athleteName),
      Academia: safeSpreadsheetText(row.academyName),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transacciones");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="transacciones-${Date.now()}.xlsx"`,
        "Content-Length": buffer.byteLength.toString(),
      },
    });
  }

  // Export a CSV por defecto
  const headers = [
    "ID",
    "Descripción",
    "Monto",
    "Moneda",
    "Periodo",
    "Fecha de vencimiento",
    "Estado",
    "Método de pago",
    "Fecha de pago",
    "Atleta",
    "Academia",
  ];

  const csvRows = rows.map((row) => [
    row.id,
    `"${safeSpreadsheetText(row.label).replace(/"/g, '""')}"`,
    formatAmount(row.amountCents, row.currency),
    row.currency,
    row.period,
    formatDate(row.dueDate),
    formatStatus(row.status),
    formatPaymentMethod(row.paymentMethod),
    formatDate(row.paidAt),
    `"${safeSpreadsheetText(row.athleteName).replace(/"/g, '""')}"`,
    `"${safeSpreadsheetText(row.academyName).replace(/"/g, '""')}"`,
  ]);

  const csvContent = [
    headers.join(","),
    ...csvRows.map((row) => row.join(",")),
  ].join("\n");

  const buffer = Buffer.from(csvContent, "utf-8");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transacciones-${Date.now()}.csv"`,
      "Content-Length": buffer.byteLength.toString(),
    },
  });
});
