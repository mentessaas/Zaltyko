import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { athletes } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const GET = withTenant(async (req, context) => {
    try {
        const { userId, tenantId } = context;
        const { params } = context;
        const athleteId = params?.id;

        if (!athleteId) {
            return new NextResponse("Athlete ID is required", { status: 400 });
        }

        const [athlete] = await db
            .select()
            .from(athletes)
            .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, tenantId)))
            .limit(1);

        if (!athlete) {
            return new NextResponse("Athlete not found", { status: 404 });
        }

        return NextResponse.json(athlete);
    } catch (error) {
        console.error("Error fetching athlete:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
});

export const PUT = withTenant(async (req, context) => {
    try {
        const { userId, tenantId } = context;
        const { params } = context;
        const athleteId = params?.id;

        if (!athleteId) {
            return new NextResponse("Athlete ID is required", { status: 400 });
        }

        const body = await req.json();

        // Verify the athlete belongs to the tenant
        const [existing] = await db
            .select()
            .from(athletes)
            .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, tenantId)))
            .limit(1);

        if (!existing) {
            return new NextResponse("Athlete not found", { status: 404 });
        }

        const [updated] = await db
            .update(athletes)
            .set({
                ...body,
                updatedAt: new Date(),
            })
            .where(eq(athletes.id, athleteId))
            .returning();

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating athlete:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
});

export const DELETE = withTenant(async (req, context) => {
    try {
        const { userId, tenantId } = context;
        const { params } = context;
        const athleteId = params?.id;

        if (!athleteId) {
            return new NextResponse("Athlete ID is required", { status: 400 });
        }

        // Verify the athlete belongs to the tenant
        const [existing] = await db
            .select()
            .from(athletes)
            .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, tenantId)))
            .limit(1);

        if (!existing) {
            return new NextResponse("Athlete not found", { status: 404 });
        }

        await db.delete(athletes).where(eq(athletes.id, athleteId));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting athlete:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
});
