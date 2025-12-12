import { athleteStatusOptions } from "@/lib/athletes/constants";

export interface AthleteSummary {
  id: string;
  name: string;
  level: string | null;
  status: (typeof athleteStatusOptions)[number];
  dob: string | null;
  groupId: string | null;
  groupName?: string | null;
}

export interface GuardianSummary {
  linkId: string;
  guardianId: string;
  profileId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  linkRelationship: string | null;
  notifyEmail: boolean | null;
  notifySms: boolean | null;
  isPrimary: boolean | null;
}

export interface GuardianFormData {
  name: string;
  email: string;
  phone: string;
  relationship: string;
  notifyEmail: boolean;
  notifySms: boolean;
  isPrimary?: boolean;
}

export interface AthleteFormData {
  name: string;
  dob: string;
  category: string;
  level: string;
  status: (typeof athleteStatusOptions)[number];
  groupId: string;
}

export const CATEGORY_OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;
export type CategoryOption = (typeof CATEGORY_OPTIONS)[number];

export const LEVEL_OPTIONS = [
  "Pre-nivel",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "FIG",
] as const;
export type LevelOption = (typeof LEVEL_OPTIONS)[number];

export const RELATIONSHIP_OPTIONS = [
  "Madre",
  "Padre",
  "Tutor",
  "Tutora",
  "Abuelo",
  "Abuela",
  "Hermano",
  "Hermana",
  "Tío",
  "Tía",
] as const;
export type RelationshipOption = (typeof RELATIONSHIP_OPTIONS)[number];

export interface ParsedLevel {
  category: CategoryOption | "";
  level: LevelOption | "";
}

