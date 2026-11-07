import { z } from "zod";

export const MARKET_ACCESS_ROLES = [
  { value: "owner", label: "Dirección o titular del club" },
  { value: "manager", label: "Gestión del club" },
  { value: "coach", label: "Entrenador/a" },
  { value: "other", label: "Otra función" },
] as const;

export const MARKET_ACCESS_DISCIPLINES = [
  { value: "artistic_female", label: "Artística femenina" },
  { value: "artistic_male", label: "Artística masculina" },
  { value: "rhythmic", label: "Rítmica" },
  { value: "other", label: "Otra actividad del club" },
] as const;

export const MarketAccessRequestSchema = z.object({
  // Self-reported name: do not invent an ISO code or inherit Spain.
  countryName: z.string().trim().min(2).max(80)
    .refine((value) => !/[<>]/.test(value) && Array.from(value).every((character) => {
      const code = character.charCodeAt(0);
      return (code >= 32 && code < 127 || code >= 160) && code !== 0x2028 && code !== 0x2029;
    }), "Indica el nombre del país sin etiquetas ni saltos de línea"),
  role: z.enum(["owner", "manager", "coach", "other"]),
  disciplines: z.array(z.enum(["artistic_female", "artistic_male", "rhythmic", "other"]))
    .min(1).max(4)
    .refine((values) => new Set(values).size === values.length, "No repitas disciplinas"),
}).strict();

export type MarketAccessRequest = z.infer<typeof MarketAccessRequestSchema>;

/** Stored in the existing immutable contact interaction, without new columns. */
export function serializeMarketAccessMessage(request: MarketAccessRequest, message: string): string {
  return JSON.stringify({
    kind: "market_access_request",
    version: 1,
    countryName: request.countryName,
    role: request.role,
    disciplines: request.disciplines,
    message,
  });
}

export function marketAccessEmailSummary(request: MarketAccessRequest): string {
  const role = MARKET_ACCESS_ROLES.find((item) => item.value === request.role)?.label;
  const disciplines = request.disciplines.map((value) =>
    MARKET_ACCESS_DISCIPLINES.find((item) => item.value === value)?.label
  ).join(", ");
  return `País indicado: ${request.countryName}\nFunción: ${role}\nDisciplinas: ${disciplines}`;
}
