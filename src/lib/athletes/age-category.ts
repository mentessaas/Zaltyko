import { eq } from "drizzle-orm";
import { db } from "@/db";
import { templateAgeCategories } from "@/db/schema";
import { calculateAge } from "@/lib/date-utils";

export type { TemplateAgeCategory } from "@/db/schema";

/**
 * Map academyType to template discipline
 * Note: "acrobática" (with tilde) maps to "acrobatic" discipline
 */
const ACADEMY_TYPE_TO_DISCIPLINE: Record<string, string> = {
  ritmica: "rhythmic",
  artistica: "artistic_female",
  artistica_femenina: "artistic_female",
  artistica_masculina: "artistic_male",
  trampolin: "trampoline",
  parkour: "parkour",
  acrobática: "acrobatic", // tilde → no tilde for FIG compatibility
  acrobatic: "acrobatic",  // fallback without tilde
  general: "rhythmic",
};

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
}): Promise<{ templateId: string; ageCategory: string } | null> {
  const { dob, academyCountry, academyType } = params;

  const age = calculateAge(dob);
  const discipline = ACADEMY_TYPE_TO_DISCIPLINE[academyType] ?? academyType;

  // Find template matching country code (academy's country = template's countryCode)
  const { templates } = await import("@/db/schema");
  const [template] = await db
    .select()
    .from(templates)
    .where(eq(templates.countryCode, academyCountry))
    .limit(1);

  if (!template) {
    return null;
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
