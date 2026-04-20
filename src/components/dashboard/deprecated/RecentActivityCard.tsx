"use client";

import { CreditCard, Calendar, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Activity {
  id: string;
  userName: string;
  userAvatar?: string;
  action: string;
  timeAgo: string;
  icon: "membership" | "calendar" | "user";
}

interface RecentActivityCardProps {
  title: string;
  period: string;
  activities: Activity[];
}

const iconMap = {
  membership: CreditCard,
  calendar: Calendar,
  user: User,
};

export function RecentActivityCard({ title, period, activities }: RecentActivityCardProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <span className="text-xs text-zaltyko-text-secondary">{period}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => {
            const Icon = iconMap[activity.icon];
            return (
              <div key={activity.id} className="flex items-start gap-3">
                <Avatar className="h-8 w-8 border border-zaltyko-border">
                  <AvatarImage src={activity.userAvatar} />
                  <AvatarFallback className="text-xs bg-zaltyko-primary-light text-zaltyko-primary-dark">
                    {activity.userName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zaltyko-text-main">
                        <span className="font-semibold">{activity.userName}</span> {activity.action}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-zaltyko-text-secondary">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                    </div>
                  </div>
                  <p className="text-xs text-zaltyko-text-secondary mt-1">{activity.timeAgo}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

