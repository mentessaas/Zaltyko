/**
 * MCP Route Handler Types
 * Types for the MCP (Model Context Protocol) route handler
 */

export interface McpAuthContext {
  userId: string;
  profile: any;
  tenantId: string | null;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: any;
}

/**
 * Academy-related types
 */
export interface AcademyInfo {
  id: string;
  name: string;
  academyType: string;
  city: string | null;
  region: string | null;
  country: string | null;
  isPublic: boolean;
  isSuspended: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  createdAt: Date | null;
  isTrialActive: boolean;
  trialEndsAt: Date | null;
}

export interface AcademyStats {
  athletesCount: number;
  classesCount: number;
  groupsCount: number;
}

export interface AcademyAthlete {
  id: string;
  name: string;
  dob: string | null;
  level: string | null;
  status: string;
  groupId: string | null;
}

export interface AcademyClass {
  id: string;
  name: string;
  weekday: number | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  isExtra: boolean | null;
}

export interface AcademyEvent {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
  isPublic: boolean | null;
  level: string | null;
  academyId: string | null;
  createdAt: Date | null;
}

export interface FinancialMetrics {
  revenue: number;
  paidChargesCount: number;
  pending: number;
  pendingChargesCount: number;
  total: number;
}

/**
 * System stats types
 */
export interface SystemStats {
  academiesCount: number;
  athletesCount: number;
  classesCount: number;
  groupsCount: number;
  eventsCount: number;
  profilesCount: number;
  revenueThisMonth: number;
  chargesPaidCount: number;
  currentMonth: string;
}

/**
 * Database connection status
 */
export interface DatabaseConnectionStatus {
  isConnected: boolean;
  isConfigured: boolean;
  testSuccessful: boolean;
}
