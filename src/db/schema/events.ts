import { boolean, date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { eventDisciplineEnum, eventLevelEnum, eventTypeEnum } from "./enums";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").array(),
    isPublic: boolean("is_public").notNull().default(false),
    level: eventLevelEnum("level").notNull().default("internal"),
    discipline: eventDisciplineEnum("discipline"),
    eventType: eventTypeEnum("event_type"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    registrationStartDate: date("registration_start_date"),
    registrationEndDate: date("registration_end_date"),
    countryCode: text("country_code"),
    countryName: text("country_name"),
    provinceName: text("province_name"),
    cityName: text("city_name"),
    // Mantener campos antiguos para migración gradual
    country: text("country"),
    province: text("province"),
    city: text("city"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    contactInstagram: text("contact_instagram"),
    contactWebsite: text("contact_website"),
    images: text("images").array(),
    attachments: jsonb("attachments"),
    notifyInternalStaff: boolean("notify_internal_staff").default(false),
    notifyCityAcademies: boolean("notify_city_academies").default(false),
    notifyProvinceAcademies: boolean("notify_province_academies").default(false),
    notifyCountryAcademies: boolean("notify_country_academies").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantAcademyIdx: index("events_tenant_academy_idx").on(table.tenantId, table.academyId),
    countryIdx: index("events_country_idx").on(table.country),
    provinceIdx: index("events_province_idx").on(table.province),
    cityIdx: index("events_city_idx").on(table.city),
    disciplineIdx: index("events_discipline_idx").on(table.discipline),
    levelIdx: index("events_level_idx").on(table.level),
    eventTypeIdx: index("events_event_type_idx").on(table.eventType),
    startDateIdx: index("events_start_date_idx").on(table.startDate),
    registrationStartDateIdx: index("events_registration_start_date_idx").on(table.registrationStartDate),
    registrationEndDateIdx: index("events_registration_end_date_idx").on(table.registrationEndDate),
    countryCodeIdx: index("events_country_code_idx").on(table.countryCode),
    isPublicIdx: index("events_is_public_idx").on(table.isPublic),
  })
);
