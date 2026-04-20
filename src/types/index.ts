// Tipos globales del proyecto

// Roles de usuario
export type UserRole =
  | "super_admin"
  | "admin"
  | "owner"
  | "coach"
  | "athlete"
  | "parent";

// Estado de academia
export type AcademyStatus = "active" | "suspended" | "inactive";

// Re-export athlete status from constants
import { athleteStatusOptions, ACTIVE_STATUSES, INACTIVE_STATUSES, type AthleteStatus } from "@/lib/athletes/constants";
export { athleteStatusOptions, ACTIVE_STATUSES, INACTIVE_STATUSES, AthleteStatus };

// Nivel de atleta
export type AthleteLevel = "beginner" | "intermediate" | "advanced" | "professional";

// Tipo de asistencia
export type AttendanceStatus = "present" | "absent" | "late" | "excused";

// Tipo de clase
export type ClassType = "group" | "individual" | "workshop" | "competition";

// Género
export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

// Resultado de API
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Paginación
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// Filters comunes
export interface BaseFilters {
  page?: number;
  limit?: number;
  search?: string;
}

// Tipo para tenant
export interface Tenant {
  id: string;
  name: string;
  slug: string;
}

// Usuario actual en sesión
export interface CurrentUser {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  tenantId?: string;
  academyId?: string;
}

// Configuración de academia
export interface AcademyConfig {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  locale: string;
}

// Metadata de auditoría
export interface AuditMetadata {
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

// Tipos de Atleta
export interface AthleteListItem {
  id: string;
  name: string;
  level: string | null;
  status: AthleteStatus;
  age: number | null;
  dob?: string | null;
  guardianCount?: number;
  createdAt?: string | null;
  groupId?: string | null;
  groupName: string | null;
  groupColor: string | null;
}

export interface GroupOption {
  id: string;
  name: string;
  color: string | null;
}

export interface Registration {
  id: string;
  eventId: string;
  athleteId: string;
  athleteName: string;
  athleteDob: string | null;
  athleteLevel: string | null;
  categoryId: string | null;
  categoryName: string | null;
  status: "pending" | "confirmed" | "cancelled" | "waitlisted";
  notes: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingName: string | null;
  billingNif: string | null;
  createdAt: string;
  updatedAt: string;
}

// Tipo de evaluación
export type AssessmentType = "technical" | "artistic" | "physical" | "behavioral" | "overall";

// Rúbrica de evaluación
export interface AssessmentRubric {
  id: string;
  name: string;
  description: string | null;
  type: AssessmentType;
  criteria: RubricCriterion[];
  createdAt: string;
  updatedAt: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string | null;
  maxScore: number;
  weight: number;
  order: number;
}

// Evaluación con scores
export interface AssessmentWithScores {
  id: string;
  athleteId: string;
  athleteName: string;
  assessmentDate: string;
  assessmentType: AssessmentType;
  apparatus: string | null;
  overallComment: string | null;
  assessedByName: string | null;
  scores: AssessmentScore[];
  videos: AssessmentVideo[];
  totalScore: number | null;
  averageScore: number | null;
}

export interface AssessmentScore {
  id: string;
  skillId: string;
  skillName: string;
  score: number;
  comments: string | null;
  criterionId: string | null;
}

export interface AssessmentVideo {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  uploadedAt: string;
  /** Server-assigned ID for API delete operations (falls back to id if not set) */
  serverId?: string;
}

// Progreso del atleta
export interface AthleteProgress {
  athleteId: string;
  athleteName: string;
  assessments: AssessmentWithScores[];
  progressBySkill: Record<string, ProgressData[]>;
  overallTrend: "improving" | "declining" | "stable";
}

export interface ProgressData {
  date: string;
  score: number;
  assessmentId: string;
}
