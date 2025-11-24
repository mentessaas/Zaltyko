"use client";

import { useEffect, useState } from "react";
import { AlertCircle, TrendingUp, Info, ArrowUpRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UpgradeConfirmationModal } from "./UpgradeConfirmationModal";
import { trackEvent } from "@/lib/analytics";

interface LimitIndicatorProps {
  academyId: string | null;
  resource: "athletes" | "classes" | "groups" | "academies";
  className?: string;
  showNotifications?: boolean;
}

interface LimitData {
  current: number;
  limit: number | null;
  remaining: number | null;
  planCode: string;
  upgradeTo?: string;
}

const PLAN_INFO: Record<string, { price: string; benefits: string[] }> = {
  free: {
    price: "€0/mes",
    benefits: ["Hasta 50 atletas", "1 academia", "3 grupos", "10 clases"],
  },
  pro: {
    price: "€19/mes",
    benefits: ["Academias ilimitadas", "Hasta 200 atletas", "10 grupos", "40 clases"],
  },
  premium: {
    price: "€49/mes",
    benefits: ["Todo ilimitado", "API extendida", "Soporte prioritario"],
  },
};

export function LimitIndicator({ academyId, resource, className, showNotifications = true }: LimitIndicatorProps) {
  const [limitData, setLimitData] = useState<LimitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasNotifiedNearLimit, setHasNotifiedNearLimit] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!academyId) {
      setLoading(false);
      return;
    }

    const fetchLimits = async () => {
      try {
        const res = await fetch(`/api/limits/remaining?academyId=${academyId}&resource=${resource}`);
        if (res.ok) {
          const data = await res.json();
          setLimitData(data.limits);
        }
      } catch (error) {
        console.error("Error fetching limits:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLimits();
  }, [academyId, resource]);

  // Notificación cuando se acerca al límite
  useEffect(() => {
    if (!limitData || !showNotifications || hasNotifiedNearLimit || limitData.limit === null) {
      return;
    }

    const percentage = (limitData.current / limitData.limit) * 100;
    const isNearLimit = percentage >= 80 && percentage < 100;

    if (isNearLimit && !hasNotifiedNearLimit) {
      const resourceLabels: Record<typeof resource, string> = {
        athletes: "atletas",
        classes: "clases",
        groups: "grupos",
        academies: "academias",
      };

      toast.pushToast({
        title: "Límite cercano",
        description: `Te quedan ${limitData.remaining} ${resourceLabels[resource]} disponibles en tu plan ${limitData.planCode.toUpperCase()}. Considera actualizar tu plan para evitar interrupciones.`,
        variant: "warning",
        duration: 6000,
      });
      setHasNotifiedNearLimit(true);
    }
  }, [limitData, showNotifications, hasNotifiedNearLimit, resource, toast]);

  if (loading || !limitData) {
    return null;
  }

  // Si no hay límite (ilimitado)
  if (limitData.limit === null) {
    return (
      <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
        <TrendingUp className="h-3.5 w-3.5 text-green-500" />
        <span>Ilimitado en tu plan {limitData.planCode.toUpperCase()}</span>
      </div>
    );
  }

  const isNearLimit = percentage >= 80 && percentage < 100;
  const isAtLimit = limitData.remaining === 0;

  const resourceLabels: Record<typeof resource, string> = {
    athletes: "atletas",
    classes: "clases",
    groups: "grupos",
    academies: "academias",
  };

  const resourceLabel = resourceLabels[resource];
  const upgradeInfo = limitData.upgradeTo ? PLAN_INFO[limitData.upgradeTo] : null;
  const currentPlanInfo = PLAN_INFO[limitData.planCode] || PLAN_INFO.free;
  const percentage = (limitData.current / limitData.limit) * 100;

  const handleUpgradeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!limitData.upgradeTo) return;
    
    trackEvent("upgrade_button_clicked", {
      academyId: academyId || undefined,
      metadata: {
        resource,
        currentPlan: limitData.planCode,
        targetPlan: limitData.upgradeTo,
        currentUsage: limitData.current,
        limit: limitData.limit,
        percentage: Math.round(percentage),
      },
    });
    setShowUpgradeModal(true);
  };

  if (isAtLimit) {
    return (
      <div className={`rounded-lg border border-amber-400/60 bg-amber-400/10 p-4 text-sm ${className}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <div>
              <p className="font-semibold text-amber-900">
                Límite alcanzado: {limitData.current}/{limitData.limit} {resourceLabel}
              </p>
              <p className="text-xs text-amber-800 mt-1">
                Has alcanzado el límite máximo de {resourceLabel} en tu plan {limitData.planCode.toUpperCase()}.
              </p>
            </div>
            {limitData.upgradeTo && upgradeInfo && (
              <div className="space-y-2">
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-900">
                      Plan {limitData.upgradeTo.toUpperCase()} - {upgradeInfo.price}
                    </span>
                  </div>
                  <ul className="text-xs text-amber-800 space-y-1">
                    {upgradeInfo.benefits.map((benefit, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-amber-600 mt-0.5">•</span>
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={handleUpgradeClick}
                  className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700"
                >
                  Actualizar a {limitData.upgradeTo.toUpperCase()}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
                {showUpgradeModal && upgradeInfo && (
                  <UpgradeConfirmationModal
                    open={showUpgradeModal}
                    onClose={() => setShowUpgradeModal(false)}
                    currentPlan={limitData.planCode}
                    targetPlan={limitData.upgradeTo}
                    price={upgradeInfo.price}
                    benefits={upgradeInfo.benefits}
                    resource={resourceLabel}
                    academyId={academyId}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isNearLimit) {
    return (
      <div className={`rounded-lg border border-yellow-400/60 bg-yellow-400/10 p-3 text-sm ${className}`}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="font-semibold text-yellow-900">
                {limitData.remaining} {resourceLabel} restantes
              </span>
            </div>
            {limitData.upgradeTo && (
              <button
                onClick={handleUpgradeClick}
                className="inline-flex items-center gap-1 rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-yellow-700"
              >
                Actualizar
                <ArrowUpRight className="h-3 w-3" />
              </button>
            )}
            {showUpgradeModal && upgradeInfo && (
              <UpgradeConfirmationModal
                open={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                currentPlan={limitData.planCode}
                targetPlan={limitData.upgradeTo}
                price={upgradeInfo.price}
                benefits={upgradeInfo.benefits}
                resource={resourceLabel}
                academyId={academyId}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-yellow-800">
                {limitData.current} de {limitData.limit} utilizados
              </span>
              <span className="font-semibold text-yellow-900">{Math.round(percentage)}%</span>
            </div>
            <Progress value={percentage} className="h-2" indicatorClassName="bg-yellow-600" />
          </div>
          {limitData.upgradeTo && upgradeInfo && (
            <div className="pt-2 border-t border-yellow-300/50">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-xs text-yellow-800 hover:text-yellow-900 underline flex items-center gap-1"
                  >
                    <Info className="h-3 w-3" />
                    Ver beneficios del plan {limitData.upgradeTo.toUpperCase()}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="w-96 p-4">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Plan actual */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Plan actual</p>
                        <p className="font-semibold text-sm">
                          {limitData.planCode.toUpperCase()}
                        </p>
                        <p className="text-xs text-muted-foreground">{currentPlanInfo.price}</p>
                        <ul className="space-y-1 text-xs">
                          {currentPlanInfo.benefits.slice(0, 3).map((benefit, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="text-muted-foreground mt-0.5">•</span>
                              <span className="text-muted-foreground">{benefit}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* Plan objetivo */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-primary uppercase">Plan objetivo</p>
                        <p className="font-semibold text-sm text-primary">
                          {limitData.upgradeTo.toUpperCase()}
                        </p>
                        <p className="text-xs text-muted-foreground">{upgradeInfo.price}</p>
                        <ul className="space-y-1 text-xs">
                          {upgradeInfo.benefits.map((benefit, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="text-primary mt-0.5">✓</span>
                              <span>{benefit}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="pt-2 border-t">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpgradeClick(e);
                        }}
                        className="w-full inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90"
                      >
                        Actualizar ahora
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {limitData.current} de {limitData.limit} {resourceLabel} utilizados
        </span>
        <span className="font-medium">{limitData.remaining} restantes</span>
      </div>
      <Progress value={percentage} className="h-1.5" />
      {limitData.upgradeTo && upgradeInfo && (
        <div className="pt-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <Info className="h-3 w-3" />
                ¿Necesitas más? Ver planes
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="w-96 p-4">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Plan actual */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Plan actual</p>
                    <p className="font-semibold text-sm">
                      {limitData.planCode.toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">{currentPlanInfo.price}</p>
                    <ul className="space-y-1 text-xs">
                      {currentPlanInfo.benefits.slice(0, 3).map((benefit, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-muted-foreground mt-0.5">•</span>
                          <span className="text-muted-foreground">{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* Plan objetivo */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-primary uppercase">Plan objetivo</p>
                    <p className="font-semibold text-sm text-primary">
                      {limitData.upgradeTo.toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">{upgradeInfo.price}</p>
                    <ul className="space-y-1 text-xs">
                      {upgradeInfo.benefits.map((benefit, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">✓</span>
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpgradeClick(e);
                    }}
                    className="w-full inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90"
                  >
                    Actualizar ahora
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      {showUpgradeModal && upgradeInfo && (
        <UpgradeConfirmationModal
          open={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          currentPlan={limitData.planCode}
          targetPlan={limitData.upgradeTo}
          price={upgradeInfo.price}
          benefits={upgradeInfo.benefits}
          resource={resourceLabel}
          academyId={academyId}
        />
      )}
    </div>
  );
}

