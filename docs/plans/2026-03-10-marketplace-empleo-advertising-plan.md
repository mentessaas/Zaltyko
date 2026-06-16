# Marketplace, Bolsa de Empleo y Publicidad - Plan de Implementación

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Objetivo:** Añadir marketplace para productos/servicios, bolsa de empleo y espacios publicitarios a Zaltyko

**Arquitectura:**
- Sistema de listings para marketplace con categorías de productos y servicios
- Bolsa de empleo integrada con aplicaciones y mensajería opcional
- Espacios publicitarios tipo banner y destacados en marketplace, empleo y eventos
- Todo público con autenticación solo para publicar

**Stack:** Next.js 14, Drizzle ORM, Supabase, TypeScript, shadcn/ui

---

## FASE 1: Base de Datos

### Task 1: Crear enums para marketplace y empleo

**Archivos:**
- Crear: `src/db/schema/marketplace.ts`
- Modificar: `src/db/schema/enums.ts`

**Step 1: Añadir enums al archivo de enums**

```typescript
// src/db/schema/enums.ts - añadir al final

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
```

**Step 2: Verificar que se añadieron correctamente**

```bash
head -50 src/db/schema/enums.ts
```

**Step 3: Commit**

```bash
git add src/db/schema/enums.ts
git commit -m "feat: add marketplace and employment enums"
```

---

### Task 2: Crear schema de marketplace

**Archivos:**
- Crear: `src/db/schema/marketplace.ts`

**Step 1: Crear archivo de schema**

```typescript
// src/db/schema/marketplace.ts
import { boolean, index, integer, pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { marketplaceListingTypeEnum, marketplaceCategoryEnum, marketplacePriceTypeEnum, marketplaceListingStatusEnum } from "./enums";
import { profiles } from "./profiles";

export const marketplaceListings = pgTable("marketplace_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  sellerType: text("seller_type").notNull(), // academy, coach, athlete, external
  type: marketplaceListingTypeEnum("type").notNull(),
  category: marketplaceCategoryEnum("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priceCents: integer("price_cents"),
  currency: text("currency").default("eur"),
  priceType: marketplacePriceTypeEnum("price_type").default("contact"),
  contact: jsonb("contact").$type<{
    whatsapp?: string;
    email?: string;
    phone?: string;
  }>(),
  images: text("images").array(),
  location: jsonb("location").$type<{
    country: string;
    province?: string;
    city: string;
  }>(),
  status: marketplaceListingStatusEnum("status").default("active"),
  views: integer("views").default(0),
  isFeatured: boolean("is_featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  userIdx: index("marketplace_user_idx").on(table.userId),
  categoryIdx: index("marketplace_category_idx").on(table.category),
  typeIdx: index("marketplace_type_idx").on(table.type),
  statusIdx: index("marketplace_status_idx").on(table.status),
  createdAtIdx: index("marketplace_created_at_idx").on(table.createdAt),
}));

export const marketplaceRatings = pgTable("marketplace_ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").references(() => marketplaceListings.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").references(() => profiles.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").references(() => profiles.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sellerIdx: index("rating_seller_idx").on(table.sellerId),
  listingIdx: index("rating_listing_idx").on(table.listingId),
}));
```

**Step 2: Commit**

```bash
git add src/db/schema/marketplace.ts
git commit -m "feat: add marketplace schema tables"
```

---

### Task 3: Crear schema de empleo

**Archivos:**
- Crear: `src/db/schema/empleo.ts`

**Step 1: Crear archivo de schema**

```typescript
// src/db/schema/empleo.ts
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
```

**Step 2: Commit**

```bash
git add src/db/schema/empleo.ts
git commit -m "feat: add employment schema tables"
```

---

### Task 4: Crear schema de publicidad

**Archivos:**
- Crear: `src/db/schema/advertising.ts`

**Step 1: Crear archivo de schema**

```typescript
// src/db/schema/advertising.ts
import { boolean, index, integer, pgTable, text, timestamp, uuid, date } from "drizzle-orm/pg-core";
import { adTypeEnum, adPositionEnum } from "./enums";
import { profiles } from "./profiles";

export const advertisements = pgTable("advertisements", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: adTypeEnum("type").notNull(),
  position: adPositionEnum("position").notNull(),
  title: text("title").notNull(),
  imageUrl: text("image_url"),
  linkUrl: text("link_url").notNull(),
  altText: text("alt_text"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").default(true),
  views: integer("views").default(0),
  clicks: integer("clicks").default(0),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  positionIdx: index("ad_position_idx").on(table.position),
  activeIdx: index("ad_active_idx").on(table.isActive),
  datesIdx: index("ad_dates_idx").on(table.startDate, table.endDate),
}));

export const featuredListings = pgTable("featured_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketplaceListingId: uuid("marketplace_listing_id"),
  empleoListingId: uuid("empleo_listing_id"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
```

**Step 2: Commit**

```bash
git add src/db/schema/advertising.ts
git commit -m "feat: add advertising schema tables"
```

---

### Task 5: Exportar schemas en index

**Archivos:**
- Modificar: `src/db/schema/index.ts`

**Step 1: Añadir exports**

```typescript
// src/db/schema/index.ts - añadir al final
export * from "./marketplace";
export * from "./empleo";
export * from "./advertising";
```

**Step 2: Commit**

```bash
git add src/db/schema/index.ts
git commit -m "feat: export new schema modules"
```

---

## FASE 2: API Routes

### Task 6: Crear API de marketplace

**Archivos:**
- Crear: `src/app/api/marketplace/route.ts`
- Crear: `src/app/api/marketplace/[id]/route.ts`
- Crear: `src/app/api/marketplace/categories/route.ts`
- Crear: `src/app/api/marketplace/[id]/rate/route.ts`

**Step 1: Crear ruta GET/POST principal**

```typescript
// src/app/api/marketplace/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { eq, desc, like, and, or, inArray } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const type = searchParams.get("type");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const conditions = [eq(marketplaceListings.status, "active")];

  if (category) conditions.push(eq(marketplaceListings.category, category as any));
  if (type) conditions.push(eq(marketplaceListings.type, type as any));
  if (search) {
    conditions.push(or(
      like(marketplaceListings.title, `%${search}%`),
      like(marketplaceListings.description, `%${search}%`)
    ));
  }

  const offset = (page - 1) * limit;

  const listings = await db.select()
    .from(marketplaceListings)
    .where(and(...conditions))
    .orderBy(desc(marketplaceListings.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db.select({ count: marketplaceListings.id })
    .from(marketplaceListings)
    .where(and(...conditions));

  return NextResponse.json({
    items: listings,
    total: total.length,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total.length / limit),
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  const [listing] = await db.insert(marketplaceListings).values({
    userId: body.userId,
    sellerType: body.sellerType,
    type: body.type,
    category: body.category,
    title: body.title,
    description: body.description,
    priceCents: body.priceCents,
    priceType: body.priceType,
    contact: body.contact,
    images: body.images,
    location: body.location,
  }).returning();

  return NextResponse.json({ item: listing });
}
```

**Step 2: Commit**

```bash
git add src/app/api/marketplace/route.ts
git commit -m "feat: add marketplace API routes"
```

---

### Task 7: Crear API de empleo

**Archivos:**
- Crear: `src/app/api/empleo/route.ts`
- Crear: `src/app/api/empleo/[id]/route.ts`
- Crear: `src/app/api/empleo/[id]/apply/route.ts`

**Step 1: Crear ruta GET/POST de empleo**

```typescript
// src/app/api/empleo/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { empleoListings } from "@/db/schema";
import { eq, desc, like, and } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const jobType = searchParams.get("jobType");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const conditions = [eq(empleoListings.status, "active")];

  if (category) conditions.push(eq(empleoListings.category, category as any));
  if (jobType) conditions.push(eq(empleoListings.jobType, jobType as any));
  if (search) {
    conditions.push(like(empleoListings.title, `%${search}%`));
  }

  const offset = (page - 1) * limit;

  const listings = await db.select()
    .from(empleoListings)
    .where(and(...conditions))
    .orderBy(desc(empleoListings.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db.select({ count: empleoListings.id })
    .from(empleoListings)
    .where(and(...conditions));

  return NextResponse.json({
    items: listings,
    total: total.length,
    page,
    pageSize: limit,
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/empleo/route.ts
git commit -m "feat: add employment API routes"
```

---

### Task 8: Crear API de publicidad

**Archivos:**
- Crear: `src/app/api/advertising/zones/[zone]/route.ts`

**Step 1: Crear ruta de zonas**

```typescript
// src/app/api/advertising/zones/[zone]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { advertisements } from "@/db/schema";
import { eq, and, lte, gte } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ zone: string }> }
) {
  const { zone } = await params;
  const today = new Date().toISOString().split("T")[0];

  const ads = await db.select()
    .from(advertisements)
    .where(and(
      eq(advertisements.position, zone as any),
      eq(advertisements.isActive, true),
      lte(advertisements.startDate, today),
      gte(advertisements.endDate, today)
    ))
    .limit(10);

  return NextResponse.json({ ads });
}
```

**Step 2: Commit**

```bash
git add src/app/api/advertising/zones/\[zone\]/route.ts
git commit -m "feat: add advertising API routes"
```

---

## FASE 3: Componentes UI

### Task 9: Crear componentes de marketplace

**Archivos:**
- Crear: `src/components/marketplace/MarketplaceCard.tsx`
- Crear: `src/components/marketplace/MarketplaceFilters.tsx`
- Crear: `src/components/marketplace/MarketplaceForm.tsx`

**Step 1: Crear MarketplaceCard**

```typescript
// src/components/marketplace/MarketplaceCard.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Star } from "lucide-react";

interface MarketplaceCardProps {
  listing: {
    id: string;
    title: string;
    type: string;
    category: string;
    priceCents?: number;
    priceType: string;
    images: string[];
    location?: { city: string; country: string };
    isFeatured?: boolean;
    sellerType?: string;
  };
  sellerRating?: number;
}

export function MarketplaceCard({ listing, sellerRating }: MarketplaceCardProps) {
  const priceDisplay = listing.priceType === "contact"
    ? "Consultar"
    : listing.priceCents
      ? `€${(listing.priceCents / 100).toFixed(2)}`
      : "";

  return (
    <Link href={`/marketplace/${listing.id}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        <div className="aspect-square relative bg-gray-100">
          {listing.images[0] ? (
            <Image
              src={listing.images[0]}
              alt={listing.title}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Sin imagen
            </div>
          )}
          {listing.isFeatured && (
            <Badge className="absolute top-2 right-2 bg-yellow-500">
              Destacado
            </Badge>
          )}
        </div>
        <CardHeader className="p-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{listing.type === "product" ? "Producto" : "Servicio"}</Badge>
            <Badge variant="secondary">{listing.category}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <h3 className="font-semibold line-clamp-2">{listing.title}</h3>
          <p className="text-lg font-bold text-primary mt-1">{priceDisplay}</p>
          {listing.location && (
            <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
              <MapPin className="w-3 h-3" />
              {listing.location.city}, {listing.location.country}
            </div>
          )}
        </CardContent>
        <CardFooter className="p-3 pt-0 flex items-center justify-between">
          {sellerRating && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm">{sellerRating.toFixed(1)}</span>
            </div>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/marketplace/MarketplaceCard.tsx
git commit -m "feat: add marketplace card component"
```

---

### Task 10: Crear componentes de empleo

**Archivos:**
- Crear: `src/components/empleo/JobCard.tsx`
- Crear: `src/components/empleo/JobFilters.tsx`
- Crear: `src/components/empleo/JobForm.tsx`

**Step 1: Crear JobCard**

```typescript
// src/components/empleo/JobCard.tsx
"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Building2, Clock } from "lucide-react";

interface JobCardProps {
  job: {
    id: string;
    title: string;
    category: string;
    location?: { city: string; country: string };
    jobType: string;
    salary?: { min?: number; max?: number; type: string };
    academyName?: string;
    isFeatured?: boolean;
    createdAt: string;
  };
}

const jobTypeLabels: Record<string, string> = {
  full_time: "Tiempo completo",
  part_time: "Tiempo parcial",
  internship: "Práctica",
};

export function JobCard({ job }: JobCardProps) {
  const salaryDisplay = job.salary?.type === "contact"
    ? "Consultar"
    : job.salary?.min
      ? `€${job.salary.min}${job.salary.max ? ` - €${job.salary.max}` : ""}`
      : "";

  return (
    <Link href={`/empleo/${job.id}`}>
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline">{jobTypeLabels[job.jobType]}</Badge>
                <Badge variant="secondary">{job.category}</Badge>
              </div>
              <h3 className="font-semibold text-lg">{job.title}</h3>
            </div>
            {job.isFeatured && (
              <Badge className="bg-yellow-500">Destacado</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {job.academyName && (
            <div className="flex items-center gap-1 text-sm text-gray-600 mb-2">
              <Building2 className="w-4 h-4" />
              {job.academyName}
            </div>
          )}
          {job.location && (
            <div className="flex items-center gap-1 text-sm text-gray-500 mb-2">
              <MapPin className="w-4 h-4" />
              {job.location.city}, {job.location.country}
            </div>
          )}
          {salaryDisplay && (
            <p className="font-semibold text-primary">{salaryDisplay}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/empleo/JobCard.tsx
git commit -m "feat: add job card component"
```

---

### Task 11: Crear componente de banner publicitario

**Archivos:**
- Crear: `src/components/advertising/AdBanner.tsx`

**Step 1: Crear AdBanner**

```typescript
// src/components/advertising/AdBanner.tsx
"use client";

import Link from "next/link";
import Image from "next/image";

interface AdBannerProps {
  ads: Array<{
    id: string;
    type: string;
    imageUrl?: string;
    linkUrl: string;
    title: string;
    altText?: string;
  }>;
  position: "top" | "sidebar" | "between";
}

export function AdBanner({ ads, position }: AdBannerProps) {
  if (!ads || ads.length === 0) return null;

  const banner = ads[0]; // Mostrar primer anuncio activo

  if (position === "sidebar") {
    return (
      <Link href={banner.linkUrl} target="_blank" className="block">
        {banner.imageUrl ? (
          <Image
            src={banner.imageUrl}
            alt={banner.altText || banner.title}
            width={300}
            height={250}
            className="rounded-lg"
          />
        ) : (
          <div className="w-[300px] h-[250px] bg-gray-100 rounded-lg flex items-center justify-center">
            <span className="text-gray-400">Publicidad</span>
          </div>
        )}
      </Link>
    );
  }

  return (
    <Link href={banner.linkUrl} target="_blank" className="block my-4">
      {banner.imageUrl ? (
        <Image
          src={banner.imageUrl}
          alt={banner.altText || banner.title}
          width={970}
          height={90}
          className="rounded-lg w-full"
        />
      ) : (
        <div className="w-full h-[90px] bg-gray-100 rounded-lg flex items-center justify-center">
          <span className="text-gray-400">Publicidad</span>
        </div>
      )}
    </Link>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/advertising/AdBanner.tsx
git commit -m "feat: add advertising banner component"
```

---

## FASE 4: Páginas

### Task 12: Crear página de marketplace

**Archivos:**
- Crear: `src/app/(public)/marketplace/page.tsx`

**Step 1: Crear página**

```typescript
// src/app/(public)/marketplace/page.tsx
import { Metadata } from "next";
import { MarketplaceCard } from "@/components/marketplace/MarketplaceCard";
import { MarketplaceFilters } from "@/components/marketplace/MarketplaceFilters";
import { AdBanner } from "@/components/advertising/AdBanner";

export const metadata: Metadata = {
  title: "Marketplace | Zaltyko",
  description: "Compra y vende productos y servicios para gimnastas",
};

async function getListings(searchParams: { category?: string; type?: string; search?: string; page?: string }) {
  const params = new URLSearchParams();
  if (searchParams.category) params.set("category", searchParams.category);
  if (searchParams.type) params.set("type", searchParams.type);
  if (searchParams.search) params.set("search", searchParams.search);
  if (searchParams.page) params.set("page", searchParams.page);

  const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/marketplace?${params}`, {
    cache: "no-store",
  });
  return res.json();
}

async function getAds(zone: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/advertising/zones/${zone}`, {
    cache: "no-store",
  });
  return res.json();
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: { category?: string; type?: string; search?: string; page?: string };
}) {
  const { items: listings, total, page, totalPages } = await getListings(searchParams);
  const { ads: topAds } = await getAds("marketplace_top");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Marketplace</h1>

      <AdBanner ads={topAds} position="top" />

      <div className="flex gap-8 mt-6">
        <aside className="w-64 hidden md:block">
          <MarketplaceFilters />
        </aside>

        <main className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings?.map((listing: any) => (
              <MarketplaceCard key={listing.id} listing={listing} />
            ))}
          </div>

          {listings?.length === 0 && (
            <p className="text-center text-gray-500 py-12">
              No hay productos o servicios disponibles
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/\(public\)/marketplace/page.tsx
git commit -m "feat: add marketplace page"
```

---

### Task 13: Crear página de bolsa de empleo

**Archivos:**
- Crear: `src/app/(public)/empleo/page.tsx`

**Step 1: Crear página**

```typescript
// src/app/(public)/empleo/page.tsx
import { Metadata } from "next";
import { JobCard } from "@/components/empleo/JobCard";
import { JobFilters } from "@/components/empleo/JobFilters";
import { AdBanner } from "@/components/advertising/AdBanner";

export const metadata: Metadata = {
  title: "Bolsa de Empleo | Zaltyko",
  description: "Encuentra trabajo en academias de gimnasia",
};

async function getJobs(searchParams: { category?: string; jobType?: string; search?: string; page?: string }) {
  const params = new URLSearchParams();
  if (searchParams.category) params.set("category", searchParams.category);
  if (searchParams.jobType) params.set("jobType", searchParams.jobType);
  if (searchParams.search) params.set("search", searchParams.search);
  if (searchParams.page) params.set("page", searchParams.page);

  const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/empleo?${params}`, {
    cache: "no-store",
  });
  return res.json();
}

async function getAds(zone: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/advertising/zones/${zone}`, {
    cache: "no-store",
  });
  return res.json();
}

export default async function EmpleoPage({
  searchParams,
}: {
  searchParams: { category?: string; jobType?: string; search?: string; page?: string };
}) {
  const { items: jobs, total } = await getJobs(searchParams);
  const { ads: topAds } = await getAds("empleo_top");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Bolsa de Empleo</h1>

      <AdBanner ads={topAds} position="top" />

      <div className="flex gap-8 mt-6">
        <aside className="w-64 hidden md:block">
          <JobFilters />
        </aside>

        <main className="flex-1 space-y-4">
          <p className="text-gray-600">{total} ofertas disponibles</p>

          {jobs?.map((job: any) => (
            <JobCard key={job.id} job={job} />
          ))}

          {jobs?.length === 0 && (
            <p className="text-center text-gray-500 py-12">
              No hay ofertas de empleo disponibles
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/\(public\)/empleo/page.tsx
git commit -m "feat: add employment page"
```

---

### Task 14: Añadir navegación al navbar

**Archivos:**
- Modificar: `src/app/(site)/Navbar.tsx`

**Step 1: Añadir links al navbar**

```typescript
// En el navbar, añadir después de Events
<Link href="/marketplace" className="text-sm font-medium hover:text-primary">
  Marketplace
</Link>
<Link href="/empleo" className="text-sm font-medium hover:text-primary">
  Empleo
</Link>
```

**Step 2: Commit**

```bash
git add src/app/\(site\)/Navbar.tsx
git commit -m "feat: add marketplace and empleo nav links"
```

---

## FASE 5: Migración de Base de Datos

### Task 15: Generar y ejecutar migración

**Step 1: Generar migración**

```bash
cd /Users/elvisvaldesinerarte/workspace/Zaltyko
npm run db:generate
```

**Step 2: Aplicar migración**

```bash
npm run db:migrate
```

**Step 3: Commit**

```bash
git add drizzle/
git commit -m "feat: add marketplace and employment tables"
```

---

## Resumen de Tareas Completadas

- Task 1-5: Schema de base de datos
- Task 6-8: API Routes
- Task 9-11: Componentes UI
- Task 12-14: Páginas
- Task 15: Migración

**Próximos pasos opcionales:**
- Sistema de mensajería interna
- Perfiles de vendedor con ratings
- Detalle de listings
- Formularios de creación
- Panel de admin para publicidad

---

## Notas de Implementación

- Las páginas usan Server Components para SEO
- Los filtros son Client Components
- Las imágenes se almacenan en Supabase Storage
- Rate limiting en APIs públicas
- SEO metadata en cada página
