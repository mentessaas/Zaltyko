import { boolean, index, integer, pgTable, text, timestamp, uuid, jsonb, date } from "drizzle-orm/pg-core";
import { jobCategoryEnum, jobTypeEnum, jobListingStatusEnum, applicationStatusEnum } from "./enums";
import { profiles } from "./profiles";
import { academies } from "./academies";

export const empleoListings = pgTable("empleo_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  academyId: uuid("academy_id").references(() => academies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: jobCategoryEnum("category").notNull(),
  description: text("description"),
  requirements: text("requirements"),
  location: jsonb("location").$type<{
    country: string;
    province?: string;
    city: string;
  }>(),
  jobType: jobTypeEnum("job_type").notNull(),
  salary: jsonb("salary").$type<{
    min?: number;
    max?: number;
    currency: string;
    type: string;
  }>(),
  howToApply: text("how_to_apply").default("internal"), // internal, external
  externalUrl: text("external_url"),
  deadline: date("deadline"),
  status: jobListingStatusEnum("status").default("active"),
  views: integer("views").default(0),
  isFeatured: boolean("is_featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  academyIdx: index("empleo_academy_idx").on(table.academyId),
  categoryIdx: index("empleo_category_idx").on(table.category),
  statusIdx: index("empleo_status_idx").on(table.status),
  createdAtIdx: index("empleo_created_at_idx").on(table.createdAt),
}));

export const empleoApplications = pgTable("empleo_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").references(() => empleoListings.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  status: applicationStatusEnum("status").default("pending"),
  message: text("message"),
  resumeUrl: text("resume_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  listingIdx: index("application_listing_idx").on(table.listingId),
  userIdx: index("application_user_idx").on(table.userId),
}));
