"use client";

import { Star, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PopularClassesWidgetProps {
  academyId: string;
}

const PLACEHOLDER_CLASSES = [
  { name: "Precompetición Nivel 1", athletes: 12, rating: 4.8 },
  { name: "Competición Base", athletes: 8, rating: 4.6 },
  { name: "Iniciación Avanzada", athletes: 15, rating: 4.5 },
  { name: "Gimnasia Artistica", athletes: 20, rating: 4.3 },
];

export function PopularClassesWidget({ academyId }: PopularClassesWidgetProps) {
  return (
    <Card className="border-zaltyko-mist/80 shadow-soft">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display font-semibold">
          <Star className="h-5 w-5 text-zaltyko-indigo" />
          Clases populares
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {PLACEHOLDER_CLASSES.map((cls, index) => (
          <div
            key={index}
            className="flex items-center justify-between rounded-xl bg-zaltyko-white p-3 transition-colors hover:bg-zaltyko-teal/5"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zaltyko-indigo/10 text-xs font-semibold text-zaltyko-indigo">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-zaltyko-navy">{cls.name}</p>
                <p className="text-xs text-zaltyko-text-secondary">{cls.athletes} atletas</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-zaltyko-teal">
              <Star className="h-3 w-3 fill-current" />
              <span className="text-sm font-semibold">{cls.rating}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
