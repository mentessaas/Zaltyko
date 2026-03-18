"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building2 } from "lucide-react";

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

const categoryLabels: Record<string, string> = {
  coach: "Entrenador",
  assistant_coach: "Asistente de Entrenador",
  administrative: "Administrativo",
  physiotherapist: "Fisioterapeuta",
  psychologist: "Psicólogo Deportivo",
  other: "Otro",
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
                <Badge variant="outline">{jobTypeLabels[job.jobType] || job.jobType}</Badge>
                <Badge variant="default">{categoryLabels[job.category] || job.category}</Badge>
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
