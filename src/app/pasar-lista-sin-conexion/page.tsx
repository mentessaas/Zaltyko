import type { Metadata } from "next";

import { OfflineAttendanceShell } from "@/components/attendance/OfflineAttendanceShell";

export const metadata: Metadata = {
  title: "Pasar lista",
  robots: { index: false, follow: false },
};

/**
 * Pantalla pública y sin datos: dibuja la lista de hoy guardada en el móvil.
 * El service worker la guarda para abrirla cuando no hay cobertura.
 */
export default function OfflineAttendancePage() {
  return <OfflineAttendanceShell />;
}
