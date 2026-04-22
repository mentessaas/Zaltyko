import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { templateAgeCategories } from "@/db/schema";
import { calculateAge } from "@/lib/date-utils";
import { inferDisciplineVariantFromAcademyType, normalizeCountryCode } from "@/lib/specialization/registry";

export type { TemplateAgeCategory } from "@/db/schema";

/**
 * Calculate ageCategory for an athlete based on DOB and academy
 * Returns { templateId, ageCategory } or null if no match
 *
 * @param dob - Date of birth
 * @param academyCountry - Country from academy (e.g., "ES", "FR")
 * @param academyType - Academy type (e.g., "ritmica", "artistica")
 */
export async function calculateAgeCategoryForAthlete(params: {
  dob: Date;
  academyCountry: string;
  academyType: string;
  disciplineVariant?: string | null;
}): Promise<{ templateId: string; ageCategory: string } | null> {
  const { dob, academyCountry, academyType, disciplineVariant } = params;

  const age = calculateAge(dob);
  const countryCode = normalizeCountryCode(academyCountry);
  const resolvedDisciplineVariant =
    disciplineVariant ?? inferDisciplineVariantFromAcademyType(academyType);

  // Find template matching country code (academy's country = template's countryCode)
  const { templates } = await import("@/db/schema");
  const [template] = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.countryCode, countryCode ?? academyCountry),
        eq(templates.discipline, resolvedDisciplineVariant)
      )
    )
    .limit(1);

  if (!template) {
    const [fallbackTemplate] = await db
      .select()
      .from(templates)
      .where(eq(templates.countryCode, countryCode ?? academyCountry))
      .limit(1);

    if (!fallbackTemplate) {
      return null;
    }

    const categories = await db
      .select()
      .from(templateAgeCategories)
      .where(eq(templateAgeCategories.templateId, fallbackTemplate.id));

    const matchingCategory = categories.find(
      (cat) => age >= cat.minAge && age <= cat.maxAge
    );

    if (!matchingCategory) {
      return null;
    }

    return {
      templateId: fallbackTemplate.id,
      ageCategory: matchingCategory.code,
    };
  }

  // Find matching age category based on age
  const categories = await db
    .select()
    .from(templateAgeCategories)
    .where(eq(templateAgeCategories.templateId, template.id));

  // Find category where age falls within minAge-maxAge range
  const matchingCategory = categories.find(
    (cat) => age >= cat.minAge && age <= cat.maxAge
  );

  if (!matchingCategory) {
    return null;
  }

  return {
    templateId: template.id,
    ageCategory: matchingCategory.code,
  };
}
