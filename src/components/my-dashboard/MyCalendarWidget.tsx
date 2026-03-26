"use client";

interface MyCalendarWidgetProps {
  profileId?: string;
  sessionsByDay?: { date: string; sessions: unknown[] }[];
}

export function MyCalendarWidget({ sessionsByDay }: MyCalendarWidgetProps) {
  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-semibold mb-2">Calendario</h3>
      <p className="text-sm text-muted-foreground">Cargando...</p>
    </div>
  );
}
