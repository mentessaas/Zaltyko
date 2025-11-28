import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classExceptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";

/**
 * DELETE /api/classes/[classId]/exceptions/[exceptionId]
 * Elimina una excepción
 */
import { TenantContext } from "@/lib/authz";

async function deleteException(
    request: Request,
    context: TenantContext<{ params: { classId: string; exceptionId: string } }>
) {
    const { params } = context;
    try {
        const { classId, exceptionId } = params;

        const deleted = await db
            .delete(classExceptions)
            .where(
                and(
                    eq(classExceptions.id, exceptionId),
                    eq(classExceptions.classId, classId)
                )
            )
            .returning();

        if (deleted.length === 0) {
            return NextResponse.json(
                { error: "Exception not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Error deleting class exception:", error);
        return NextResponse.json(
            { error: "Error deleting exception" },
            { status: 500 }
        );
    }
}

export const DELETE = withTenant(deleteException);
