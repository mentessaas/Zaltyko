// Dashboard type definitions

export interface DashboardMetrics {
  athletes: number;
  coaches: number;
  groups: number;
  classesThisWeek: number;
  assessments: number;
  attendancePercent: number;
}

export interface DashboardPlanUsage {
  planCode: string;
  planNickname: string | null;
  status: string;
  athleteLimit: number | null;
  classLimit: number | null;
  usedAthletes: number;
  usedClasses: number;
  athletePercent: number;
  classPercent: number;
}

export interface DashboardUpcomingClass {
  id: string;
  classId: string;
  className: string | null;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  coaches: Array<{ id: string; name: string | null }>;
  groupName: string | null;
  groupColor: string | null;
  isSessionPlaceholder?: boolean;
}

export interface DashboardActivity {
  id: string;
  action: string;
  description: string;
  createdAt: Date;
  userName: string | null;
}

export interface DashboardGroupSummary {
  id: string;
  name: string;
  discipline: string;
  color: string | null;
  coachName: string | null;
  athleteCount: number;
}

export interface AthleteCategoryCount {
  category: string;
  count: number;
}

export interface ExpiringLicense {
  id: string;
  personId: string;
  personName: string | null;
  licenseType: string;
  federation: string;
  validUntil: string;
  daysUntilExpiry: number;
}

export interface UpcomingCompetition {
  id: string;
  title: string;
  startDate: string;
  level: string;
  status: string;
}

export interface GrDashboardMetrics {
  athletesByCategory: AthleteCategoryCount[];
  expiringLicenses: ExpiringLicense[];
  expiringLicensesThisWeek: number;
  expiringLicensesThisMonth: number;
  upcomingCompetitions: UpcomingCompetition[];
  assessmentsThisMonth: number;
  totalAthletesWithActiveLicense: number;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  plan: DashboardPlanUsage;
  upcomingClasses: DashboardUpcomingClass[];
  recentActivity: DashboardActivity[];
  groups: DashboardGroupSummary[];
  grMetrics?: GrDashboardMetrics;
}

export interface DashboardAcademy {
  id: string;
  name: string | null;
  academyType: string | null;
  tenantId: string | null;
  country: string | null;
}
