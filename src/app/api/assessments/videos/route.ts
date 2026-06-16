import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { uploadFile, generateFilePath } from "@/lib/supabase/storage-helpers";
import { db } from "@/db";
import { assessmentVideos, athleteAssessments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const fd = formData as unknown as { get(name: string): unknown };
    const file = fd.get("file") as File;
    const academyId = fd.get("academyId") as string;
    const assessmentId = fd.get("assessmentId") as string;

    if (!file) {
      return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    }

    if (!academyId) {
      return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
    }

    if (!assessmentId) {
      return NextResponse.json({ error: "ASSESSMENT_ID_REQUIRED" }, { status: 400 });
    }

    // Verify assessment exists and belongs to tenant
    const [assessment] = await db
      .select({ id: athleteAssessments.id, tenantId: athleteAssessments.tenantId })
      .from(athleteAssessments)
      .where(and(eq(athleteAssessments.id, assessmentId), eq(athleteAssessments.tenantId, context.tenantId)))
      .limit(1);

    if (!assessment) {
      return NextResponse.json({ error: "ASSESSMENT_NOT_FOUND" }, { status: 404 });
    }

    // Validate video type
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "INVALID_FILE_TYPE", message: "Solo se permiten videos (MP4, WebM, MOV)" },
        { status: 400 }
      );
    }

    // Validate size (100MB max for videos)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE", message: "El video no puede ser mayor a 100MB" },
        { status: 400 }
      );
    }

    // Generate unique path
    const fileName = generateFilePath(context.tenantId, academyId, "assessment-videos", file.name);

    // Upload to Supabase Storage
    const { url, path } = await uploadFile(file, fileName, {
      contentType: file.type,
      upsert: false,
    });

    // Save to database
    const videoId = crypto.randomUUID();
    await db.insert(assessmentVideos).values({
      id: videoId,
      assessmentId: assessmentId,
      url: url,
      title: file.name.replace(/\.[^/.]+$/, ""),
    });

    return NextResponse.json({
      ok: true,
      id: videoId,
      url,
      path,
    });
  } catch (error: any) {
    logger.error("Error uploading assessment video:", error);
    return NextResponse.json(
      { error: "UPLOAD_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

export const DELETE = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("id");

    if (!videoId) {
      return NextResponse.json({ error: "VIDEO_ID_REQUIRED" }, { status: 400 });
    }

    // Find video and verify tenant access
    const [video] = await db
      .select({ id: assessmentVideos.id, assessmentId: assessmentVideos.assessmentId })
      .from(assessmentVideos)
      .where(eq(assessmentVideos.id, videoId))
      .limit(1);

    if (!video) {
      return NextResponse.json({ error: "VIDEO_NOT_FOUND" }, { status: 404 });
    }

    // Verify tenant via assessment
    const [assessment] = await db
      .select({ id: athleteAssessments.id, tenantId: athleteAssessments.tenantId })
      .from(athleteAssessments)
      .where(and(eq(athleteAssessments.id, video.assessmentId), eq(athleteAssessments.tenantId, context.tenantId)))
      .limit(1);

    if (!assessment) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Delete from database
    await db.delete(assessmentVideos).where(eq(assessmentVideos.id, videoId));

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    logger.error("Error deleting assessment video:", error);
    return NextResponse.json(
      { error: "DELETE_FAILED", message: error.message },
      { status: 500 }
    );
  }
});