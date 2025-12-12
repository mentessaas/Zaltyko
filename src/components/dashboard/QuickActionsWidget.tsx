"use client";

import { useEffect, useState } from "react";
import { Calendar, DollarSign, UserPlus, Users, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuickAction } from "./QuickAction";
import { QuickClassModal } from "./QuickClassModal";
import { QuickPaymentModal } from "./QuickPaymentModal";

interface QuickActionsData {
    pendingClasses: number;
    overduePayments: number;
    unassignedAthletes: number;
    todaysSessions: Array<{
        id: string;
        className: string;
        time: string | null;
        classId: string;
    }>;
    overduePaymentsTotal: number;
}

export function QuickActionsWidget() {
    const [data, setData] = useState<QuickActionsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showClassModal, setShowClassModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    useEffect(() => {
        fetchPendingData();
    }, []);

    const fetchPendingData = async () => {
        try {
            const res = await fetch("/api/quick-actions/pending-today");
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            }
        } catch (error) {
            console.error("Error fetching quick actions:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Acciones Rápidas</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="animate-pulse space-y-3">
                        <div className="h-16 bg-muted rounded" />
                        <div className="h-16 bg-muted rounded" />
                        <div className="h-16 bg-muted rounded" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        Acciones Rápidas
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Accede a las tareas más comunes con un solo click
                    </p>
                </CardHeader>
                <CardContent className="grid gap-3">
                    <QuickAction
                        icon={<Calendar className="h-5 w-5" />}
                        label="Registrar Asistencia"
                        description={
                            data?.pendingClasses
                                ? `${data.pendingClasses} ${data.pendingClasses === 1 ? "clase" : "clases"} de hoy`
                                : "No hay clases hoy"
                        }
                        badge={data?.pendingClasses}
                        onClick={() => {
                            if (data?.todaysSessions && data.todaysSessions.length > 0) {
                                // Navegar a la primera clase del día
                                window.location.href = `/app/attendance?session=${data.todaysSessions[0].id}`;
                            }
                        }}
                        variant="default"
                        disabled={!data?.pendingClasses}
                    />

                    <QuickAction
                        icon={<DollarSign className="h-5 w-5" />}
                        label="Cobros Pendientes"
                        description={
                            data?.overduePayments
                                ? `${data.overduePayments} ${data.overduePayments === 1 ? "pago vencido" : "pagos vencidos"} - €${((data.overduePaymentsTotal || 0) / 100).toFixed(2)}`
                                : "Al día con pagos"
                        }
                        badge={data?.overduePayments}
                        onClick={() => setShowPaymentModal(true)}
                        variant={data?.overduePayments ? "destructive" : "default"}
                        disabled={!data?.overduePayments}
                    />

                    <QuickAction
                        icon={<UserPlus className="h-5 w-5" />}
                        label="Atletas sin Grupo"
                        description={
                            data?.unassignedAthletes
                                ? `${data.unassignedAthletes} ${data.unassignedAthletes === 1 ? "atleta" : "atletas"} sin asignar`
                                : "Todos asignados"
                        }
                        badge={data?.unassignedAthletes}
                        onClick={() => {
                            window.location.href = "/app/athletes";
                        }}
                        variant="secondary"
                        disabled={!data?.unassignedAthletes}
                    />

                    <QuickAction
                        icon={<Users className="h-5 w-5" />}
                        label="Nueva Clase Rápida"
                        description="Crear sesión para hoy"
                        onClick={() => setShowClassModal(true)}
                        variant="outline"
                    />
                </CardContent>
            </Card>

            {showClassModal && (
                <QuickClassModal
                    isOpen={showClassModal}
                    onClose={() => setShowClassModal(false)}
                    onSuccess={() => {
                        setShowClassModal(false);
                        fetchPendingData();
                    }}
                />
            )}

            {showPaymentModal && (
                <QuickPaymentModal
                    isOpen={showPaymentModal}
                    onClose={() => setShowPaymentModal(false)}
                    onSuccess={() => {
                        setShowPaymentModal(false);
                        fetchPendingData();
                    }}
                />
            )}
        </>
    );
}
