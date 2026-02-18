// Welcome Email Webhook
// Triggered when a new user completes onboarding

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, academies } from "@/db/schema";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const BREVO_API_KEY = process.env.BREVO_API_KEY;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, email, name, academyName } = body;

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Send welcome email via Brevo
    const welcomeHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #0D47A1;">¡Bienvenido a Zaltyko! 🦊</h1>
  
  <p>Hola ${name || 'nuevo usuario'},</p>
  
  <p>¡Gracias por registrarte en Zaltyko! Nos alegra mucho que formes parte de nuestra comunidad.</p>
  
  <h2>¿Qué puedes hacer ahora?</h2>
  <ul>
    <li>✅ Configurar tu academia</li>
    <li>✅ Añadir atletas y monitores</li>
    <li>✅ Configurar clases y horarios</li>
    <li>✅ Activar cobros automáticos</li>
  </ul>
  
  <p><strong>Academy:</strong> ${academyName || 'Por configurar'}</p>
  
  <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0;"><strong>💰 Oferta de lanzamiento:</strong></p>
    <p style="margin: 5px 0 0 0;">Plan Profesional a €19/mes (en vez de €29) durante los primeros 3 meses.</p>
  </div>
  
  <p>¿Necesitas ayuda? Responde a este email o visita <a href="https://zaltyko.vercel.app">tu dashboard</a>.</p>
  
  <p>¡Mucho éxito con tu academia!</p>
  <p>El equipo de Zaltyko</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #888; font-size: 12px;">Zaltyko - Software para academias de gimnásia</p>
</body>
</html>
    `;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: "Elvis - Zaltyko", email: "elvis@zaltyko.com" },
        to: [{ email, name: name || "Usuario" }],
        subject: "¡Bienvenido a Zaltyko! 🦊",
        htmlContent: welcomeHtml,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Brevo error:", error);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Welcome email sent" });
  } catch (error) {
    console.error("Welcome webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
