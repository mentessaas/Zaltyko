/**
 * Parent Portal
 * Parents can see their children's attendance, payments, and communicate
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ParentPortal() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">👨‍👩‍👧 Portal de Padres</h1>
      
      <div className="grid gap-4">
        {/* Mis Hijos */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">👶 Mis Hijos</h2>
          <p className="text-gray-600">Ver listado de hijos matriculados</p>
        </div>

        {/* Asistencias */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">📅 Asistencias</h2>
          <p className="text-gray-600">Historial de asistencia a clases</p>
        </div>

        {/* Pagos */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">💳 Pagos</h2>
          <p className="text-gray-600">Estado de mensualidades y pagos</p>
        </div>

        {/* Comunicar */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">💬 Comunicar</h2>
          <p className="text-gray-600">Enviar mensaje a la academia</p>
        </div>
      </div>
    </div>
  );
}
