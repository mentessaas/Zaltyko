import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

export const coaches = pgTable(
  "coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    bio: text("bio"),
    photoUrl: text("photo_url"),
    slug: text("slug").unique(),
    isPublic: boolean("is_public").notNull().default(false),
    specialties: text("specialties").array(),
    publicBio: text("public_bio"),
    yearsExperience: text("years_experience"),
    certifications: jsonb("certifications").$type<Array<{
      name: string;
      issuer: string;
      date: string;
      url?: string;
    }>>().default([]),
    photoGallery: text("photo_gallery").array(),
    achievements: jsonb("achievements").$type<Array<{
      title: string;
      description?: string;
      date?: string;
    }>>().default([]),
    socialLinks: jsonb("social_links").$type<{
      instagram?: string;
      facebook?: string;
      twitter?: string;
      linkedin?: string;
      website?: string;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantAcademyIdx: index("coaches_tenant_academy_idx").on(table.tenantId, table.academyId),
    publicIdx: index("coaches_public_idx").on(table.isPublic),
    slugIdx: index("coaches_slug_idx").on(table.slug),
  })
);

