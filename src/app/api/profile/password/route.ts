import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  confirmPassword: z.string().min(1),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

export async function PATCH(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = ChangePasswordSchema.parse(await request.json());

    // Verificar contraseña actual
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: body.currentPassword,
    });

    if (signInError) {
      return NextResponse.json(
        { error: "INVALID_CURRENT_PASSWORD", message: "La contraseña actual es incorrecta" },
        { status: 400 }
      );
    }

    // Actualizar contraseña
    const { error: updateError } = await supabase.auth.updateUser({
      password: body.newPassword,
    });

    if (updateError) {
      return NextResponse.json(
        { error: "PASSWORD_UPDATE_FAILED", message: updateError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, message: "Contraseña actualizada correctamente" });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_INPUT", details: error.errors }, { status: 400 });
    }
    console.error("Error updating password:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: error.message }, { status: 500 });
  }
}

