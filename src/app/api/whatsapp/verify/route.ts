import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { phone, apiKey } = await request.json();

    if (!phone || !apiKey) {
      return NextResponse.json(
        { error: "Se requiere número de teléfono y API key" },
        { status: 400 }
      );
    }

    // Verify the WhatsApp API credentials
    // This is a placeholder - implement actual verification with your WhatsApp provider
    const response = await fetch(`https://api.whatsapp.com/v1/credentials`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Conexión verificada exitosamente",
    });
  } catch (error) {
    console.error("WhatsApp verify error:", error);
    return NextResponse.json(
      { error: "Error al verificar la conexión" },
      { status: 500 }
    );
  }
}
