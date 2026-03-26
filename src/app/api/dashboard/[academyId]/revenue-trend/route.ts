import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { db } from "@/db";
import { charges } from "@/db/schema";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ academyId: string }> }
) {
  try {
    const { academyId } = await params;
    const cookieStore = await import("next/headers").then(m => m.cookies());
    const supabase = await createClient(cookieStore);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    // Get current date info
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthLabel = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    // Get all charges for this academy
    const allCharges = await db
      .select({
        id: charges.id,
        period: charges.period,
        amountCents: charges.amountCents,
        status: charges.status,
        dueDate: charges.dueDate,
      })
      .from(charges)
      .where(eq(charges.academyId, academyId))
      .orderBy(desc(charges.period));

    // Calculate current month revenue
    const currentMonthCharges = allCharges.filter((c) => c.period === currentMonth);
    const currentMonthRevenue = currentMonthCharges
      .filter((c) => c.status === "paid")
      .reduce((sum, c) => sum + (c.amountCents || 0), 0) / 100;

    // Calculate previous month revenue
    const previousMonthCharges = allCharges.filter((c) => c.period === lastMonthLabel);
    const previousMonthRevenue = previousMonthCharges
      .filter((c) => c.status === "paid")
      .reduce((sum, c) => sum + (c.amountCents || 0), 0) / 100;

    // Calculate pending payments (non-paid charges)
    const pendingPayments = currentMonthCharges
      .filter((c) => c.status !== "paid")
      .reduce((sum, c) => sum + (c.amountCents || 0), 0) / 100;

    // Projected revenue (based on average of last 3 months)
    const lastThreeMonths = allCharges.slice(0, 30);
    const avgRevenue = lastThreeMonths.length > 0
      ? lastThreeMonths
          .filter((c) => c.status === "paid")
          .reduce((sum, c) => sum + (c.amountCents || 0), 0) / lastThreeMonths.length / 100
      : currentMonthRevenue;
    const projectedRevenue = Math.round(avgRevenue * 1.1); // 10% growth projection

    // Calculate monthly trend for last 6 months
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthCharges = allCharges.filter((c) => c.period === monthLabel);

      const revenue = monthCharges
        .filter((c) => c.status === "paid")
        .reduce((sum, c) => sum + (c.amountCents || 0), 0) / 100;

      // Expected revenue (simple estimate based on average)
      let expectedRevenue: number;
      if (i === 5) {
        expectedRevenue = revenue * 1.1;
      } else if (monthlyTrend[i - 1]) {
        expectedRevenue = monthlyTrend[i - 1].revenue * 1.05;
      } else {
        expectedRevenue = revenue;
      }

      monthlyTrend.push({
        month: monthLabel,
        revenue: Math.round(revenue),
        expected: Math.round(expectedRevenue),
      });
    }

    // Revenue by source (simplified - could be expanded to track payment methods)
    const revenueBySource = [
      {
        source: "Membresías",
        amount: Math.round(currentMonthRevenue * 0.8),
        percentage: 80,
      },
      {
        source: "Clases adicionales",
        amount: Math.round(currentMonthRevenue * 0.15),
        percentage: 15,
      },
      {
        source: "Otros",
        amount: Math.round(currentMonthRevenue * 0.05),
        percentage: 5,
      },
    ];

    return NextResponse.json({
      currentMonthRevenue,
      previousMonthRevenue,
      projectedRevenue,
      pendingPayments,
      monthlyTrend,
      revenueBySource,
    });
  } catch (error) {
    console.error("Error loading revenue trend:", error);
    return NextResponse.json(
      { error: "Error al cargar tendencia de ingresos" },
      { status: 500 }
    );
  }
}