"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

interface ReportCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  href: string;
  color: string;
  compact?: boolean;
}

export function ReportCard({ title, description, icon, href, color, compact }: ReportCardProps) {
  if (compact) {
    return (
      <Link href={href}>
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`p-3 rounded-lg ${color}`}>
              {icon}
            </div>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={href}>
      <Card className="hover:shadow-lg transition-all cursor-pointer group h-full">
        <CardContent className="p-6 flex flex-col h-full">
          <div className={`p-3 rounded-lg w-fit ${color} mb-4 group-hover:scale-110 transition-transform`}>
            {icon}
          </div>
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground flex-grow">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
