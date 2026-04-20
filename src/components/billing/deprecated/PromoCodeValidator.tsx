"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Tag, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface PromoCodeValidatorProps {
  academyId: string;
  amount?: number;
  onApply?: (discount: AppliedDiscount) => void;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  discount?: {
    id: string;
    name: string;
    description?: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    originalAmount: number;
    finalAmount: number;
  };
}

export function PromoCodeValidator({
  academyId,
  amount = 0,
  onApply,
}: PromoCodeValidatorProps) {
  const [code, setCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [currentAmount, setCurrentAmount] = useState(amount);

  const validateCode = async () => {
    if (!code.trim()) return;

    setIsValidating(true);
    setResult(null);

    try {
      const response = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          code: code.trim(),
          amount: currentAmount > 0 ? currentAmount : undefined,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        valid: false,
        error: "Error al validar el código",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleApply = () => {
    if (result?.valid && result.discount && onApply) {
      onApply(result.discount);
    }
  };

  const reset = () => {
    setCode("");
    setResult(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Código Promocional
        </CardTitle>
        <CardDescription>
          Ingresa un código de descuento si lo tienes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentAmount > 0 && (
          <div className="text-sm text-muted-foreground">
            Monto base: <span className="font-medium">{currentAmount.toFixed(2)} EUR</span>
          </div>
        )}

        {result ? (
          <div
            className={`p-4 rounded-lg ${
              result.valid
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            {result.valid ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Código aplicado</span>
                </div>
                {result.discount && (
                  <div className="text-sm text-green-600 space-y-1">
                    <p className="font-medium">{result.discount.name}</p>
                    {result.discount.description && (
                      <p>{result.discount.description}</p>
                    )}
                    <div className="flex justify-between pt-2 border-t border-green-200">
                      <span>Descuento:</span>
                      <span className="font-medium">
                        -{result.discount.discountAmount.toFixed(2)} EUR
                      </span>
                    </div>
                    {currentAmount > 0 && (
                      <div className="flex justify-between">
                        <span>Total:</span>
                        <span className="font-bold">
                          {result.discount.finalAmount.toFixed(2)} EUR
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleApply}>
                    Aplicar
                  </Button>
                  <Button size="sm" variant="outline" onClick={reset}>
                    Cambiar código
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Código no válido</span>
                </div>
                <p className="text-sm text-red-600">{result.error}</p>
                <Button size="sm" variant="outline" onClick={reset}>
                  Intentar de nuevo
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="promo-code">Código</Label>
              <Input
                id="promo-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ej: VERANO2024"
                onKeyDown={(e) => e.key === "Enter" && validateCode()}
                className="uppercase"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={validateCode}
                disabled={!code.trim() || isValidating}
              >
                {isValidating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Validar"
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export type AppliedDiscount = {
  id: string;
  name: string;
  description?: string;
  discountType: string;
  discountValue: number;
  discountAmount: number;
  originalAmount: number;
  finalAmount: number;
};
