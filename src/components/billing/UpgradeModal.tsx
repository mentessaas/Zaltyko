"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Zap, AlertCircle } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { logger } from "@/lib/logger";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface UpgradeModalProps {
    open: boolean;
    onClose: () => void;
    currentPlan: "free" | "pro" | "premium";
    targetPlan: "pro" | "premium";
    onConfirm: (paymentMethodId?: string) => Promise<void>;
}

const PLAN_DETAILS = {
    pro: {
        name: "Starter",
        price: PRODUCT_PLAN_BY_CODE.pro.priceEurCents / 100,
        features: PRODUCT_PLAN_BY_CODE.pro.features,
    },
    premium: {
        name: "Growth",
        price: PRODUCT_PLAN_BY_CODE.premium.priceEurCents / 100,
        features: PRODUCT_PLAN_BY_CODE.premium.features,
    },
};

function PaymentForm({ onSubmit, loading }: { onSubmit: (paymentMethodId: string) => Promise<void>; loading: boolean }) {
    const stripe = useStripe();
    const elements = useElements();
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setError(null);

        const { error: submitError, paymentMethod } = await stripe.createPaymentMethod({
            elements,
        });

        if (submitError) {
            setError(submitError.message || "Error al procesar el pago");
            return;
        }

        if (paymentMethod) {
            await onSubmit(paymentMethod.id);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <PaymentElement />
            {error && (
                <div className="flex items-center gap-2 rounded-card border border-zaltyko-coral/30 bg-zaltyko-coral/10 p-3">
                    <AlertCircle className="w-4 h-4 text-zaltyko-coral" />
                    <p className="text-sm text-zaltyko-coral">{error}</p>
                </div>
            )}
            <Button type="submit" disabled={!stripe || loading} className="w-full">
                {loading ? "Procesando..." : "Confirmar Upgrade"}
            </Button>
        </form>
    );
}

export function UpgradeModal({ open, onClose, currentPlan, targetPlan, onConfirm }: UpgradeModalProps) {
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<"preview" | "payment">("preview");
    const [clientSecret, setClientSecret] = useState<string | null>(null);

    const planDetails = PLAN_DETAILS[targetPlan];
    const PLAN_PRICES: Record<string, number> = {
        free: PRODUCT_PLAN_BY_CODE.free.priceEurCents / 100,
        pro: PRODUCT_PLAN_BY_CODE.pro.priceEurCents / 100,
        premium: PRODUCT_PLAN_BY_CODE.premium.priceEurCents / 100,
    };
    const currentPlanPrice = PLAN_PRICES[currentPlan] || 0;
    const priceDifference = planDetails.price - currentPlanPrice;
    // Real proration will be calculated server-side; show indicative amount
    const prorationAmount = Math.round(priceDifference * 0.5);

    const handleContinueToPayment = async () => {
        setLoading(true);
        try {
            // Crear PaymentIntent en el servidor
            const response = await fetch("/api/billing/create-payment-intent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: targetPlan }),
            });

            const { data } = await response.json();
            setClientSecret(data?.clientSecret ?? null);
            setStep("payment");
        } catch (error) {
            logger.error("Error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmPayment = async (paymentMethodId: string) => {
        setLoading(true);
        try {
            await onConfirm(paymentMethodId);
            onClose();
        } catch (error) {
            logger.error("Error:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="text-2xl">
                        {step === "preview" ? "Actualizar a Plan " + planDetails.name : "Método de Pago"}
                    </DialogTitle>
                    <DialogDescription>
                        {step === "preview"
                            ? "Revisa los detalles de tu nuevo plan antes de continuar"
                            : "Ingresa los detalles de tu tarjeta para completar el upgrade"
                        }
                    </DialogDescription>
                </DialogHeader>

                {step === "preview" ? (
                    <div className="space-y-6">
                        {/* Plan Preview */}
                        <div className="rounded-card border border-zaltyko-mist border-b-2 border-b-zaltyko-teal bg-white p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-2xl font-bold text-zaltyko-navy">{planDetails.name}</h3>
                                <Badge className="bg-zaltyko-primary-ultralight text-zaltyko-teal border-transparent">
                                    Upgrade
                                </Badge>
                            </div>
                            <div className="flex items-baseline gap-2 mb-4">
                                <span className="text-4xl font-bold tabular-nums text-zaltyko-navy">€{planDetails.price}</span>
                                <span className="text-zaltyko-text-secondary">/mes</span>
                            </div>
                            <div className="space-y-2">
                                {planDetails.features.map((feature, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Check className="w-4 h-4 text-zaltyko-teal" />
                                        <span className="text-sm text-zaltyko-text-secondary">{feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Pricing Breakdown */}
                        <div className="space-y-3 rounded-card border border-zaltyko-mist bg-zaltyko-white p-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-zaltyko-text-light">Plan {planDetails.name}</span>
                                <span className="font-semibold">€{planDetails.price}/mes</span>
                            </div>
                            {currentPlan !== "free" && (
                                <>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-zaltyko-text-light">Crédito por tiempo restante</span>
                                        <span className="font-semibold text-zaltyko-teal">-€{prorationAmount}</span>
                                    </div>
                                    <div className="border-t border-zaltyko-mist pt-2 flex justify-between">
                                        <span className="font-semibold">Total hoy</span>
                                        <span className="font-bold text-lg tabular-nums">€{planDetails.price - prorationAmount}</span>
                                    </div>
                                </>
                            )}
                            <p className="text-xs text-zaltyko-text-light">
                                A partir del próximo ciclo de suscripción, se cobrará €{planDetails.price}/mes
                            </p>
                        </div>

                        {/* Info Box */}
                        <div className="flex items-start gap-3 rounded-card border border-zaltyko-mist bg-zaltyko-primary-ultralight p-4">
                            <Zap className="w-5 h-5 mt-0.5 text-zaltyko-teal" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-zaltyko-navy mb-1">
                                    Upgrade instantáneo
                                </p>
                                <p className="text-xs text-zaltyko-text-secondary">
                                    Tu plan se actualizará inmediatamente después de confirmar el pago.
                                    Tendrás acceso a todas las nuevas funciones de inmediato.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="py-4">
                        {clientSecret && (
                            <Elements stripe={stripePromise} options={{ clientSecret }}>
                                <PaymentForm onSubmit={handleConfirmPayment} loading={loading} />
                            </Elements>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {step === "preview" ? (
                        <>
                            <Button variant="outline" onClick={onClose} disabled={loading}>
                                Cancelar
                            </Button>
                            <Button onClick={handleContinueToPayment} disabled={loading}>
                                <CreditCard className="w-4 h-4 mr-2" />
                                {loading ? "Cargando..." : "Continuar al Pago"}
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" onClick={() => setStep("preview")} disabled={loading}>
                            Volver
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
