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

export const eventLevelEnum = pgEnum("event_level", [
  "internal",
  "local",
  "national",
  "international",
]);

export const eventDisciplineEnum = pgEnum("event_discipline", [
  "artistic_female",
  "artistic_male",
  "rhythmic",
  "trampoline",
  "parkour",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "competitions",
  "courses",
  "camps",
  "workshops",
  "clinics",
  "evaluations",
  "other",
]);

// Marketplace
export const marketplaceListingTypeEnum = pgEnum("marketplace_listing_type", ["product", "service"]);
export const marketplaceCategoryEnum = pgEnum("marketplace_category", [
  "equipment", "clothing", "supplements", "books", "particular_training",
  "personal_training", "clinics", "arbitration", "physiotherapy", "photography", "other"
]);
export const marketplacePriceTypeEnum = pgEnum("marketplace_price_type", ["fixed", "negotiable", "contact"]);
export const marketplaceListingStatusEnum = pgEnum("marketplace_listing_status", ["active", "sold", "hidden"]);

// Empleo
export const jobCategoryEnum = pgEnum("job_category", [
  "coach", "assistant_coach", "administrative", "physiotherapist", "psychologist", "other"
]);
export const jobTypeEnum = pgEnum("job_type", ["full_time", "part_time", "internship"]);
export const jobListingStatusEnum = pgEnum("job_listing_status", ["active", "closed", "draft"]);
export const applicationStatusEnum = pgEnum("application_status", ["pending", "reviewed", "accepted", "rejected"]);

// Advertising
export const adTypeEnum = pgEnum("ad_type", ["banner", "featured"]);
export const adPositionEnum = pgEnum("ad_position", [
  "marketplace_top", "marketplace_sidebar", "marketplace_between",
  "empleo_top", "empleo_sidebar", "empleo_between",
  "events_top", "events_sidebar", "events_between"
]);

// Discounts
export const discountCategoryEnum = pgEnum("discount_category", [
  "regular",
  "early_payment",
  "loyalty",
  "promotional",
]);

// Event Registration
export const eventRegistrationStatusEnum = pgEnum("event_registration_status", [
  "pending",
  "confirmed",
  "cancelled",
  "waitlisted",
]);

// Event Waitlist
export const eventWaitlistStatusEnum = pgEnum("event_waitlist_status", [
  "waiting",
  "notified",
  "converted",
  "expired",
]);

// Event Payment
export const eventPaymentStatusEnum = pgEnum("event_payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
]);

// Event Status
export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "published",
  "cancelled",
  "completed",
]);