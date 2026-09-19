import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { coaches, academies } from "@/db/schema";
import { eq, and, inArray, or } from "drizzle-orm";
import { PublicCoachProfile } from "@/components/coaches/PublicCoachProfile";
import { Schema } from "@/components/Schema";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { coachJsonLd } from "@/lib/seo/coach-schema";
import { z } from "zod";

interface PageProps {
    params: Promise<{
        slug: string;
    }>;
}

// Generate metadata for SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const coachIdentity = z.string().uuid().safeParse(slug).success
        ? or(eq(coaches.slug, slug), eq(coaches.id, slug))
        : eq(coaches.slug, slug);
    const [coach] = await db
        .select({
            name: coaches.name,
            publicBio: coaches.publicBio,
            photoUrl: coaches.photoUrl,
            academyName: academies.name,
        })
        .from(coaches)
        .innerJoin(academies, eq(coaches.academyId, academies.id))
        .where(
            and(
                coachIdentity,
                eq(coaches.isPublic, true),
                eq(academies.isPublic, true),
                eq(academies.isSuspended, false),
                inArray(academies.status, ["active", "trial"])
            )
        )
        .limit(1);

    if (!coach) {
        return {
            title: "Coach no encontrado",
        };
    }

    const description = coach.publicBio
        ? coach.publicBio.substring(0, 160)
        : `${coach.name} - Coach de gimnasta artística en ${coach.academyName}`;

    return {
        title: `${coach.name} - Coach de Gimnasia`,
        description,
        alternates: {
            canonical: `${getPublicSiteUrl()}/coaches/${slug}`,
        },
        openGraph: {
            title: `${coach.name} - Coach de Gimnasia`,
            description,
            images: coach.photoUrl ? [coach.photoUrl] : [],
            type: "profile",
        },
        twitter: {
            card: "summary_large_image",
            title: `${coach.name} - Coach de Gimnasia`,
            description,
            images: coach.photoUrl ? [coach.photoUrl] : [],
        },
    };
}

export default async function CoachPublicPage({ params }: PageProps) {
    const { slug } = await params;
    const coachIdentity = z.string().uuid().safeParse(slug).success
        ? or(eq(coaches.slug, slug), eq(coaches.id, slug))
        : eq(coaches.slug, slug);
    // Fetch coach data
    const [coach] = await db
        .select({
            id: coaches.id,
            name: coaches.name,
            slug: coaches.slug,
            photoUrl: coaches.photoUrl,
            publicBio: coaches.publicBio,
            specialties: coaches.specialties,
            yearsExperience: coaches.yearsExperience,
            certifications: coaches.certifications,
            achievements: coaches.achievements,
            photoGallery: coaches.photoGallery,
            socialLinks: coaches.socialLinks,
            academyId: academies.id,
            academyName: academies.name,
        })
        .from(coaches)
        .innerJoin(academies, eq(coaches.academyId, academies.id))
        .where(
            and(
                coachIdentity,
                eq(coaches.isPublic, true),
                eq(academies.isPublic, true),
                eq(academies.isSuspended, false),
                inArray(academies.status, ["active", "trial"])
            )
        )
        .limit(1);

    if (!coach) {
        notFound();
    }

    // Transform data for component
    const coachData = {
        id: coach.id,
        name: coach.name,
        slug: coach.slug!,
        photoUrl: coach.photoUrl,
        publicBio: coach.publicBio,
        specialties: coach.specialties,
        yearsExperience: coach.yearsExperience,
        certifications: (coach.certifications as any) || [],
        achievements: (coach.achievements as any) || [],
        photoGallery: coach.photoGallery,
        socialLinks: coach.socialLinks as any,
        academyName: coach.academyName,
        academySlug: coach.academyId, // Use ID as slug
    };

    const baseUrl = getPublicSiteUrl();
    const sameAs = coach.socialLinks
      ? (Object.values(coach.socialLinks as Record<string, unknown>).filter(
          (v): v is string => typeof v === "string" && v.length > 0,
        ) as string[])
      : undefined;

    const coachSchema = coachJsonLd({
      baseUrl,
      pagePath: `/coaches/${slug}`,
      name: coach.name,
      description: coach.publicBio,
      imageUrl: coach.photoUrl,
      jobTitle: "Entrenador de gimnasia artística y rítmica",
      worksFor: {
        name: coach.academyName,
        url: `${baseUrl}/academias/${coach.academyId}`,
      },
      knowsAbout: coach.specialties ?? undefined,
      sameAs,
    });

    return (
        <>
            {coachSchema && <Schema json={coachSchema} />}
            <PublicCoachProfile coach={coachData} />
        </>
    );
}

// Los perfiles se resuelven bajo demanda. El build nunca enumera filas de la DB.
export const dynamic = "force-dynamic";
