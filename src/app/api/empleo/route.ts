import { db } from "@/db";
import { empleoListings } from "@/db/schema";
import { jobCategoryEnum, jobTypeEnum } from "@/db/schema/enums";
import { eq, desc, like, and, count } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/authz";
import { escapeLikeSearch } from "@/lib/helpers";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";

// Validation schemas
const CreateEmpleoSchema = z.object({
  academyId: z.string().uuid().optional(),
  userId: z.string().uuid("Invalid user ID"),
  title: z.string().min(3).max(200),
  category: z.enum(["coach", "assistant_coach", "administrative", "physiotherapist", "psychologist", "other"]),
  description: z.string().max(5000).optional(),
  requirements: z.string().max(5000).optional(),
  location: z.object({
    country: z.string(),
    province: z.string().optional(),
    city: z.string(),
  }).optional(),
  jobType: z.enum(["full_time", "part_time", "internship"]),
  salary: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string(),
    type: z.string(),
  }).optional(),
  howToApply: z.enum(["internal", "external"]).default("internal"),
  externalUrl: z.string().url().optional(),
  deadline: z.string().optional(),
});


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const jobType = searchParams.get("jobType");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

  const conditions = [eq(empleoListings.status, "active")];

  if (category) {
    const validCategory = jobCategoryEnum.enumValues.includes(category as typeof jobCategoryEnum.enumValues[number])
      ? category as typeof jobCategoryEnum.enumValues[number]
      : null;
    if (validCategory) conditions.push(eq(empleoListings.category, validCategory));
  }
  if (jobType) {
    const validJobType = jobTypeEnum.enumValues.includes(jobType as typeof jobTypeEnum.enumValues[number])
      ? jobType as typeof jobTypeEnum.enumValues[number]
      : null;
    if (validJobType) conditions.push(eq(empleoListings.jobType, validJobType));
  }
  if (search) {
    const escaped = escapeLikeSearch(search);
    conditions.push(like(empleoListings.title, `%${escaped}%`));
  }

  const offset = (page - 1) * limit;

  const listings = await db.select()
    .from(empleoListings)
    .where(and(...conditions))
    .orderBy(desc(empleoListings.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db.select({ count: count() })
    .from(empleoListings)
    .where(and(...conditions));

  return apiSuccess({
    items: listings,
    total: countResult?.count ?? 0,
    page,
    pageSize: limit,
  }, { total: countResult?.count ?? 0, page, pageSize: limit });
}

export const POST = withTenant(async (request: Request, context: TenantContext) => {
  try {
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 403);
    }

    const body = await request.json();
    const validated = CreateEmpleoSchema.parse(body);

    const [newListing] = await db.insert(empleoListings).values({
      academyId: validated.academyId,
      userId: context.userId,
      title: validated.title,
      category: validated.category,
      description: validated.description,
      requirements: validated.requirements,
      location: validated.location,
      jobType: validated.jobType,
      salary: validated.salary,
      howToApply: validated.howToApply,
      externalUrl: validated.externalUrl,
      deadline: validated.deadline,
      status: "active",
    }).returning();

    return apiCreated(newListing);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Error de validación", 400);
    }
    console.error("Error creating employment listing:", error);
    return apiError("INTERNAL_ERROR", "Error al crear el listing", 500);
  }
});
