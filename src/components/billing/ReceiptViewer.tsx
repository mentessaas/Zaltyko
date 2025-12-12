"use client";

import { useState, useEffect } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Receipt {
  id: string;
  athleteName: string;
  amount: number;
  currency: string;
  period: string;
  items: Array<{
    description: string;
    amount: number;
  }>;
  createdAt: string;
}

interface ReceiptViewerProps {
  academyId: string;
  initialReceipts?: Receipt[];
}

export function ReceiptViewer({ academyId, initialReceipts = [] }: ReceiptViewerProps) {
  const [receipts, setReceipts] = useState<Receipt[]>(initialReceipts);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialReceipts.length === 0) {
      loadReceipts();
    }
  }, [academyId]);

  const loadReceipts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/receipts?academyId=${academyId}`);
      const data = await response.json();
      if (data.items) {
        setReceipts(data.items);
      }
    } catch (error) {
      console.error("Error loading receipts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (receiptId: string) => {
    try {
      const response = await fetch(`/api/receipts/${receiptId}`);
      if (!response.ok) throw new Error("Error al descargar recibo");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recibo-${receiptId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading receipt:", error);
      alert("Error al descargar el recibo");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Recibos Generados</h2>
          <p className="text-muted-foreground mt-1">
            Historial de recibos emitidos
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {receipts.map((receipt) => (
          <Card key={receipt.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{receipt.athleteName}</CardTitle>
                  <CardDescription>
                    {format(new Date(receipt.createdAt), "PPP", { locale: es })}
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {receipt.amount.toFixed(2)} {receipt.currency}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm mb-4">
                <div>
                  <span className="font-medium">Periodo: </span>
                  {receipt.period}
                </div>
                <div>
                  <span className="font-medium">Conceptos: </span>
                  {receipt.items.length}
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleDownload(receipt.id)}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar PDF
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {receipts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No hay recibos generados aún
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

