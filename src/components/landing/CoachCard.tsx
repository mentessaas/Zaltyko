"use client";

import { memo } from "react";
import Link from "next/link";
import { Award, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicCoach } from "@/lib/seo/clusters";

interface CoachCardProps {
  coach: PublicCoach;
  locale: "es" | "en";
}

const CoachCard = memo(function CoachCard({ coach, locale }: CoachCardProps) {
  const labels = {
    es: {
      experience: "experiencia",
      years: "años",
      viewProfile: "Ver perfil",
    },
    en: {
      experience: "experience",
      years: "years",
      viewProfile: "View profile",
    },
  };

  const t = labels[locale];

  return (
    <Card className="group card-hover h-full overflow-hidden border border-gray-100 bg-white hover:border-zaltyko-indigo/30">
      <CardContent className="p-5">
        {/* Photo and Name */}
        <div className="flex items-start gap-4 mb-4">
          {coach.photoUrl ? (
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-50 flex-shrink-0 ring-2 ring-zaltyko-indigo/15">
              <img
                src={coach.photoUrl}
                alt={coach.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-zaltyko-indigo/10">
              <span className="text-2xl font-bold text-zaltyko-indigo">
                {coach.name.charAt(0)}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-lg leading-tight">
              {coach.name}
            </h3>
            <p className="text-sm text-zaltyko-indigo font-medium mt-1">
              {coach.academyName}
            </p>
          </div>
        </div>

        {/* Bio */}
        {coach.publicBio && (
          <p className="text-sm text-gray-600 line-clamp-3 mb-4">
            {coach.publicBio}
          </p>
        )}

        {/* Specialties */}
        {coach.specialties && coach.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {coach.specialties.slice(0, 4).map((specialty, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zaltyko-indigo/10 text-zaltyko-indigo text-xs font-medium"
              >
                <Award className="h-3 w-3" />
                {specialty}
              </span>
            ))}
          </div>
        )}

        {/* Experience */}
        {coach.yearsExperience && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
            <Clock className="h-4 w-4" />
            <span>
              {coach.yearsExperience} {t.years} {t.experience}
            </span>
          </div>
        )}

        {/* CTA */}
        {coach.academySlug && (
          <Link
            href={`/coaches/${coach.academySlug}`}
            className="inline-flex items-center text-sm font-medium text-zaltyko-indigo hover:text-zaltyko-navy transition-colors pt-3 border-t border-gray-100"
          >
            {t.viewProfile}
            <svg
              className="ml-1 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        )}
      </CardContent>
    </Card>
  );
});

export default CoachCard;
