"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar, Clock } from "lucide-react";

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
    const [selectedClass, setSelectedClass] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [loading, setLoading] = useState(false);

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
                setClasses(json.data.map((c: any) => ({ id: c.id, name: c.name })));
            }
        } catch (error) {
            console.error("Error fetching classes:", error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("/api/quick-actions/create-class", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    classId: selectedClass,
                    date,
                }),
            });

            const json = await res.json();
            if (json.success) {
                onSuccess();
            }
        } catch (error) {
            console.error("Error creating class:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Nueva Clase Rápida</DialogTitle>
                    <DialogDescription>
                        Crea una sesión de clase para hoy con los horarios predefinidos
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="class">Clase</Label>
                        <Select value={selectedClass} onValueChange={setSelectedClass} required>
                            <SelectTrigger id="class">
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
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="date">Fecha</Label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="date"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="pl-10"
                                required
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading || !selectedClass}>
                            {loading ? "Creando..." : "Crear Clase"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
