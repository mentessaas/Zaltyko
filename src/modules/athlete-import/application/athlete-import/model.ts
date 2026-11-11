/**
 * Types shared by the athlete import modules. The public ones are re-exported
 * by athlete-import-service.ts.
 */
import type {
  AthleteImportMapping,
  ImportIssue,
  NormalizedImportRow,
} from "../../domain/athlete-import-rows";

export type AthleteImportRowStatus = "create" | "error" | "duplicate" | "skipped";

export type AthleteImportPreviewRow = Readonly<{
  row: number;
  status: AthleteImportRowStatus;
  issues: readonly ImportIssue[];
  values: Readonly<{
    givenName: string;
    familyName: string;
    dateOfBirth: string | null;
    group: string | null;
    guardianName: string | null;
    guardianEmail: string | null;
    guardianPhone: string | null;
  }>;
}>;

export type AthleteImportPreview = Readonly<{
  format: "csv" | "xlsx";
  headers: string[];
  mapping: AthleteImportMapping;
  mappingProblems: string[];
  hiddenRows: number[];
  rows: AthleteImportPreviewRow[];
  summary: Readonly<{
    total: number;
    toCreate: number;
    errors: number;
    duplicates: number;
    skipped: number;
    withWarnings: number;
    newFamilies: number;
    newTutors: number;
    groupMemberships: number;
  }>;
  plan: Readonly<{ current: number; limit: number | null; readOnly: boolean }>;
  canConfirm: boolean;
  previewToken: string;
}>;

export type AthleteImportResult = Readonly<{
  batchId: string;
  created: ReadonlyArray<{ row: number; athleteId: string; familyId: string; membershipId: string | null }>;
  skipped: ReadonlyArray<{ row: number; code: string; message: string }>;
  replayed: boolean;
}>;

/** @internal Uso exclusivo de athlete-import/*; la API pública está en athlete-import-service.ts. */
export type Actor = { userId: string; memberId: string };

/** @internal Uso exclusivo de athlete-import/*; la API pública está en athlete-import-service.ts. */
export type GroupRow = {
  groupId: string;
  name: string;
  locationId: string;
  capacity: number | null;
  occupancy: number;
  localDate: string;
};

/** @internal Uso exclusivo de athlete-import/*; la API pública está en athlete-import-service.ts. */
export type ExistingAthlete = {
  givenName: string;
  familyName: string;
  dateOfBirth: string | null;
  isActive: boolean;
};

/** @internal Uso exclusivo de athlete-import/*; la API pública está en athlete-import-service.ts. */
export type ExistingContact = {
  guardianId: string;
  kind: "email" | "phone";
  value: string;
  givenName: string;
  familyName: string;
  familyIds: string[];
};

/** @internal Uso exclusivo de athlete-import/*; la API pública está en athlete-import-service.ts. */
export type ImportContext = {
  /** Civil date of the academy (its first active site's time zone). */
  today: string;
  groups: GroupRow[];
  athletes: ExistingAthlete[];
  contacts: ExistingContact[];
  usage: { current: number; limit: number | null; readOnly: boolean };
};

/** @internal Uso exclusivo de athlete-import/*; la API pública está en athlete-import-service.ts. */
export type PlannedRow = {
  row: NormalizedImportRow;
  group: GroupRow | null;
  /** Existing family of a tutor already in the academy. */
  existingFamilyId: string | null;
  /** Key of the new family shared by siblings of one new tutor in the file. */
  newFamilyKey: string;
};

/** @internal Uso exclusivo de athlete-import/*; la API pública está en athlete-import-service.ts. */
export type Classified = {
  preview: AthleteImportPreviewRow;
  plan: PlannedRow | null;
};
