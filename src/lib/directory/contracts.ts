import { z } from "zod";

export const kinds = ["academy", "event", "organization"] as const;
export type DirectoryKind = (typeof kinds)[number];
export const publicationStates = [
  "draft",
  "pending",
  "published",
  "withdrawn",
] as const;
export const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Utiliza un enlace HTTPS sin credenciales");
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
const plainText = z
  .string()
  .trim()
  .max(10000)
  .refine((v) => !/[<>]/.test(v), "Utiliza texto sin HTML");
export const EntryDataSchema = z
  .object({
    name: z.string().trim().min(3).max(200),
    description: plainText.default(""),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((v) => v.toUpperCase()),
    countryName: optionalText(100),
    region: optionalText(120),
    city: optionalText(120),
    address: optionalText(300),
    disciplines: z
      .array(
        z.enum([
          "artistic_female",
          "artistic_male",
          "rhythmic",
          "trampoline",
          "aerobic",
          "acrobatics",
          "parkour",
          "general",
        ])
      )
      .max(8)
      .default([]),
    imageUrl: httpsUrl.nullable().optional(),
    imageSourceUrl: httpsUrl.nullable().optional(),
    imageLicense: optionalText(500),
    website: httpsUrl.nullable().optional(),
    contactEmail: z.string().email().max(254).nullable().optional(),
    contactPhone: optionalText(50),
    socialInstagram: httpsUrl.nullable().optional(),
    socialFacebook: httpsUrl.nullable().optional(),
    sourceUrl: httpsUrl,
    sourceName: z.string().trim().min(2).max(200),
    hours: optionalText(1000),
    activity: z.enum(["operational", "closed", "unknown"]).default("unknown"),
    organizerName: optionalText(200),
    organizerUrl: httpsUrl.nullable().optional(),
    organizationId: z.string().uuid().nullable().optional(),
    edition: optionalText(80),
    eventType: z
      .enum([
        "competitions",
        "courses",
        "camps",
        "workshops",
        "clinics",
        "evaluations",
        "other",
      ])
      .default("competitions"),
    eventStatus: z
      .enum(["provisional", "confirmed", "postponed", "cancelled", "finished"])
      .default("provisional"),
    startDate: z.string().date().nullable().optional(),
    endDate: z.string().date().nullable().optional(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    timezone: optionalText(80),
    venue: optionalText(200),
    registrationUrl: httpsUrl.nullable().optional(),
    registrationEndDate: z.string().date().nullable().optional(),
    participantRequirements: optionalText(2000),
    spectatorAccess: z
      .enum(["public", "restricted", "unknown"])
      .default("unknown"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.imageUrl && (!data.imageSourceUrl || !data.imageLicense?.trim()))
      ctx.addIssue({
        code: "custom",
        path: ["imageUrl"],
        message: "Documenta la procedencia y autorización de la imagen",
      });
    if (data.startDate && data.endDate && data.endDate < data.startDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "La fecha final debe ser posterior al inicio",
      });
    if (data.startTime && !data.timezone)
      ctx.addIssue({
        code: "custom",
        path: ["timezone"],
        message: "Indica la zona horaria",
      });
    if (data.timezone) {
      try {
        new Intl.DateTimeFormat("es", { timeZone: data.timezone });
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["timezone"],
          message: "Zona horaria no válida",
        });
      }
    }
  });
export type EntryData = z.infer<typeof EntryDataSchema>;
export type DirectoryEntry = {
  id: string;
  kind: DirectoryKind;
  data: EntryData;
  publication: (typeof publicationStates)[number];
  representation: "unclaimed" | "verified" | "disputed";
  slug: string;
  reviewedAt: string | null;
  updatedAt: string;
  academyId: string | null;
  eventId: string | null;
  mergedInto: string | null;
};
export const EntryInputSchema = z.object({
  kind: z.enum(kinds),
  data: EntryDataSchema,
});
export const ClaimSchema = z
  .object({
    entryId: z.string().uuid(),
    relationship: z.string().trim().min(5).max(500),
    evidence: z.string().trim().min(20).max(3000),
    evidencePath: z.string().max(500).optional(),
  })
  .strict();
export const QuerySchema = z.object({
  kind: z.enum(kinds),
  search: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  discipline: z.string().max(40).optional(),
  eventType: z.string().max(40).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  history: z.enum(["true", "false"]).default("false"),
  page: z.coerce.number().int().positive().max(10000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(30),
});
export const routineFields = new Set(["description", "hours", "disciplines"]);
export function requiresReview(before: EntryData, after: EntryData): boolean {
  const normalized = (value: unknown) => value == null || value === "" ? null : value;
  return Object.keys(after).some(
    (key) =>
      !routineFields.has(key) &&
      JSON.stringify(normalized(before[key as keyof EntryData])) !==
        JSON.stringify(normalized(after[key as keyof EntryData]))
  );
}
export function entryPath(
  entry: Pick<DirectoryEntry, "id" | "kind"> &
    Partial<Pick<DirectoryEntry, "slug" | "academyId" | "eventId">>
) {
  const suffix =
    entry.slug && entry.id !== entry.academyId && entry.id !== entry.eventId
      ? `-${entry.slug}`
      : "";
  return `${entry.kind === "academy" ? "/academias" : entry.kind === "event" ? "/events" : "/directorio/organizaciones"}/${entry.id}${suffix}`;
}
export function parseEntryId(value: string) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:-[a-z0-9-]+)?$/i.test(
    value
  )
    ? value.slice(0, 36)
    : null;
}
export function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || "ficha"
  );
}
export function publicationError(
  kind: DirectoryKind,
  data: EntryData
): string | null {
  if (!data.city?.trim())
    return "Indica una localidad contrastada antes de publicar";
  if (kind === "event" && (!data.startDate || !data.organizerName?.trim()))
    return "Confirma fecha y organizador antes de publicar";
  return null;
}
export function flag(
  name: "admin" | "catalog" | "claims" | "imports" | "communications"
) {
  return process.env[`DIRECTORY_${name.toUpperCase()}_ENABLED`] === "true";
}
