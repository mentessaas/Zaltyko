import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { coaches, academies } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { PublicCoachProfile } from "@/components/coaches/PublicCoachProfile";

interface PageProps {
    params: {
        slug: string;
    };
}

// Generate metadata for SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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
                eq(coaches.slug, params.slug),
                eq(coaches.isPublic, true)
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
        : `${coach.name} - Coach de gimnasia artística en ${coach.academyName}`;

    return {
        title: `${coach.name} - Coach de Gimnasia | Zaltyko`,
        description,
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
                eq(coaches.slug, params.slug),
                eq(coaches.isPublic, true)
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

    return (
        <>
            {/* Structured Data for SEO */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "Person",
                        name: coach.name,
                        description: coach.publicBio || `Coach de gimnasia artística`,
                        image: coach.photoUrl,
                        jobTitle: "Coach de Gimnasia Artística",
                        worksFor: {
                            "@type": "SportsActivityLocation",
                            name: coach.academyName,
                        },
                        ...(coach.socialLinks && {
                            sameAs: Object.values(coach.socialLinks).filter(Boolean),
                        }),
                    }),
                }}
            />

            <PublicCoachProfile coach={coachData} />
        </>
    );
}

// Allow dynamic params at runtime (pages generated on-demand)
export const dynamicParams = true;

// Generate static params for all public coaches
// Returns empty array during build if DB is unavailable, pages will be generated at runtime
export async function generateStaticParams() {
    try {
        const publicCoaches = await db
            .select({ slug: coaches.slug })
            .from(coaches)
            .where(
                and(
                    eq(coaches.isPublic, true),
                    isNotNull(coaches.slug)
                )
            )
            .limit(100); // Limit for build performance

        return publicCoaches
            .filter((coach) => coach.slug)
            .map((coach) => ({
                slug: coach.slug!,
            }));
    } catch {
        // Database not available during build (e.g., Vercel build time)
        // Pages will be generated dynamically at runtime
        return [];
    }
}
