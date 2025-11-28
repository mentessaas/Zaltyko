"use client";

import { useMemo } from "react";
import Link from "next/link";
import { parseISO, format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar, Clock, User, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type SessionEntry = {
    id: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    status: string;
    classId: string | null;
    className: string | null;
    academyName: string | null;
    coachName: string | null;
    targetUrl?: string;
    isPlaceholder?: boolean;
    isExtra?: boolean;
};

interface AgendaViewProps {
    sessions: SessionEntry[];
    rangeStart: string;
    rangeEnd: string;
}

const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700 border-blue-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    cancelled: "bg-red-100 text-red-700 border-red-200",
};

function getStatusColor(status: string) {
    return statusColors[status] ?? "bg-gray-100 text-gray-700 border-gray-200";
}

export function AgendaView({ sessions, rangeStart, rangeEnd }: AgendaViewProps) {
    // Group sessions by date
    const sessionsByDate = useMemo(() => {
        const grouped = sessions.reduce<Record<string, SessionEntry[]>>((acc, session) => {
            if (!acc[session.date]) {
                acc[session.date] = [];
            }
            acc[session.date].push(session);
            return acc;
        }, {});

        // Sort sessions within each date by start time
        Object.keys(grouped).forEach((date) => {
            grouped[date].sort((a, b) => {
                if (!a.startTime) return 1;
                if (!b.startTime) return -1;
                return a.startTime.localeCompare(b.startTime);
            });
        });

        return grouped;
    }, [sessions]);

    const sortedDates = useMemo(() => {
        return Object.keys(sessionsByDate).sort();
    }, [sessionsByDate]);

    if (sortedDates.length === 0) {
        return (
            <div className="flex min-h-[400px] items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20">
                <div className="text-center">
                    <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 text-lg font-medium text-muted-foreground">
                        No hay sesiones programadas
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Las sesiones aparecerán aquí cuando se programen
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {sortedDates.map((date) => {
                const daySessions = sessionsByDate[date];
                const dateObj = parseISO(date);
                const isToday = isSameDay(dateObj, new Date());

                return (
                    <div key={date} className="space-y-3">
                        {/* Date Header */}
                        <div
                            className={cn(
                                "sticky top-0 z-10 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm",
                                isToday && "border-primary/50 bg-primary/5"
                            )}
                        >
                            <Calendar className={cn("h-5 w-5", isToday ? "text-primary" : "text-muted-foreground")} />
                            <div>
                                <p className={cn("font-semibold", isToday && "text-primary")}>
                                    {format(dateObj, "EEEE, d 'de' MMMM", { locale: es })}
                                </p>
                                {isToday && (
                                    <span className="text-xs font-medium text-primary">Hoy</span>
                                )}
                            </div>
                            <span className="ml-auto rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                                {daySessions.length} {daySessions.length === 1 ? "sesión" : "sesiones"}
                            </span>
                        </div>

                        {/* Sessions List */}
                        <div className="space-y-2 pl-4">
                            {daySessions.map((session) => {
                                const content = (
                                    <div
                                        className={cn(
                                            "group relative flex items-start gap-4 rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md",
                                            session.isPlaceholder && "border-dashed border-amber-300 bg-amber-50/50"
                                        )}
                                    >
                                        {/* Time */}
                                        <div className="flex min-w-[80px] flex-col items-center rounded-lg bg-muted/50 px-3 py-2">
                                            <Clock className="h-4 w-4 text-muted-foreground" />
                                            {session.startTime ? (
                                                <>
                                                    <span className="text-sm font-semibold">
                                                        {session.startTime.substring(0, 5)}
                                                    </span>
                                                    {session.endTime && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {session.endTime.substring(0, 5)}
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Sin hora</span>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <h3 className="font-semibold text-foreground">
                                                        {session.className || "Clase sin nombre"}
                                                    </h3>
                                                    {session.academyName && (
                                                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                                                            <MapPin className="h-3 w-3" />
                                                            {session.academyName}
                                                        </p>
                                                    )}
                                                </div>
                                                <span
                                                    className={cn(
                                                        "rounded-full border px-3 py-1 text-xs font-semibold capitalize",
                                                        getStatusColor(session.status)
                                                    )}
                                                >
                                                    {session.status || "programada"}
                                                </span>
                                            </div>

                                            {session.coachName && (
                                                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                    <User className="h-3.5 w-3.5" />
                                                    {session.coachName}
                                                </p>
                                            )}

                                            {session.isPlaceholder && (
                                                <div className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                                                    ⚠️ Sesión no generada automáticamente
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );

                                if (session.targetUrl) {
                                    return (
                                        <Link key={session.id} href={session.targetUrl}>
                                            {content}
                                        </Link>
                                    );
                                }

                                return <div key={session.id}>{content}</div>;
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
