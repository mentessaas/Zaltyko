"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";
import { capturePublicGrowthEvent } from "@/lib/growth/client";
import { DEMO_NOTICE, installDemoFetch } from "@/modules/demo/demo-guard";
import {
  DEMO_ORGANIZATION_ID,
  DEMO_PLAN_POLICY,
  demoApiResponders,
} from "@/modules/demo/demo-fixtures";
import { demoHrefFor } from "@/modules/demo/demo-routes";

const SIGNUP_HREF = "/auth/register?role=owner";
const KNOWN_ORIGINS = new Set(["inicio", "precios"]);
const REAL_HREF_ATTRIBUTE = "data-demo-real";

/*
 * La guarda de red es global (window.fetch), así que su ciclo de vida también
 * lo es. Se instala durante el primer render del cliente, antes de que los
 * componentes hijos lancen sus lecturas en sus efectos, y se retira cuando la
 * demo se desmonta para no afectar al resto del sitio.
 */
let uninstallGuard: (() => void) | null = null;
let onWriteBlocked: () => void = () => undefined;

function ensureGuard(): void {
  if (typeof window === "undefined" || uninstallGuard) return;
  uninstallGuard = installDemoFetch(window, {
    responders: demoApiResponders,
    onWriteBlocked: () => onWriteBlocked(),
  });
  // La política del plan se siembra de forma síncrona: nada queda «cargando» ni
  // en solo lectura, y los formularios se ven como los verá una academia real.
  publishOwnerPlanUsage(DEMO_ORGANIZATION_ID, DEMO_PLAN_POLICY);
}

function releaseGuard(): void {
  uninstallGuard?.();
  uninstallGuard = null;
  onWriteBlocked = () => undefined;
}

/** Las lecturas y escrituras de la demo no deben dejar restos en el navegador. */
function clearDemoStorage(): void {
  if (typeof window === "undefined") return;
  for (const read of [() => window.sessionStorage, () => window.localStorage]) {
    try {
      const store = read();
      for (let index = store.length - 1; index >= 0; index -= 1) {
        const key = store.key(index);
        if (key && key.includes(DEMO_ORGANIZATION_ID)) store.removeItem(key);
      }
    } catch {
      // Sin almacenamiento no hay nada que limpiar.
    }
  }
}

function rewriteLinks(root: ParentNode): void {
  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    const mapped = demoHrefFor(href);
    if (!mapped) return;
    anchor.setAttribute(REAL_HREF_ATTRIBUTE, href);
    anchor.setAttribute("href", mapped);
  });
}

/**
 * Contenedor de la demo pública.
 *
 * Reutiliza los componentes reales de /owner y /familia, que escriben contra la
 * API autenticada y enlazan a sus rutas reales. Aquí se garantiza, sin tocar
 * esos componentes, que:
 *  - ninguna llamada a /api ni a la base de datos sale del navegador (guarda de
 *    `fetch`; las lecturas se contestan con datos de ejemplo);
 *  - ningún formulario se envía: se muestra «En la demo no se guarda nada»;
 *  - los enlaces a /owner y /familia llevan a su equivalente en /demo;
 *  - se mide la entrada a la demo y el clic hacia el registro, sin datos personales.
 */
export function DemoSandbox({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const section = pathname.split("/")[2] ?? "resumen";

  ensureGuard();

  const showNotice = useCallback(() => {
    setNoticeOpen(true);
    capturePublicGrowthEvent({
      eventName: "demo_action_blocked",
      planCode: null,
      source: "public_demo",
      properties: { seccion: section.slice(0, 40) },
    });
  }, [section]);

  useEffect(() => {
    ensureGuard();
    clearDemoStorage();
    return () => {
      releaseGuard();
      clearDemoStorage();
    };
  }, []);

  useEffect(() => {
    onWriteBlocked = showNotice;
    return () => {
      onWriteBlocked = () => undefined;
    };
  }, [showNotice]);

  // Entrada a la demo: una vez por visita, con el origen de la lista cerrada.
  useEffect(() => {
    const origin = new URLSearchParams(window.location.search).get("origen") ?? "";
    capturePublicGrowthEvent({
      eventName: "demo_viewed",
      planCode: null,
      source: "public_demo",
      properties: { origen: KNOWN_ORIGINS.has(origin) ? origin : "directo" },
    });
  }, []);

  // Los enlaces reales se reescriben para que abrir en otra pestaña también funcione.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    rewriteLinks(root);
    const observer = new MutationObserver(() => rewriteLinks(root));
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!noticeOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNoticeOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [noticeOpen]);

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!anchor) return;

    const signup = anchor.getAttribute("data-demo-cta");
    const href = anchor.getAttribute("href") ?? "";
    if (signup || href.startsWith("/auth/register")) {
      capturePublicGrowthEvent({
        eventName: "demo_signup_clicked",
        planCode: null,
        source: "public_demo",
        properties: { colocacion: (signup ?? "enlace").slice(0, 40), seccion: section.slice(0, 40) },
      });
    }

    const real = anchor.getAttribute(REAL_HREF_ATTRIBUTE) ?? href;
    const mapped = demoHrefFor(real);
    if (!mapped) return;
    const opensElsewhere =
      event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.getAttribute("target") === "_blank";
    if (opensElsewhere) return;
    event.preventDefault();
    event.stopPropagation();
    router.push(mapped);
  };

  const onSubmitCapture = (event: FormEvent<HTMLDivElement>) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const method = (form.getAttribute("method") ?? "get").toLowerCase();
    if (form.hasAttribute("action") && method === "get") {
      // Un formulario de consulta (por ejemplo, el selector de sede): se queda en la demo.
      const mapped = demoHrefFor(form.getAttribute("action") ?? "");
      if (mapped) router.push(mapped);
      return;
    }
    showNotice();
  };

  return (
    <div ref={rootRef} data-demo-root="" onClickCapture={onClickCapture} onSubmitCapture={onSubmitCapture}>
      {children}
      {noticeOpen ? (
        <div
          role="status"
          aria-live="polite"
          data-demo-notice=""
          className="fixed inset-x-4 bottom-24 z-[70] mx-auto max-w-md rounded-xl border border-z-line border-t-[3px] border-t-mat bg-white p-5 shadow-[0_8px_30px_-8px_rgba(11,20,48,0.35)] xl:bottom-6"
        >
          <p className="font-display text-xl font-black uppercase leading-none text-mat-night">{DEMO_NOTICE}</p>
          <p className="mt-2 text-sm leading-6 text-ramp-600">
            Lo que pruebes aquí no se conserva. Crea tu academia para trabajar con tus propios datos.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={SIGNUP_HREF}
              data-demo-cta="aviso"
              className="touch-target inline-flex items-center justify-center rounded-lg bg-mat px-4 text-sm font-semibold text-white transition-colors hover:bg-mat-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mat"
            >
              Crear mi academia gratis
            </Link>
            <button
              type="button"
              onClick={() => setNoticeOpen(false)}
              className="touch-target inline-flex items-center justify-center rounded-lg border border-chalk-line bg-white px-4 text-sm font-semibold text-mat-night transition-colors hover:border-mat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mat"
            >
              Seguir con la demo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
