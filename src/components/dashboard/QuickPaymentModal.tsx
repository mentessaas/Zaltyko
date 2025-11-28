"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DollarSign, CreditCard, Wallet } from "lucide-react";

interface QuickPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface OverdueCharge {
    id: string;
    athleteId: string;
    athleteName?: string;
    amountCents: number;
    dueDate: string;
}

export function QuickPaymentModal({ isOpen, onClose, onSuccess }: QuickPaymentModalProps) {
    const [charges, setCharges] = useState<OverdueCharge[]>([]);
    const [selectedCharge, setSelectedCharge] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchOverdueCharges();
        }
    }, [isOpen]);

    const fetchOverdueCharges = async () => {
        try {
            const today = new Date().toISOString().split("T")[0];
            const res = await fetch(`/api/charges?status=pending&dueBefore=${today}&limit=10`);
            const json = await res.json();
            if (json.success && json.data) {
                setCharges(json.data);
                if (json.data.length > 0) {
                    setSelectedCharge(json.data[0].id);
                }
            }
        } catch (error) {
            console.error("Error fetching overdue charges:", error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("/api/quick-actions/record-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chargeId: selectedCharge,
                    paymentMethod,
                }),
            });

            const json = await res.json();
            if (json.success) {
                onSuccess();
            }
        } catch (error) {
            console.error("Error recording payment:", error);
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

                {charges.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                        <DollarSign className="mx-auto h-12 w-12 mb-2 opacity-50" />
                        <p>No hay pagos vencidos</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
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
                                                Vencido: {new Date(charge.dueDate).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold">
                                                €{(charge.amountCents / 100).toFixed(2)}
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
                                    <RadioGroupItem value="card" />
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
