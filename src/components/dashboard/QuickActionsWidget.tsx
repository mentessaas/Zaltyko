"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, DollarSign, UserPlus, Users, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuickAction } from "./QuickAction";
import { QuickClassModal } from "./QuickClassModal";
import { QuickPaymentModal } from "./QuickPaymentModal";
import { useAcademyContext } from "@/hooks/use-academy-context";

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

interface QuickActionsWidgetProps {
    academyId: string;
}

export function QuickActionsWidget({ academyId }: QuickActionsWidgetProps) {
    const router = useRouter();
    const { specialization } = useAcademyContext();
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
            if (json.ok) {
                setData(json.data ?? null);
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
            <Card className="overflow-hidden border shadow-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <TrendingUp className="h-4 w-4" />
                        </div>
                        <span>Acciones rápidas</span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Accede a las tareas operativas más comunes con un solo clic
                    </p>
                </CardHeader>
                <CardContent className="grid gap-3 p-4">
                    <QuickAction
                        icon={<Calendar className="h-5 w-5" />}
                        label="Registrar Asistencia"
                        description={
                            data?.pendingClasses
                                ? `${data.pendingClasses} ${data.pendingClasses === 1 ? specialization.labels.classLabel.toLowerCase() : `${specialization.labels.classLabel.toLowerCase()}s`} de hoy`
                                : `No hay ${specialization.labels.classLabel.toLowerCase()}s hoy`
                        }
                        badge={data?.pendingClasses}
                        onClick={() => {
                            if (data?.todaysSessions && data.todaysSessions.length > 0) {
                                router.push(`/dashboard/sessions/${data.todaysSessions[0].id}`);
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
                        label={`${specialization.labels.athletesPlural} sin ${specialization.labels.groupLabel}`}
                        description={
                            data?.unassignedAthletes
                                ? `${data.unassignedAthletes} ${data.unassignedAthletes === 1 ? specialization.labels.athleteSingular.toLowerCase() : specialization.labels.athletesPlural.toLowerCase()} sin asignar`
                                : `Todos los ${specialization.labels.athletesPlural.toLowerCase()} están asignados`
                        }
                        badge={data?.unassignedAthletes}
                        onClick={() => {
                            router.push(`/app/${academyId}/athletes`);
                        }}
                        variant="secondary"
                        disabled={!data?.unassignedAthletes}
                    />

                    <QuickAction
                        icon={<Users className="h-5 w-5" />}
                        label={`Nuevo ${specialization.labels.classLabel}`}
                        description={`Crear ${specialization.labels.sessionLabel.toLowerCase()} para hoy`}
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
