/**
 * Athlete Module Types
 * Centralized types for athlete-related functionality
 */

import { athleteStatusOptions } from "@/lib/athletes/constants";
import type { AthleteDocument } from "@/db/schema/athlete-documents";
import type { AthleteLevel } from "@/types";

// ============================================================================
// Document Types
// ============================================================================

export const DOCUMENT_TYPES = [
  "identity_document",
  "medical_certificate",
  "consent_form",
  "birth_certificate",
  "federative_license",
  "insurance",
  "photo",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  identity_document: "Documento de Identidad",
  medical_certificate: "Certificado Médico",
  consent_form: "Formulario de Consentimiento",
  birth_certificate: "Acta de Nacimiento",
  federative_license: "Licencia Federativa",
  insurance: "Seguro",
  photo: "Fotografía",
  other: "Otro",
};

export interface AthleteDocumentWithUrl extends AthleteDocument {
  fileUrl: string;
}

// ============================================================================
// Profile Types
// ============================================================================

export interface AthleteProfile {
  id: string;
  tenantId: string;
  academyId: string;
  userId: string | null;
  name: string;
  dob: string | null;
  level: string | null;
  status: (typeof athleteStatusOptions)[number];
  groupId: string | null;
  templateId: string | null;
  ageCategory: string | null;
  competitiveLevel: string | null;
  primaryApparatus: string | null;
  createdAt: Date | null;
  deletedAt: Date | null;
}

export interface AthleteWithStats extends AthleteProfile {
  // Group info
  groupName: string | null;
  groupColor: string | null;

  // Counts
  guardianCount: number;
  classCount: number;
  assessmentCount: number;
  documentCount: number;

  // Computed
  age: number | null;
}

export interface AthleteProfileHeaderInfo {
  id: string;
  name: string;
  level: string | null;
  status: (typeof athleteStatusOptions)[number];
  age: number | null;
  dob: string | null;
  groupName: string | null;
  groupColor: string | null;
  ageCategory: string | null;
  competitiveLevel: string | null;
  primaryApparatus: string | null;
}

// ============================================================================
// Stats Types
// ============================================================================

export interface AthleteStats {
  totalClasses: number;
  totalAssessments: number;
  totalDocuments: number;
  attendanceRate: number | null;
  lastAssessmentDate: string | null;
  lastAssessmentScore: number | null;
  averageScore: number | null;
  upcomingClasses: number;
}

export interface AthleteStatsOverviewProps {
  athleteId: string;
  academyId: string;
  initialStats?: AthleteStats;
}

// ============================================================================
// Extra Classes Types
// ============================================================================

export interface AthleteExtraClass {
  id: string;
  tenantId: string;
  academyId: string;
  athleteId: string;
  classId: string;
  createdAt: Date | null;
}

export interface ExtraClassWithDetails extends AthleteExtraClass {
  className: string;
  classDaytime: string | null;
  classStartTime: string | null;
  classEndTime: string | null;
  coachNames: string[];
}

export interface ExtraClassRequest {
  classId: string;
  athleteId: string;
  academyId: string;
}

export interface CreateExtraClassRequest {
  classId: string;
}

// ============================================================================
// Assessment Filters
// ============================================================================

export interface AssessmentFilters {
  athleteId?: string;
  academyId?: string;
  assessmentType?: AssessmentTypeFilter;
  apparatus?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export type AssessmentTypeFilter =
  | "technical"
  | "artistic"
  | "execution"
  | "coach_feedback"
  | "competition"
  | "practice";

// ============================================================================
// API Response Types
// ============================================================================

export interface AthleteApiResponse {
  success: boolean;
  data?: AthleteWithStats;
  error?: string;
}

export interface AthleteDocumentsApiResponse {
  success: boolean;
  data?: AthleteDocumentWithUrl[];
  total?: number;
  error?: string;
}

export interface AthleteExtraClassesApiResponse {
  success: boolean;
  data?: ExtraClassWithDetails[];
  total?: number;
  error?: string;
}

// ============================================================================
// Form Types
// ============================================================================

export interface AthleteUpdateFormData {
  name?: string;
  dob?: string | null;
  level?: string | null;
  status?: (typeof athleteStatusOptions)[number];
  groupId?: string | null;
  competitiveLevel?: string | null;
  primaryApparatus?: string | null;
}

export interface DocumentUploadFormData {
  documentType: DocumentType;
  file: File;
  issuedDate?: string;
  expiryDate?: string;
  notes?: string;
}
