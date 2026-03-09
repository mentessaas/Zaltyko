"use client";

import { useState } from "react";
import { Download, FileText, Mail, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ExportButtonsProps {
  onExportPDF: () => Promise<void>;
  onExportExcel: () => Promise<void>;
  onSendEmail: (email: string) => Promise<void>;
  reportTitle?: string;
  isExporting?: boolean;
}

export function ExportButtons({
  onExportPDF,
  onExportExcel,
  onSendEmail,
  reportTitle = "Reporte",
  isExporting = false,
}: ExportButtonsProps) {
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleExportPDF = async () => {
    try {
      await onExportPDF();
    } catch (error) {
      console.error("Error exporting PDF:", error);
    }
  };

  const handleExportExcel = async () => {
    try {
      await onExportExcel();
    } catch (error) {
      console.error("Error exporting Excel:", error);
    }
  };

  const handleSendEmail = async () => {
    if (!email) return;

    setIsSending(true);
    try {
      await onSendEmail(email);
      setShowEmailDialog(false);
      setEmail("");
    } catch (error) {
      console.error("Error sending email:", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleExportPDF} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          PDF
        </Button>
        <Button variant="outline" onClick={handleExportExcel} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Excel
        </Button>
        <Button variant="outline" onClick={() => setShowEmailDialog(true)} disabled={isExporting}>
          <Mail className="mr-2 h-4 w-4" />
          Email
        </Button>
      </div>

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Reporte por Email</DialogTitle>
            <DialogDescription>
              Envía el reporte "{reportTitle}" a una dirección de email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Dirección de Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSendEmail} disabled={!email || isSending}>
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
