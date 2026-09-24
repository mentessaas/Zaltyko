import type { Metadata } from "next";
import { canonicalAcademyUrl } from "@/lib/subdomains/rewrite";

type EntityType = "academy" | "coach" | "athlete" | "supplier";

export type SchemaOrgBase = {
  "@context": "https://schema.org";
  "@type": string;
  name: string;
  url: string;
  description?: string;
  image?: string;
};

export type SchemaOrgAcademy = SchemaOrgBase & {
  "@type": "LocalBusiness" | "SportsActivityLocation";
  address?: string;
  email?: string;
  telephone?: string;
  sameAs?: string[];
};

export type SchemaOrgPerson = SchemaOrgBase & {
  "@type": "Person";
  jobTitle?: string;
  affiliation?: { "@type": "Organization"; name: string };
  sameAs?: string[];
};

export type SchemaOrgOrg = SchemaOrgBase & {
  "@type": "Organization";
  email?: string;
  telephone?: string;
  sameAs?: string[];
};

export function buildSchemaOrg(opts: {
  entityType: EntityType;
  page: {
    displayName: string;
    tagline?: string | null;
    seoDescription?: string | null;
    photoUrl?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    socialLinks?: Record<string, string>;
    publicSlug: string;
    academyDisplayName?: string | null;
    subdomainEnabled?: boolean;
  };
}): SchemaOrgAcademy | SchemaOrgPerson | SchemaOrgOrg {
  const url = canonicalAcademyUrl({
    slug: opts.page.publicSlug,
    subdomainEnabled: opts.page.subdomainEnabled ?? false,
  });

  const sameAs = Object.values(opts.page.socialLinks ?? {}).filter(Boolean);

  switch (opts.entityType) {
    case "academy": {
      const s: SchemaOrgAcademy = {
        "@context": "https://schema.org",
        "@type": "SportsActivityLocation",
        name: opts.page.displayName,
        url,
      };
      if (opts.page.seoDescription) s.description = opts.page.seoDescription;
      else if (opts.page.tagline) s.description = opts.page.tagline;
      if (opts.page.photoUrl) s.image = opts.page.photoUrl;
      if (opts.page.contactEmail) s.email = opts.page.contactEmail;
      if (opts.page.contactPhone) s.telephone = opts.page.contactPhone;
      if (sameAs.length) s.sameAs = sameAs;
      return s;
    }
    case "coach": {
      const s: SchemaOrgPerson = {
        "@context": "https://schema.org",
        "@type": "Person",
        name: opts.page.displayName,
        url,
        jobTitle: "Entrenador de gimnasia",
      };
      if (opts.page.seoDescription) s.description = opts.page.seoDescription;
      else if (opts.page.tagline) s.description = opts.page.tagline;
      if (opts.page.photoUrl) s.image = opts.page.photoUrl;
      if (opts.page.academyDisplayName) {
        s.affiliation = { "@type": "Organization", name: opts.page.academyDisplayName };
      }
      if (sameAs.length) s.sameAs = sameAs;
      return s;
    }
    case "athlete": {
      const s: SchemaOrgPerson = {
        "@context": "https://schema.org",
        "@type": "Person",
        name: opts.page.displayName,
        url,
      };
      if (opts.page.seoDescription) s.description = opts.page.seoDescription;
      else if (opts.page.tagline) s.description = opts.page.tagline;
      if (opts.page.photoUrl) s.image = opts.page.photoUrl;
      if (sameAs.length) s.sameAs = sameAs;
      return s;
    }
    case "supplier": {
      const s: SchemaOrgOrg = {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: opts.page.displayName,
        url,
      };
      if (opts.page.seoDescription) s.description = opts.page.seoDescription;
      else if (opts.page.tagline) s.description = opts.page.tagline;
      if (opts.page.photoUrl) s.image = opts.page.photoUrl;
      if (opts.page.contactEmail) s.email = opts.page.contactEmail;
      if (opts.page.contactPhone) s.telephone = opts.page.contactPhone;
      if (sameAs.length) s.sameAs = sameAs;
      return s;
    }
  }
}

export function entityTypePrefix(t: EntityType): "a" | "c" | "g" | "p" {
  if (t === "academy") return "a";
  if (t === "coach") return "c";
  if (t === "athlete") return "g";
  return "p";
}

export function buildMetadata(opts: {
  entityType: EntityType;
  page: {
    displayName: string;
    tagline?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    seoImageUrl?: string | null;
    publicSlug: string;
    language: string;
    subdomainEnabled?: boolean;
  };
}): Metadata {
  const url = canonicalAcademyUrl({
    slug: opts.page.publicSlug,
    subdomainEnabled: opts.page.subdomainEnabled ?? false,
  });
  const title = opts.page.seoTitle ?? `${opts.page.displayName} | Zaltyko`;
  const description =
    opts.page.seoDescription ??
    opts.page.tagline ??
    `${opts.page.displayName} en Zaltyko`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: opts.entityType === "academy" ? "website" : "profile",
      images: opts.page.seoImageUrl ? [opts.page.seoImageUrl] : undefined,
      locale: opts.page.language,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: opts.page.seoImageUrl ? [opts.page.seoImageUrl] : undefined,
    },
  };
}
