"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";
import { logger } from "@/lib/logger";

// Esquema Zod para validacion declarativa. Reemplaza validacion ad-hoc
// que estaba antes en handleSubmit.
const quickClassSchema = z.object({
    classId: z.string().uuid({ message: "Selecciona una clase valida" }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha invalida (YYYY-MM-DD)"),
});

type QuickClassFormValues = z.infer<typeof quickClassSchema>;

interface QuickClassModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface ClassOption {
    id: string;
    name: string;
}

export function QuickClassModal({ isOpen, onClose, onSuccess }: QuickClassModalProps) {
    const [classes, setClasses] = useState<ClassOption[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors, isValid },
        reset,
    } = useForm<QuickClassFormValues>({
        resolver: zodResolver(quickClassSchema),
        mode: "onChange",
        defaultValues: {
            classId: "",
            date: new Date().toISOString().split("T")[0],
        },
    });

    const selectedClass = watch("classId");

    useEffect(() => {
        if (isOpen) {
            fetchClasses();
        }
    }, [isOpen]);

    const fetchClasses = async () => {
        try {
            const res = await fetch("/api/classes");
            const json = await res.json();
            if (json.success && json.data) {
                setClasses(json.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
            }
        } catch (error) {
            logger.apiError("/quick-actions", "GET /api/classes", error as Error);
        }
    };

    const onValid = async (values: QuickClassFormValues) => {
        setSubmitting(true);
        setSubmitError(null);

        try {
            const res = await fetch("/api/quick-actions/create-class", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });

            const json = await res.json();
            if (json.success) {
                onSuccess();
                reset();
            } else {
                setSubmitError(json.error ?? "Error al crear la clase");
            }
        } catch (error) {
            logger.apiError("/quick-actions", "POST create-class", error as Error);
            setSubmitError("Error de conexion. Intenta de nuevo.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        reset();
        setSubmitError(null);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Nueva Clase Rapida</DialogTitle>
                    <DialogDescription>
                        Crea una sesion de clase para hoy con los horarios predefinidos
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onValid)} className="space-y-4" noValidate>
                    <div className="space-y-2">
                        <Label htmlFor="classId">Clase</Label>
                        <Select
                            value={selectedClass}
                            onValueChange={(value) => setValue("classId", value, { shouldValidate: true })}
                        >
                            <SelectTrigger
                                id="classId"
                                aria-invalid={!!errors.classId}
                                className="min-h-[44px]"
                            >
                                <SelectValue placeholder="Selecciona una clase" />
                            </SelectTrigger>
                            <SelectContent>
                                {classes.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <input type="hidden" {...register("classId")} />
                        {errors.classId && (
                            <p className="text-xs text-red-600" role="alert">
                                {errors.classId.message}
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="date">Fecha</Label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                id="date"
                                type="date"
                                {...register("date")}
                                aria-invalid={!!errors.date}
                                className="pl-10 min-h-[44px]"
                            />
                        </div>
                        {errors.date && (
                            <p className="text-xs text-red-600" role="alert">
                                {errors.date.message}
                            </p>
                        )}
                    </div>

                    {submitError && (
                        <p className="text-sm text-red-600 bg-red-50 p-2 rounded" role="alert">
                            {submitError}
                        </p>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleClose}
                            disabled={submitting}
                            className="min-h-[44px]"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting || !isValid}
                            className="min-h-[44px]"
                        >
                            {submitting ? "Creando..." : "Crear Clase"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
