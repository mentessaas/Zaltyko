"use client";

import { Calendar, TrendingUp, Award } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TimelineEvent {
  id: string;
  type: "assessment" | "achievement" | "milestone";
  date: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

interface ProgressTimelineProps {
  events: TimelineEvent[];
}

export function ProgressTimeline({ events }: ProgressTimelineProps) {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Línea de Tiempo de Progreso</h3>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
        <div className="space-y-6">
          {sortedEvents.map((event, index) => (
            <div key={event.id} className="relative flex gap-4">
              <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {event.type === "assessment" && <Calendar className="h-4 w-4" />}
                {event.type === "achievement" && <Award className="h-4 w-4" />}
                {event.type === "milestone" && <TrendingUp className="h-4 w-4" />}
              </div>
              <div className="flex-1 pb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{event.title}</p>
                          <Badge variant="outline">
                            {format(new Date(event.date), "PPP", { locale: es })}
                          </Badge>
                        </div>
                        {event.description && (
                          <p className="text-sm text-muted-foreground">{event.description}</p>
                        )}
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {Object.entries(event.metadata).map(([key, value]) => (
                              <Badge key={key} variant="outline" className="text-xs">
                                {key}: {String(value)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

