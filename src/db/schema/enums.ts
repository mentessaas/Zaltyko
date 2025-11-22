import { pgEnum } from "drizzle-orm/pg-core";

export const profileRoleEnum = pgEnum("profile_role", [
  "super_admin",
  "admin",
  "owner",
  "coach",
  "athlete",
  "parent",
]);

export const membershipRoleEnum = pgEnum("membership_role", ["owner", "coach", "viewer"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "trialing",
  "canceled",
  "incomplete",
]);

export const academyTypeEnum = pgEnum("academy_type", [
  "artistica",
  "ritmica",
  "trampolin",
  "general",
  "parkour",
  "danza",
]);

export const onboardingChecklistStatusEnum = pgEnum("onboarding_checklist_status", [
  "pending",
  "completed",
  "skipped",
]);

export const billingItemPeriodicityEnum = pgEnum("billing_item_periodicity", [
  "one_time",
  "monthly",
  "yearly",
]);

export const chargeStatusEnum = pgEnum("charge_status", [
  "pending",
  "paid",
  "overdue",
  "cancelled",
  "partial",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "transfer",
  "bizum",
  "card_manual",
  "other",
]);

