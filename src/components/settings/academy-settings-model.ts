import type { BrandingData } from "@/components/settings/BrandingEditor";
import type { ScheduleData } from "@/components/settings/ScheduleEditor";
import type { SocialLinksData } from "@/components/settings/SocialLinksEditor";
import { getSportConfigSeedByVariant } from "@/lib/sport-config/catalog";

export interface AcademySettings {
  name: string;
  publicDescription: string;
  isPublic: boolean;
  academyType: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  disciplineVariant: string;
  activeDisciplineVariants: string[];
  activeProgramCodesByVariant: Record<string, string[]>;
  activeApparatusCodesByVariant: Record<string, string[]>;
  terminologyOverridesByVariant: Record<string, Record<string, string>>;
  sportConfigs: SportConfigSettings[];
  federationConfigVersion: string;
  specializationStatus: string;
  branding: BrandingData;
  schedule: ScheduleData;
  contact: SocialLinksData;
  timezone: string;
  taxId: string;
  invoicePrefix: string;
}

export interface SportConfigSettings {
  id: string;
  name: string;
  defaultDisciplineVariant: string;
  disciplineName: string;
  branchName: string;
  activeProgramCodes?: string[] | null;
  activeApparatusCodes?: string[] | null;
  usedProgramCodes?: string[];
  usedApparatusCodes?: string[];
  apparatus: Array<{ code: string; name: string }>;
  programs: Array<{ code: string; name: string }>;
  terminology: Record<string, string>;
}

export const DEFAULT_SETTINGS: AcademySettings = {
  name: "",
  publicDescription: "",
  isPublic: true,
  academyType: "artistica",
  country: "España",
  countryCode: "ES",
  region: "",
  city: "",
  disciplineVariant: "artistic_female",
  activeDisciplineVariants: ["artistic_female"],
  activeProgramCodesByVariant: {},
  activeApparatusCodesByVariant: {},
  terminologyOverridesByVariant: {},
  sportConfigs: [],
  federationConfigVersion: "legacy-default-v1",
  specializationStatus: "legacy",
  branding: {
    primaryColor: "#1FC7B6",
    secondaryColor: "#2B2E83",
    accentColor: "#FF6B57",
    fontHeading: "Space Grotesk",
    fontBody: "Inter",
    logoUrl: "",
    faviconUrl: "",
  },
  schedule: {
    slots: [],
  },
  contact: {
    website: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    socialInstagram: "",
    socialFacebook: "",
    socialTwitter: "",
    socialYoutube: "",
  },
  timezone: "America/Mexico_City",
  taxId: "",
  invoicePrefix: "INV",
};

export const DISCIPLINE_VARIANTS = [
  { value: "artistic_female", label: "Gimnasia artística femenina" },
  { value: "artistic_male", label: "Gimnasia artística masculina" },
  { value: "rhythmic", label: "Gimnasia rítmica" },
  { value: "general", label: "Mixta artística/rítmica" },
];

export const MULTI_BRANCH_VARIANTS = DISCIPLINE_VARIANTS.filter((type) => type.value !== "general");

export function normalizeAcademySettingsPayload(payload: unknown): AcademySettings {
  const data = getSettingsData(payload);
  const sportConfigs = data.sportConfigs ?? [];
  const activeProgramCodesByVariant = Object.fromEntries(
    sportConfigs.map((config) => [
      config.defaultDisciplineVariant,
      config.activeProgramCodes ?? config.programs.map((program) => program.code),
    ])
  );
  const activeApparatusCodesByVariant = Object.fromEntries(
    sportConfigs.map((config) => [
      config.defaultDisciplineVariant,
      config.activeApparatusCodes ?? config.apparatus.map((apparatus) => apparatus.code),
    ])
  );
  const terminologyOverridesByVariant = Object.fromEntries(
    sportConfigs.map((config) => [config.defaultDisciplineVariant, config.terminology])
  );

  return {
    ...DEFAULT_SETTINGS,
    ...data,
    sportConfigs,
    activeProgramCodesByVariant,
    activeApparatusCodesByVariant,
    terminologyOverridesByVariant,
    branding: { ...DEFAULT_SETTINGS.branding, ...data.branding },
    schedule: { ...DEFAULT_SETTINGS.schedule, ...data.schedule },
    contact: { ...DEFAULT_SETTINGS.contact, ...data.contact },
  };
}

export function buildActiveSportConfigEditors(settings: AcademySettings) {
  return settings.activeDisciplineVariants.map((variant) => {
    const seed = getSportConfigSeedByVariant(settings.countryCode, variant);
    const config = settings.sportConfigs.find((item) => item.defaultDisciplineVariant === variant);
    return {
      variant,
      seed,
      config,
      label: config?.branchName
        ? `${config.branchName} · ${config.disciplineName}`
        : seed?.name ?? variant,
      programs: seed?.programs ?? config?.programs ?? [],
      apparatus: seed?.evaluation.apparatus.map((item) => ({ code: item.code, name: item.label })) ?? config?.apparatus ?? [],
      terminology:
        settings.terminologyOverridesByVariant[variant] ??
        config?.terminology ??
        seed?.terminology ??
        {},
      usedProgramCodes: config?.usedProgramCodes ?? [],
      usedApparatusCodes: config?.usedApparatusCodes ?? [],
    };
  });
}

function getSettingsData(payload: unknown): Partial<AcademySettings> {
  if (!payload || typeof payload !== "object") return {};

  const body = payload as { data?: Partial<AcademySettings> };
  return body.data ?? (payload as Partial<AcademySettings>);
}
