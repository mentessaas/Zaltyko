"use client";

import { useState, useEffect } from "react";
import { History, Download } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UsageRecord {
  id: string;
  discountId: string;
  discountName: string;
  discountCode: string | null;
  athleteId: string | null;
  athleteName: string | null;
  chargeId: string | null;
  discountAmount: number;
  originalAmount: number;
  finalAmount: number;
  usedAt: string;
}

interface DiscountHistoryProps {
  academyId: string;
}

export function DiscountHistory({ academyId }: DiscountHistoryProps) {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [totalUsage, setTotalUsage] = useState(0);
  const [totalDiscount, setTotalDiscount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/discounts/usage?academyId=${academyId}&limit=100`
      );
      const data = await response.json();
      if (data.items) {
        setRecords(data.items);
        setTotalUsage(data.summary.totalUsage);
        setTotalDiscount(data.summary.totalDiscount);
      }
    } catch (error) {
      console.error("Error loading discount history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [academyId]);

  const filteredRecords = records.filter(
    (record) =>
      record.discountName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.discountCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.athleteName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportCSV = () => {
    const headers = [
      "Fecha",
      "Descuento",
      "Código",
      "Atleta",
      "Monto Original",
      "Descuento",
      "Monto Final",
    ];
    const rows = filteredRecords.map((r) => [
      format(new Date(r.usedAt), "yyyy-MM-dd HH:mm"),
      r.discountName || "",
      r.discountCode || "",
      r.athleteName || "",
      r.originalAmount.toFixed(2),
      r.discountAmount.toFixed(2),
      r.finalAmount.toFixed(2),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial-descuentos-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6" />
            Historial de Descuentos
          </h2>
          <p className="text-muted-foreground mt-1">
            Registro de todos los descuentos aplicados
          </p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Usos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsage}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Total Descontado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalDiscount.toFixed(2)} EUR
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Descuento Promedio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalUsage > 0 ? (totalDiscount / totalUsage).toFixed(2) : "0.00"}{" "}
              EUR
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Buscar</Label>
              <Input
                id="search"
                placeholder="Buscar por descuento, código o atleta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay registros de uso de descuentos
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descuento</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Atleta</TableHead>
                  <TableHead className="text-right">Original</TableHead>
                  <TableHead className="text-right">Descuento</TableHead>
                  <TableHead className="text-right">Final</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(record.usedAt), "dd/MM/yyyy HH:mm", {
                        locale: es,
                      })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {record.discountName}
                    </TableCell>
                    <TableCell>
                      {record.discountCode && (
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {record.discountCode}
                        </code>
                      )}
                    </TableCell>
                    <TableCell>{record.athleteName || "-"}</TableCell>
                    <TableCell className="text-right">
                      {record.originalAmount.toFixed(2)} EUR
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      -{record.discountAmount.toFixed(2)} EUR
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {record.finalAmount.toFixed(2)} EUR
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
