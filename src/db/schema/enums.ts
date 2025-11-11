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
]);

