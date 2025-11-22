"use client";

import { Clock, MapPin, Users, Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Class {
  id: string;
  time: string;
  duration: string;
  title: string;
  scheduledIn: string;
  instructor?: {
    name: string;
    avatar?: string;
  };
  location?: string;
  capacity?: string;
  type?: "livestream" | "in-person";
  attendees?: number;
}

interface UpcomingClassesCardProps {
  title: string;
  date: string;
  classes: Class[];
}

export function UpcomingClassesCard({ title, date, classes }: UpcomingClassesCardProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <span className="text-xs text-zaltyko-text-secondary">{date}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {classes.map((classItem) => (
            <div key={classItem.id} className="flex gap-4 pb-4 border-b border-zaltyko-border last:border-0 last:pb-0">
              <div className="flex flex-col items-center gap-1 pt-1">
                <span className="text-xs font-medium text-zaltyko-text-secondary">{classItem.time}</span>
                <div className="w-px flex-1 bg-zaltyko-border" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-zaltyko-text-main">{classItem.title}</h4>
                    <p className="text-xs text-zaltyko-text-secondary mt-0.5">
                      {classItem.time} - {classItem.duration}
                    </p>
                  </div>
                  <span className="text-xs text-zaltyko-text-secondary">{classItem.scheduledIn}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zaltyko-text-secondary">
                  {classItem.instructor && (
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={classItem.instructor.avatar} />
                        <AvatarFallback className="text-[10px] bg-zaltyko-primary-light text-zaltyko-primary-dark">
                          {classItem.instructor.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span>{classItem.instructor.name}</span>
                    </div>
                  )}
                  {classItem.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span>{classItem.location}</span>
                    </div>
                  )}
                  {classItem.capacity && (
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{classItem.capacity}</span>
                    </div>
                  )}
                  {classItem.type === "livestream" && (
                    <div className="flex items-center gap-1 text-zaltyko-primary">
                      <Video className="h-3 w-3" />
                      <span>Livestream</span>
                    </div>
                  )}
                  {classItem.attendees !== undefined && (
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{classItem.attendees}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

