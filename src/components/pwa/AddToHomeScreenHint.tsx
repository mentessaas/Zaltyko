"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Share, SquarePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import {
  HINT_STORAGE_KEY,
  detectPlatform,
  isAttendanceRoute,
  parseHintState,
  recordDismissal,
  recordInstallOutcome,
  recordVisit,
  shouldShowHint,
  type HintState,
  type InstallPlatform,
} from "@/lib/pwa/install-hint";

function readState(): HintState {
  try {
    return parseHintState(localStorage.getItem(HINT_STORAGE_KEY));
  } catch {
    return parseHintState(null);
  }
}

function writeState(state: HintState) {
  try {
    localStorage.setItem(HINT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Sin almacenamiento (modo privado): la invitación simplemente no recuerda.
  }
}

/**
 * Invitación discreta para entrenadoras y dirección: «Añadir Zaltyko a tu
 * pantalla de inicio». En Android abre el aviso de instalación del navegador;
 * en iPhone/iPad explica los pasos de Safari (allí no hay botón de instalar).
 */
export function AddToHomeScreenHint() {
  const pathname = usePathname();
  const { installPrompt, isInstalled, promptInstall } = useInstallPrompt();
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [state, setState] = useState<HintState | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
    const next = recordVisit(readState(), new Date());
    writeState(next);
    setState(next);
  }, []);

  const dismiss = useCallback(() => {
    const next = recordDismissal(readState(), new Date());
    writeState(next);
    setState(next);
    setShowSteps(false);
  }, []);

  const install = useCallback(async () => {
    if (platform === "android") {
      // Cerrar el aviso del navegador cuenta como descartar la invitación.
      const outcome = await promptInstall();
      const next = recordInstallOutcome(readState(), outcome, new Date());
      writeState(next);
      setState(next);
      return;
    }
    setShowSteps(true);
  }, [platform, promptInstall]);

  // En las pantallas de pasar lista no se interrumpe a la entrenadora.
  if (!state || isAttendanceRoute(pathname)) return null;
  const visible = shouldShowHint(state, {
    platform,
    standalone: isInstalled,
    canPromptInstall: installPrompt !== null,
    now: new Date(),
  });
  if (!visible) return null;

  const isIos = platform === "ios-safari" || platform === "ios-other";

  return (
    <aside
      aria-label="Añadir Zaltyko a la pantalla de inicio"
      className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-md rounded-xl border border-border bg-card p-4 text-foreground shadow-lg lg:bottom-6 lg:left-auto lg:right-6"
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <p className="pr-10 font-semibold">Añade Zaltyko a tu pantalla de inicio</p>
      <p className="mt-1 pr-6 text-sm text-muted-foreground">
        Pasa lista con un toque y, si no hay cobertura en el gimnasio, lo marcado se guarda y se envía solo.
      </p>

      {showSteps && isIos && (
        <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
          {platform === "ios-other" ? (
            <p>
              En iPhone y iPad esto se hace desde <strong>Safari</strong>. Abre zaltyko.com en Safari y sigue los
              pasos.
            </p>
          ) : (
            <ol className="space-y-2">
              <li className="flex items-center gap-2">
                <Share className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Toca <strong>Compartir</strong> (el cuadrado con la flecha, abajo en Safari).
                </span>
              </li>
              <li className="flex items-center gap-2">
                <SquarePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Elige <strong>«Añadir a pantalla de inicio»</strong> y toca <strong>Añadir</strong>.
                </span>
              </li>
            </ol>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={dismiss} className="flex-1">
          Ahora no
        </Button>
        {!showSteps && (
          <Button size="sm" onClick={() => void install()} className="flex-1">
            {isIos ? "Cómo hacerlo" : "Añadir"}
          </Button>
        )}
      </div>
    </aside>
  );
}
