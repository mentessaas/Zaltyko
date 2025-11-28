"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Zap, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

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
        name: "Pro",
        price: 29,
        color: "from-zaltyko-primary to-zaltyko-accent-teal",
        features: [
            "200 atletas",
            "10 entrenadores",
            "50 clases activas",
            "1 GB almacenamiento",
            "Reportes avanzados",
            "Análisis de rendimiento",
        ],
    },
    premium: {
        name: "Premium",
        price: 79,
        color: "from-zaltyko-accent-coral to-zaltyko-accent-amber",
        features: [
            "Atletas ilimitados",
            "Entrenadores ilimitados",
            "Clases ilimitadas",
            "Almacenamiento ilimitado",
            "Soporte 24/7",
            "API completa",
        ],
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
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <p className="text-sm text-red-600">{error}</p>
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
    const currentPlanPrice = currentPlan === "free" ? 0 : currentPlan === "pro" ? 29 : 79;
    const priceDifference = planDetails.price - currentPlanPrice;
    const prorationAmount = Math.round(priceDifference * 0.5); // Ejemplo: 50% de prorrateo

    const handleContinueToPayment = async () => {
        setLoading(true);
        try {
            // Crear PaymentIntent en el servidor
            const response = await fetch("/api/billing/create-payment-intent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: targetPlan }),
            });

            const data = await response.json();
            setClientSecret(data.clientSecret);
            setStep("payment");
        } catch (error) {
            console.error("Error:", error);
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
            console.error("Error:", error);
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
                        <div className={cn(
                            "p-6 rounded-xl bg-gradient-to-br",
                            planDetails.color,
                            "text-white"
                        )}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-2xl font-bold">{planDetails.name}</h3>
                                <Badge className="bg-white/20 text-white border-white/30">
                                    Upgrade
                                </Badge>
                            </div>
                            <div className="flex items-baseline gap-2 mb-4">
                                <span className="text-4xl font-bold">${planDetails.price}</span>
                                <span className="text-white/80">/mes</span>
                            </div>
                            <div className="space-y-2">
                                {planDetails.features.map((feature, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Check className="w-4 h-4" />
                                        <span className="text-sm">{feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Pricing Breakdown */}
                        <div className="space-y-3 p-4 rounded-lg bg-zaltyko-bg-secondary">
                            <div className="flex justify-between text-sm">
                                <span className="text-zaltyko-text-light">Plan {planDetails.name}</span>
                                <span className="font-semibold">${planDetails.price}/mes</span>
                            </div>
                            {currentPlan !== "free" && (
                                <>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-zaltyko-text-light">Crédito por tiempo restante</span>
                                        <span className="font-semibold text-zaltyko-primary">-${prorationAmount}</span>
                                    </div>
                                    <div className="border-t border-zaltyko-border pt-2 flex justify-between">
                                        <span className="font-semibold">Total hoy</span>
                                        <span className="font-bold text-lg">${planDetails.price - prorationAmount}</span>
                                    </div>
                                </>
                            )}
                            <p className="text-xs text-zaltyko-text-light">
                                A partir del próximo ciclo de facturación, se cobrará ${planDetails.price}/mes
                            </p>
                        </div>

                        {/* Info Box */}
                        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
                            <Zap className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-blue-900 mb-1">
                                    Upgrade instantáneo
                                </p>
                                <p className="text-xs text-blue-700">
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
