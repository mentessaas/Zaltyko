import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getPublicPageBySlug } from "@/lib/actor-pages/service";
import { buildMetadata, buildSchemaOrg } from "@/lib/actor-pages/seo";
import { themeToCssVars, DEFAULT_THEME, type Theme } from "@/lib/actor-pages/theme";
import { publicUi } from "@/lib/actor-pages/i18n";
import type { Locale } from "@/i18n";
import type { EntityType } from "@/lib/actor-pages/blocks-config";

type Props = {
  entityType: EntityType;
  slug: string;
  locale: Locale;
};

export async function generateMetadataForActor(
  entityType: EntityType,
  page: NonNullable<Awaited<ReturnType<typeof getPublicPageBySlug>>>,
  locale: Locale
): Promise<Metadata> {
  return buildMetadata({
    entityType,
    page: {
      displayName: page.displayName,
      tagline: page.tagline,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      seoImageUrl: page.seoImageUrl,
      publicSlug: page.publicSlug,
      language: locale,
    },
  });
}

export default async function PublicPageRenderer({
  entityType,
  slug,
  locale,
}: Props) {
  const page = await getPublicPageBySlug(slug);
  if (!page || page.entityType !== entityType) notFound();

  const theme: Theme = {
    ...DEFAULT_THEME,
    ...((page as { theme?: Theme }).theme ?? {}),
  };
  const cssVars = themeToCssVars(theme);
  const t = publicUi(locale);
  const socialLinks =
    page.socialLinks &&
    typeof page.socialLinks === "object" &&
    !Array.isArray(page.socialLinks)
      ? (page.socialLinks as Record<string, string>)
      : {};

  const jsonLd = buildSchemaOrg({
    entityType,
    page: {
      displayName: page.displayName,
      tagline: page.tagline,
      seoDescription: page.seoDescription,
      photoUrl: page.photoUrl,
      contactEmail: page.contactEmail,
      contactPhone: page.contactPhone,
      socialLinks,
      publicSlug: page.publicSlug,
      academyDisplayName: null,
    },
  });

  const radius = theme.border_radius ?? "md";
  const showLogo = theme.show_logo !== false && !!theme.logo_url;
  const isDark = theme.background === "dark";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `:root{${cssVars}} body{font-family:var(--z-font);background:${
            isDark ? "#0f172a" : "#ffffff"
          };color:${isDark ? "#e7ecf5" : "#0f172a"}} .z-card{background:${
            isDark ? "#131c33" : "#ffffff"
          };border-radius:var(--z-radius);padding:24px;box-shadow:0 4px 16px rgba(0,0,0,.06)} .z-link{color:var(--z-primary)} .z-photo{border-radius:var(--z-radius);object-fit:cover}`,
        }}
      />
      <main
        lang={locale}
        style={{
          maxWidth: 880,
          margin: "0 auto",
          padding: "32px 20px",
        }}
      >
        <header style={{ textAlign: "center", marginBottom: 32 }}>
          {showLogo && theme.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme.logo_url}
              alt={page.displayName}
              className="z-photo"
              style={{
                width: 80,
                height: 80,
                borderRadius: 8,
                objectFit: "contain",
                margin: "0 auto 16px",
                background: "white",
                padding: 8,
              }}
            />
          ) : page.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.photoUrl}
              alt={page.displayName}
              className="z-photo"
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                objectFit: "cover",
                margin: "0 auto 16px",
              }}
            />
          ) : null}
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}>
            {page.displayName}
          </h1>
          {page.tagline ? (
            <p style={{ opacity: 0.7, fontSize: 16, margin: 0 }}>
              {page.tagline}
            </p>
          ) : null}
        </header>

        {Array.isArray(page.bioBlocks) && page.bioBlocks.length > 0 ? (
          <section className="z-card" style={{ marginBottom: 32 }}>
            {page.bioBlocks.map((block: Record<string, unknown>, i: number) => (
              <div key={i} style={{ marginBottom: 16 }}>
                {renderBlock(block)}
              </div>
            ))}
          </section>
        ) : null}

        {(page.contactEmail || page.contactPhone) &&
        entityType !== "athlete" ? (
          <section className="z-card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>
              {t.contactTitle}
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {page.contactEmail ? (
                <li style={{ marginBottom: 6 }}>
                  <strong>{t.emailLabel}</strong>{" "}
                  <a href={`mailto:${page.contactEmail}`} className="z-link">
                    {page.contactEmail}
                  </a>
                </li>
              ) : null}
              {page.contactPhone ? (
                <li style={{ marginBottom: 6 }}>
                  <strong>{t.phoneLabel}</strong> {page.contactPhone}
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        <footer
          style={{
            marginTop: 48,
            paddingTop: 16,
            borderTop: `1px solid ${
              isDark ? "#1c2745" : "#e2e8f0"
            }`,
            opacity: 0.5,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          <a href="https://zaltyko.com" className="z-link">
            {t.poweredBy}
          </a>
        </footer>
      </main>
    </>
  );
}

function renderBlock(block: Record<string, unknown>) {
  if (!block || typeof block !== "object") return null;
  if (block.type === "heading" && typeof block.heading === "string") {
    return (
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
        {block.heading}
      </h2>
    );
  }
  if (typeof block.text === "string") {
    return (
      <p style={{ lineHeight: 1.6, margin: 0, opacity: 0.85 }}>{block.text}</p>
    );
  }
  return null;
}
