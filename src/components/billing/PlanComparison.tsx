"use client";

import { Check, Sparkles, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Plan {
    id: string;
    name: string;
    code: "free" | "pro" | "premium";
    price: number;
    interval: "month" | "year";
    description: string;
    features: string[];
    limits: {
        athletes: number | "unlimited";
        coaches: number | "unlimited";
        classes: number | "unlimited";
        storage_gb: number | "unlimited";
    };
    popular?: boolean;
    icon: typeof Sparkles;
    color: string;
}

const PLANS: Plan[] = [
    {
        id: "free",
        name: "Free",
        code: "free",
        price: 0,
        interval: "month",
        description: "Perfecto para empezar",
        icon: Sparkles,
        color: "from-gray-500 to-gray-600",
        features: [
            "Hasta 50 atletas",
            "2 entrenadores",
            "5 clases activas",
            "100 MB de almacenamiento",
            "Asistencia básica",
            "Reportes básicos",
        ],
        limits: {
            athletes: 50,
            coaches: 2,
            classes: 5,
            storage_gb: 0.1,
        },
    },
    {
        id: "pro",
        name: "Pro",
        code: "pro",
        price: 29,
        interval: "month",
        description: "Para academias en crecimiento",
        icon: Zap,
        color: "from-zaltyko-primary to-zaltyko-accent-teal",
        popular: true,
        features: [
            "Hasta 200 atletas",
            "10 entrenadores",
            "50 clases activas",
            "1 GB de almacenamiento",
            "Asistencia prioritaria",
            "Reportes avanzados",
            "Análisis de rendimiento",
            "Exportación de datos",
            "Integraciones básicas",
        ],
        limits: {
            athletes: 200,
            coaches: 10,
            classes: 50,
            storage_gb: 1,
        },
    },
    {
        id: "premium",
        name: "Premium",
        code: "premium",
        price: 79,
        interval: "month",
        description: "Para academias profesionales",
        icon: Crown,
        color: "from-zaltyko-accent-coral to-zaltyko-accent-amber",
        features: [
            "Atletas ilimitados",
            "Entrenadores ilimitados",
            "Clases ilimitadas",
            "Almacenamiento ilimitado",
            "Soporte dedicado 24/7",
            "Reportes personalizados",
            "API completa",
            "White-label disponible",
            "Todas las integraciones",
            "Gestor de cuenta dedicado",
        ],
        limits: {
            athletes: "unlimited",
            coaches: "unlimited",
            classes: "unlimited",
            storage_gb: "unlimited",
        },
    },
];

interface PlanComparisonProps {
    currentPlan?: "free" | "pro" | "premium";
    onSelectPlan: (planCode: "free" | "pro" | "premium") => void;
    loading?: boolean;
}

export function PlanComparison({ currentPlan = "free", onSelectPlan, loading = false }: PlanComparisonProps) {
    const isCurrentPlan = (planCode: string) => planCode === currentPlan;
    const canUpgrade = (planCode: string) => {
        const planOrder = { free: 0, pro: 1, premium: 2 };
        return planOrder[planCode as keyof typeof planOrder] > planOrder[currentPlan];
    };
    const canDowngrade = (planCode: string) => {
        const planOrder = { free: 0, pro: 1, premium: 2 };
        return planOrder[planCode as keyof typeof planOrder] < planOrder[currentPlan];
    };

    return (
        <div className="w-full">
            {/* Header */}
            <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-zaltyko-primary to-zaltyko-accent-teal bg-clip-text text-transparent">
                    Elige el plan perfecto para tu academia
                </h2>
                <p className="text-lg text-zaltyko-text-light max-w-2xl mx-auto">
                    Comienza gratis y escala según tus necesidades. Todos los planes incluyen actualizaciones gratuitas.
                </p>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
                {PLANS.map((plan) => {
                    const Icon = plan.icon;
                    const isCurrent = isCurrentPlan(plan.code);
                    const canUp = canUpgrade(plan.code);
                    const canDown = canDowngrade(plan.code);

                    return (
                        <div
                            key={plan.id}
                            className={cn(
                                "relative rounded-2xl p-8 transition-all duration-300",
                                "glass-panel border-2",
                                isCurrent && "border-zaltyko-primary shadow-glow",
                                plan.popular && !isCurrent && "border-zaltyko-accent-teal shadow-lg scale-105",
                                !isCurrent && !plan.popular && "border-zaltyko-border hover:border-zaltyko-primary/50"
                            )}
                        >
                            {/* Popular Badge */}
                            {plan.popular && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                                    <Badge className="bg-gradient-to-r from-zaltyko-accent-teal to-zaltyko-primary text-white px-4 py-1">
                                        Más Popular
                                    </Badge>
                                </div>
                            )}

                            {/* Current Plan Badge */}
                            {isCurrent && (
                                <div className="absolute -top-4 right-4">
                                    <Badge className="bg-zaltyko-primary text-white px-4 py-1">
                                        Plan Actual
                                    </Badge>
                                </div>
                            )}

                            {/* Icon */}
                            <div className={cn(
                                "w-16 h-16 rounded-xl mb-6 flex items-center justify-center",
                                "bg-gradient-to-br", plan.color
                            )}>
                                <Icon className="w-8 h-8 text-white" />
                            </div>

                            {/* Plan Name & Price */}
                            <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                            <p className="text-zaltyko-text-light text-sm mb-4">{plan.description}</p>

                            <div className="mb-6">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-5xl font-bold">
                                        ${plan.price}
                                    </span>
                                    <span className="text-zaltyko-text-light">
                                        /{plan.interval === "month" ? "mes" : "año"}
                                    </span>
                                </div>
                                {plan.price > 0 && (
                                    <p className="text-xs text-zaltyko-text-light mt-1">
                                        Facturado mensualmente
                                    </p>
                                )}
                            </div>

                            {/* CTA Button */}
                            <Button
                                onClick={() => onSelectPlan(plan.code)}
                                disabled={isCurrent || loading}
                                className={cn(
                                    "w-full mb-6 h-12 text-base font-semibold",
                                    isCurrent && "opacity-50 cursor-not-allowed",
                                    canUp && "bg-gradient-to-r from-zaltyko-primary to-zaltyko-accent-teal hover:shadow-glow",
                                    canDown && "bg-gradient-to-r from-gray-500 to-gray-600"
                                )}
                            >
                                {isCurrent ? "Plan Actual" : canUp ? "Actualizar Plan" : canDown ? "Cambiar a " + plan.name : "Seleccionar"}
                            </Button>

                            {/* Features List */}
                            <div className="space-y-3">
                                <p className="text-sm font-semibold text-zaltyko-text-main mb-3">
                                    Incluye:
                                </p>
                                {plan.features.map((feature, idx) => (
                                    <div key={idx} className="flex items-start gap-3">
                                        <div className="mt-0.5">
                                            <Check className="w-5 h-5 text-zaltyko-primary" />
                                        </div>
                                        <span className="text-sm text-zaltyko-text-main">
                                            {feature}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Limits Summary */}
                            <div className="mt-6 pt-6 border-t border-zaltyko-border">
                                <p className="text-xs font-semibold text-zaltyko-text-light mb-2">
                                    Límites del plan:
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <span className="text-zaltyko-text-light">Atletas:</span>
                                        <span className="ml-1 font-semibold">
                                            {plan.limits.athletes === "unlimited" ? "∞" : plan.limits.athletes}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-zaltyko-text-light">Coaches:</span>
                                        <span className="ml-1 font-semibold">
                                            {plan.limits.coaches === "unlimited" ? "∞" : plan.limits.coaches}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-zaltyko-text-light">Clases:</span>
                                        <span className="ml-1 font-semibold">
                                            {plan.limits.classes === "unlimited" ? "∞" : plan.limits.classes}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-zaltyko-text-light">Storage:</span>
                                        <span className="ml-1 font-semibold">
                                            {plan.limits.storage_gb === "unlimited" ? "∞" : `${plan.limits.storage_gb} GB`}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* FAQ Section */}
            <div className="mt-16 text-center">
                <p className="text-sm text-zaltyko-text-light">
                    ¿Tienes preguntas? <a href="/contact" className="text-zaltyko-primary hover:underline">Contáctanos</a>
                </p>
            </div>
        </div>
    );
}
