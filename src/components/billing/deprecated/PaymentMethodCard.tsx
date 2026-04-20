"use client";

import { useState } from "react";
import { CreditCard, Edit, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PaymentMethod {
    id: string;
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    is_default: boolean;
}

interface PaymentMethodCardProps {
    paymentMethod?: PaymentMethod;
    onUpdate: () => void;
    loading?: boolean;
}

const CARD_BRANDS: Record<string, { name: string; color: string }> = {
    visa: { name: "Visa", color: "from-blue-600 to-blue-700" },
    mastercard: { name: "Mastercard", color: "from-red-600 to-orange-600" },
    amex: { name: "American Express", color: "from-blue-500 to-cyan-500" },
    discover: { name: "Discover", color: "from-orange-500 to-amber-500" },
    default: { name: "Tarjeta", color: "from-gray-600 to-gray-700" },
};

export function PaymentMethodCard({ paymentMethod, onUpdate, loading = false }: PaymentMethodCardProps) {
    const [isUpdating, setIsUpdating] = useState(false);

    const handleUpdate = async () => {
        setIsUpdating(true);
        try {
            await onUpdate();
        } finally {
            setIsUpdating(false);
        }
    };

    if (!paymentMethod) {
        return (
            <div className="p-6 rounded-xl border-2 border-dashed border-zaltyko-border text-center">
                <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium mb-2">No hay método de pago configurado</p>
                <p className="text-sm text-gray-500 mb-4">
                    Agrega una tarjeta para poder actualizar tu plan
                </p>
                <Button onClick={handleUpdate} disabled={isUpdating}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    {isUpdating ? "Cargando..." : "Agregar Tarjeta"}
                </Button>
            </div>
        );
    }

    const brandConfig = CARD_BRANDS[paymentMethod.brand.toLowerCase()] || CARD_BRANDS.default;
    const isExpired = new Date(paymentMethod.exp_year, paymentMethod.exp_month - 1) < new Date();

    return (
        <div className="space-y-4">
            <div className="relative overflow-hidden rounded-xl p-6 text-white shadow-lg">
                {/* Card Background Gradient */}
                <div className={cn(
                    "absolute inset-0 bg-gradient-to-br",
                    brandConfig.color
                )} />

                {/* Pattern Overlay */}
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0" style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }} />
                </div>

                {/* Card Content */}
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-2">
                            <CreditCard className="w-8 h-8" />
                            <span className="text-lg font-semibold">{brandConfig.name}</span>
                        </div>
                        {paymentMethod.is_default && (
                            <Badge className="bg-white/20 text-white border-white/30">
                                <Check className="w-3 h-3 mr-1" />
                                Predeterminada
                            </Badge>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-white/70 mb-1">Número de tarjeta</p>
                            <p className="text-2xl font-mono tracking-wider">
                                •••• •••• •••• {paymentMethod.last4}
                            </p>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-white/70 mb-1">Vencimiento</p>
                                <p className="text-lg font-mono">
                                    {String(paymentMethod.exp_month).padStart(2, "0")}/{paymentMethod.exp_year}
                                </p>
                            </div>
                            {isExpired && (
                                <Badge className="bg-red-500 text-white">
                                    Vencida
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Update Button */}
            <Button
                variant="outline"
                onClick={handleUpdate}
                disabled={isUpdating || loading}
                className="w-full"
            >
                <Edit className="w-4 h-4 mr-2" />
                {isUpdating ? "Actualizando..." : "Actualizar Método de Pago"}
            </Button>

            {isExpired && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-sm text-red-900 font-semibold mb-1">
                        Tarjeta vencida
                    </p>
                    <p className="text-sm text-red-700">
                        Por favor actualiza tu método de pago para evitar interrupciones en tu servicio.
                    </p>
                </div>
            )}
        </div>
    );
}
