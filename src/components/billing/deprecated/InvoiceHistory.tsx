"use client";

import { Download, FileText, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Invoice {
    id: string;
    invoice_number: string;
    amount: number;
    status: "paid" | "pending" | "failed";
    created_at: Date;
    pdf_url?: string;
    description: string;
}

interface InvoiceHistoryProps {
    invoices: Invoice[];
    loading?: boolean;
}

const STATUS_CONFIG = {
    paid: {
        label: "Pagada",
        icon: CheckCircle,
        color: "text-green-600 bg-green-50 border-green-200",
    },
    pending: {
        label: "Pendiente",
        icon: Clock,
        color: "text-amber-600 bg-amber-50 border-amber-200",
    },
    failed: {
        label: "Fallida",
        icon: XCircle,
        color: "text-red-600 bg-red-50 border-red-200",
    },
};

export function InvoiceHistory({ invoices, loading = false }: InvoiceHistoryProps) {
    const handleDownload = async (invoice: Invoice) => {
        if (!invoice.pdf_url) return;

        try {
            const response = await fetch(invoice.pdf_url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `factura-${invoice.invoice_number}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error("Error descargando factura:", error);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
                ))}
            </div>
        );
    }

    if (invoices.length === 0) {
        return (
            <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No hay facturas disponibles</p>
                <p className="text-sm text-gray-500 mt-1">
                    Tus facturas aparecerán aquí cuando realices un pago
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {invoices.map((invoice) => {
                const statusConfig = STATUS_CONFIG[invoice.status];
                const StatusIcon = statusConfig.icon;

                return (
                    <div
                        key={invoice.id}
                        className="flex items-center justify-between p-4 rounded-lg border border-zaltyko-border hover:border-zaltyko-primary/50 transition-colors glass-panel"
                    >
                        <div className="flex items-center gap-4 flex-1">
                            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-zaltyko-primary to-zaltyko-accent-teal flex items-center justify-center">
                                <FileText className="w-6 h-6 text-white" />
                            </div>

                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <p className="font-semibold">Factura #{invoice.invoice_number}</p>
                                    <Badge className={cn("text-xs", statusConfig.color)}>
                                        <StatusIcon className="w-3 h-3 mr-1" />
                                        {statusConfig.label}
                                    </Badge>
                                </div>
                                <p className="text-sm text-zaltyko-text-light">
                                    {invoice.description}
                                </p>
                                <p className="text-xs text-zaltyko-text-light mt-1">
                                    {format(invoice.created_at, "d 'de' MMMM 'de' yyyy", { locale: es })}
                                </p>
                            </div>

                            <div className="text-right">
                                <p className="text-2xl font-bold">
                                    ${invoice.amount.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        {invoice.pdf_url && invoice.status === "paid" && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownload(invoice)}
                                className="ml-4"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Descargar PDF
                            </Button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
