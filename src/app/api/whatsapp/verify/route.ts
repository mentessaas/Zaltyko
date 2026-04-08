import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const { phone, apiKey } = await request.json();

    if (!phone || !apiKey) {
      return apiError("Se requiere número de teléfono y API key", "Validation error", 400);
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
      return apiError("Credenciales inválidas", "Invalid credentials", 401);
    }

    return apiSuccess({
      success: true,
      message: "Conexión verificada exitosamente",
    });
  } catch (error) {
    console.error("WhatsApp verify error:", error);
    return apiError("Error al verificar la conexión", "Connection error", 500);
  }
}
