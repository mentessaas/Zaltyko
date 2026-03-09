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

// Estado de atleta
export type AthleteStatus = "active" | "trial" | "inactive" | "archived";

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
