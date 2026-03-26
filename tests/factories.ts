/**
 * Test Factories - Utilities for creating test data
 * These factories help generate consistent, realistic test data
 */

import type {
  CategoryOption,
  LevelOption,
  AthleteFormData,
  GuardianFormData,
} from "@/types/athlete-edit";

// ============================================
// Athlete Test Factories
// ============================================

export const CATEGORY_OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;
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

export function createAthleteFormData(overrides: Partial<AthleteFormData> = {}): AthleteFormData {
  return {
    name: "Test Athlete",
    dob: "2010-05-15",
    category: "A",
    level: "1",
    status: "active",
    groupId: "group-123",
    ...overrides,
  };
}

export function createGuardianFormData(overrides: Partial<GuardianFormData> = {}): GuardianFormData {
  return {
    name: "Test Guardian",
    email: "guardian@example.com",
    phone: "+1234567890",
    relationship: "Madre",
    notifyEmail: true,
    notifySms: false,
    ...overrides,
  };
}

// ============================================
// Date Test Helpers
// ============================================

export function createDate(daysOffset: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date;
}

export function createISODate(daysOffset: number): string {
  return createDate(daysOffset).toISOString().split("T")[0];
}

// ============================================
// Pagination Test Helpers
// ============================================

export function createPaginationParams(overrides: {
  page?: number;
  limit?: number;
} = {}): { pageParam: string | null; limitParam: string | null } {
  return {
    pageParam: overrides.page?.toString() ?? null,
    limitParam: overrides.limit?.toString() ?? null,
  };
}

// ============================================
// Email Test Helpers
// ============================================

export const VALID_EMAILS = [
  "user@example.com",
  "user.name@example.com",
  "user+tag@example.com",
  "user@subdomain.example.com",
  "user123@example.co.uk",
];

export const INVALID_EMAILS = [
  "",
  "invalid",
  "user@",
  "@example.com",
  "user@.com",
  "user name@example.com",
];

// ============================================
// Search Test Helpers
// ============================================

export const SPECIAL_CHARACTERS_FOR_LIKE = [
  { input: "50% off", expected: "50\\% off" },
  { input: "user_name", expected: "user\\_name" },
  { input: "100%_great", expected: "100\\%\\_great" },
];

// ============================================
// Billing Test Helpers
// ============================================

export const PLAN_CYCLE = {
  monthly: {
    start: createDate(-15),
    end: createDate(15),
  },
  startOfMonth: {
    start: createDate(0),
    end: createDate(30),
  },
  endOfMonth: {
    start: createDate(-30),
    end: createDate(0),
  },
};
