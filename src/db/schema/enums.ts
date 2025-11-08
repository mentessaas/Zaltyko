import { pgEnum } from "drizzle-orm/pg-core";

export const profileRoleEnum = pgEnum("profile_role", ["admin", "owner", "coach", "athlete"]);

export const membershipRoleEnum = pgEnum("membership_role", ["owner", "coach", "viewer"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "trialing",
  "canceled",
  "incomplete",
]);

