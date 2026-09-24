"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DollarSign, CreditCard, Wallet } from "lucide-react";
import { logger } from "@/lib/logger";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { formatMinorCurrency, getCurrencyForCountry } from "@/lib/currency";
import { formatDateToISOString, formatShortDateForCountry } from "@/lib/date-utils";

interface QuickPaymentModalProps {
    academyId: string;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface OverdueCharge {
    id: string;
    athleteId: string;
    athleteName?: string;
    amountCents: number;
    currency?: string | null;
    dueDate: string;
}

export function QuickPaymentModal({ academyId, isOpen, onClose, onSuccess }: QuickPaymentModalProps) {
    const { academyCountry } = useAcademyContext();
    const defaultCurrency = getCurrencyForCountry(academyCountry);
    const [charges, setCharges] = useState<OverdueCharge[]>([]);
    const [selectedCharge, setSelectedCharge] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [loading, setLoading] = useState(false);
    const [loadingCharges, setLoadingCharges] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchOverdueCharges();
        }
    }, [isOpen, academyId]);

    const fetchOverdueCharges = async () => {
        setLoadingCharges(true);
        setLoadError(null);
        try {
            const today = formatDateToISOString(new Date(), academyCountry);
            const res = await fetch(`/api/charges?academyId=${encodeURIComponent(academyId)}&status=pending,overdue&dueBefore=${today}&limit=10`, { cache: "no-store" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setLoadError(json.message ?? json.error ?? "No se pudieron cargar los pagos vencidos");
                setCharges([]);
                setSelectedCharge("");
            } else if ((json.ok || json.success) && json.data) {
                const rows = Array.isArray(json.data) ? json.data : json.data.items ?? [];
                setCharges(rows);
                if (rows.length > 0) {
                    setSelectedCharge(rows[0].id);
                } else {
                    setSelectedCharge("");
                }
            } else {
                setLoadError(json.message ?? json.error ?? "No se pudieron cargar los pagos vencidos");
                setCharges([]);
                setSelectedCharge("");
            }
        } catch (error) {
            logger.error("Error fetching overdue charges:", error);
            setLoadError("Error de conexión. Intenta de nuevo.");
        } finally {
            setLoadingCharges(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSubmitError(null);

        try {
            const res = await fetch("/api/quick-actions/record-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chargeId: selectedCharge,
                    academyId,
                    amountCents: selectedChargeData?.amountCents,
                    paymentMethod,
                }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSubmitError(json.message ?? json.error ?? "No se pudo registrar el pago");
                return;
            }
            if (json.ok || json.success) {
                onSuccess();
            } else {
                setSubmitError(json.message ?? "No se pudo registrar el pago");
            }
        } catch (error) {
            logger.error("Error recording payment:", error);
            setSubmitError("Error de conexion. Intenta de nuevo.");
        } finally {
            setLoading(false);
        }
    };

    const selectedChargeData = charges.find((c) => c.id === selectedCharge);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Registrar Pago Rápido</DialogTitle>
                    <DialogDescription>
                        Marca un pago vencido como pagado
                    </DialogDescription>
                </DialogHeader>

                {loadingCharges ? (
                    <div className="py-8 text-center text-muted-foreground" aria-busy="true">Cargando pagos vencidos…</div>
                ) : loadError ? (
                    <div className="space-y-3 py-8 text-center" role="alert" aria-live="assertive">
                        <p className="text-sm text-red-700">{loadError}</p>
                        <Button type="button" variant="outline" onClick={fetchOverdueCharges}>Reintentar</Button>
                    </div>
                ) : charges.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                        <DollarSign className="mx-auto h-12 w-12 mb-2 opacity-50" />
                        <p>No hay pagos vencidos</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {submitError && <p data-testid="quick-payment-error" className="rounded bg-red-50 p-2 text-sm text-red-700" role="alert" aria-live="assertive">{submitError}</p>}
                        <div className="space-y-2">
                            <Label>Selecciona el pago</Label>
                            <RadioGroup value={selectedCharge} onValueChange={setSelectedCharge}>
                                {charges.map((charge) => (
                                    <label
                                        key={charge.id}
                                        className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors"
                                    >
                                        <RadioGroupItem value={charge.id} />
                                        <div className="flex-1">
                                            <p className="font-medium text-sm">
                                                {charge.athleteName || "Atleta"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Vencido: {formatShortDateForCountry(charge.dueDate, academyCountry)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold">
                                                {formatMinorCurrency(charge.amountCents, charge.currency ?? defaultCurrency)}
                                            </p>
                                        </div>
                                    </label>
                                ))}
                            </RadioGroup>
                        </div>

                        <div className="space-y-2">
                            <Label>Método de pago</Label>
                            <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors">
                                    <RadioGroupItem value="cash" />
                                    <Wallet className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">Efectivo</span>
                                </label>
                                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors">
                                    <RadioGroupItem value="card_manual" />
                                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">Tarjeta</span>
                                </label>
                                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors">
                                    <RadioGroupItem value="transfer" />
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">Transferencia</span>
                                </label>
                            </RadioGroup>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={loading || !selectedCharge}>
                                {loading ? "Procesando..." : `Confirmar Pago`}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
