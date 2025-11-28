"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Calendar, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";

interface DowngradeModalProps {
    open: boolean;
    onClose: () => void;
    currentPlan: "pro" | "premium";
    targetPlan: "free" | "pro";
    onConfirm: () => Promise<void>;
    currentUsage?: {
        athletes: number;
        coaches: number;
        classes: number;
        storage_mb: number;
    };
    subscriptionEndDate?: Date;
}

const PLAN_LIMITS = {
    free: {
        name: "Free",
        athletes: 50,
        coaches: 2,
        classes: 5,
        storage_mb: 100,
    },
    pro: {
        name: "Pro",
        athletes: 200,
        coaches: 10,
        classes: 50,
        storage_mb: 1000,
    },
};

export function DowngradeModal({
    open,
    onClose,
    currentPlan,
    targetPlan,
    onConfirm,
    currentUsage = { athletes: 0, coaches: 0, classes: 0, storage_mb: 0 },
    subscriptionEndDate = addDays(new Date(), 30),
}: DowngradeModalProps) {
    const [loading, setLoading] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    const targetLimits = PLAN_LIMITS[targetPlan];
    const effectiveDate = format(subscriptionEndDate, "d 'de' MMMM 'de' yyyy", { locale: es });

    // Calcular advertencias
    const warnings: string[] = [];
    if (currentUsage.athletes > targetLimits.athletes) {
        warnings.push(`Tienes ${currentUsage.athletes} atletas, pero el plan ${targetLimits.name} solo permite ${targetLimits.athletes}`);
    }
    if (currentUsage.coaches > targetLimits.coaches) {
        warnings.push(`Tienes ${currentUsage.coaches} entrenadores, pero el plan ${targetLimits.name} solo permite ${targetLimits.coaches}`);
    }
    if (currentUsage.classes > targetLimits.classes) {
        warnings.push(`Tienes ${currentUsage.classes} clases activas, pero el plan ${targetLimits.name} solo permite ${targetLimits.classes}`);
    }
    if (currentUsage.storage_mb > targetLimits.storage_mb) {
        warnings.push(`Usas ${Math.round(currentUsage.storage_mb)} MB, pero el plan ${targetLimits.name} solo permite ${targetLimits.storage_mb} MB`);
    }

    const hasWarnings = warnings.length > 0;

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm();
            onClose();
        } catch (error) {
            console.error("Error:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="text-2xl flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-amber-500" />
                        Cambiar a Plan {targetLimits.name}
                    </DialogTitle>
                    <DialogDescription>
                        Revisa cuidadosamente los cambios antes de confirmar
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Effective Date */}
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
                        <Calendar className="w-5 h-5 text-blue-600" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-blue-900">
                                Fecha efectiva del cambio
                            </p>
                            <p className="text-sm text-blue-700">
                                {effectiveDate}
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                                Seguirás teniendo acceso a tu plan actual hasta esta fecha
                            </p>
                        </div>
                    </div>

                    {/* Warnings */}
                    {hasWarnings && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                <h4 className="font-semibold text-amber-900">
                                    Advertencias importantes
                                </h4>
                            </div>

                            <div className="space-y-2">
                                {warnings.map((warning, idx) => (
                                    <div key={idx} className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                        <p className="text-sm text-amber-900">{warning}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                                <p className="text-sm font-semibold text-amber-900 mb-2">
                                    ¿Qué pasará con mis datos?
                                </p>
                                <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                                    <li>Los datos que excedan los límites se mantendrán en modo solo lectura</li>
                                    <li>No podrás agregar nuevos registros hasta estar dentro de los límites</li>
                                    <li>Puedes hacer upgrade en cualquier momento para recuperar el acceso completo</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Plan Comparison */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg border-2 border-zaltyko-primary bg-zaltyko-primary/5">
                            <p className="text-xs text-zaltyko-text-light mb-2">Plan Actual</p>
                            <p className="text-lg font-bold mb-3">{currentPlan === "pro" ? "Pro" : "Premium"}</p>
                            <div className="space-y-1 text-sm">
                                <p>Atletas: {currentPlan === "premium" ? "∞" : "200"}</p>
                                <p>Coaches: {currentPlan === "premium" ? "∞" : "10"}</p>
                                <p>Clases: {currentPlan === "premium" ? "∞" : "50"}</p>
                            </div>
                        </div>

                        <div className="p-4 rounded-lg border-2 border-gray-300 bg-gray-50">
                            <p className="text-xs text-zaltyko-text-light mb-2">Nuevo Plan</p>
                            <p className="text-lg font-bold mb-3">{targetLimits.name}</p>
                            <div className="space-y-1 text-sm">
                                <p>Atletas: {targetLimits.athletes}</p>
                                <p>Coaches: {targetLimits.coaches}</p>
                                <p>Clases: {targetLimits.classes}</p>
                            </div>
                        </div>
                    </div>

                    {/* Confirmation Checkbox */}
                    {hasWarnings && (
                        <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-amber-300 bg-amber-50">
                            <input
                                type="checkbox"
                                id="confirm-downgrade"
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                                className="mt-1"
                            />
                            <label htmlFor="confirm-downgrade" className="text-sm text-amber-900 cursor-pointer">
                                Entiendo que algunos de mis datos quedarán en modo solo lectura y acepto las limitaciones del plan {targetLimits.name}
                            </label>
                        </div>
                    )}

                    {/* Info Box */}
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200">
                        <Info className="w-5 h-5 text-gray-600 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm text-gray-700">
                                Puedes cancelar este cambio programado en cualquier momento antes de la fecha efectiva.
                                También puedes hacer upgrade nuevamente sin penalización.
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={loading || (hasWarnings && !confirmed)}
                        variant="destructive"
                    >
                        {loading ? "Procesando..." : "Confirmar Cambio"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
