import { NextResponse } from "next/server";

import { withTenant } from "@/lib/authz";
import { syncStripePlans } from "@/lib/stripe/sync-plans";

export const POST = withTenant(async (_request, context) => {
  if (context.profile.role !== "super_admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const result = await syncStripePlans();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error syncing Stripe plans", error);
    return NextResponse.json(
      {
        error: "SYNC_FAILED",
        message: error?.message ?? "No se pudo sincronizar con Stripe",
      },
      { status: 500 }
    );
  }
});


