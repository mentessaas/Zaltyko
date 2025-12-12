"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, Trash2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";

interface ClassException {
    id: string;
    exceptionDate: string;
    reason: string | null;
    exceptionType: string;
}

interface ClassExceptionsDialogProps {
    classId: string;
    open: boolean;
    onClose: () => void;
}

export function ClassExceptionsDialog({ classId, open, onClose }: ClassExceptionsDialogProps) {
    const [exceptions, setExceptions] = useState<ClassException[]>([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);
    const [date, setDate] = useState("");
    const [reason, setReason] = useState("");
    const { pushToast } = useToast();

    useEffect(() => {
        if (open) {
            loadExceptions();
        }
    }, [open, classId]);

    const loadExceptions = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/classes/${classId}/exceptions`);
            if (!res.ok) throw new Error("Error loading exceptions");
            const data = await res.json();
            setExceptions(data.exceptions);
        } catch (error) {
            console.error(error);
            pushToast({
                title: "Error",
                description: "No se pudieron cargar las excepciones",
                variant: "error",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleAddException = async () => {
        if (!date) return;

        setAdding(true);
        try {
            const res = await fetch(`/api/classes/${classId}/exceptions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    exceptionDate: date,
                    reason: reason || "Día festivo",
                    exceptionType: "holiday",
                }),
            });

            if (!res.ok) throw new Error("Error adding exception");

            await loadExceptions();
            setDate("");
            setReason("");
            pushToast({
                title: "Excepción agregada",
                description: "La fecha ha sido agregada a las excepciones",
                variant: "success",
            });
        } catch (error) {
            console.error(error);
            pushToast({
                title: "Error",
                description: "No se pudo agregar la excepción",
                variant: "error",
            });
        } finally {
            setAdding(false);
        }
    };

    const handleDeleteException = async (id: string) => {
        try {
            const res = await fetch(`/api/classes/${classId}/exceptions/${id}`, {
                method: "DELETE",
            });

            if (!res.ok) throw new Error("Error deleting exception");

            setExceptions(exceptions.filter((e) => e.id !== id));
            pushToast({
                title: "Excepción eliminada",
                description: "La fecha ha sido removida de las excepciones",
                variant: "success",
            });
        } catch (error) {
            console.error(error);
            pushToast({
                title: "Error",
                description: "No se pudo eliminar la excepción",
                variant: "error",
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Gestionar Excepciones</DialogTitle>
                    <DialogDescription>
                        Agrega fechas donde no se deben generar sesiones automáticamente (festivos, vacaciones, etc.)
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Add New Exception Form */}
                    <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
                        <h4 className="font-medium text-sm">Agregar nueva excepción</h4>
                        <div className="grid gap-4">
                            <div className="flex flex-col gap-2">
                                <Label>Fecha</Label>
                                <Input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label>Razón (Opcional)</Label>
                                <Input
                                    placeholder="Ej: Día festivo nacional"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                />
                            </div>

                            <Button
                                onClick={handleAddException}
                                disabled={!date || adding}
                                className="w-full"
                            >
                                {adding ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Agregando...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Agregar Excepción
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* List of Exceptions */}
                    <div className="space-y-2">
                        <h4 className="font-medium text-sm">Excepciones existentes</h4>
                        {loading ? (
                            <div className="flex justify-center py-4">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : exceptions.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No hay excepciones configuradas
                            </p>
                        ) : (
                            <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2">
                                {exceptions.map((exception) => (
                                    <div
                                        key={exception.id}
                                        className="flex items-center justify-between p-3 bg-card border rounded-md"
                                    >
                                        <div>
                                            <p className="font-medium text-sm">
                                                {/* Parse date string carefully to avoid timezone issues with simple date strings */}
                                                {format(new Date(exception.exceptionDate + "T12:00:00"), "PPP", { locale: es })}
                                            </p>
                                            {exception.reason && (
                                                <p className="text-xs text-muted-foreground">{exception.reason}</p>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                            onClick={() => handleDeleteException(exception.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
