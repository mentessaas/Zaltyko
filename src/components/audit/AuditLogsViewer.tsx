"use client";

import { useState, useEffect } from "react";
import { Filter, Download, Search, Loader2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface AuditLog {
  id: string;
  action: string;
  tableName: string;
  recordId: string;
  userId: string;
  userName: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditLogsViewerProps {
  academyId: string;
}

export function AuditLogsViewer({ academyId }: AuditLogsViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterTable, setFilterTable] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    loadLogs();
  }, [academyId]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        academyId,
        ...(searchQuery && { q: searchQuery }),
        ...(filterAction !== "all" && { action: filterAction }),
        ...(filterTable !== "all" && { table: filterTable }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });

      const response = await fetch(`/api/audit-logs?${params}`);
      const data = await response.json();

      if (data.items) {
        setLogs(data.items);
      }
    } catch (error) {
      console.error("Error loading audit logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = () => {
    const csv = [
      ["Fecha", "Acción", "Tabla", "Usuario", "ID Registro", "Metadata"].join(","),
      ...logs.map((log) =>
        [
          format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss"),
          log.action,
          log.tableName,
          log.userName,
          log.recordId,
          JSON.stringify(log.metadata || {}),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const filteredLogs = logs.filter((log) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        log.action.toLowerCase().includes(query) ||
        log.tableName.toLowerCase().includes(query) ||
        log.userName.toLowerCase().includes(query) ||
        log.recordId.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action)));
  const uniqueTables = Array.from(new Set(logs.map((l) => l.tableName)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Logs de Auditoría</h2>
          <p className="text-muted-foreground mt-1">
            Historial de acciones realizadas en el sistema
          </p>
        </div>
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar</Label>
              <Input
                id="search"
                placeholder="Buscar en logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="action">Acción</Label>
              <select
                id="action"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="all">Todas</option>
                {uniqueActions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="table">Tabla</Label>
              <select
                id="table"
                value={filterTable}
                onChange={(e) => setFilterTable(e.target.value)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="all">Todas</option>
                {uniqueTables.map((table) => (
                  <option key={table} value={table}>
                    {table}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-date">Fecha Inicio</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={loadLogs} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cargando...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Aplicar Filtros
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros de Auditoría</CardTitle>
          <CardDescription>{filteredLogs.length} registros encontrados</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No se encontraron logs con los filtros aplicados
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{log.action}</Badge>
                      <Badge variant="secondary">{log.tableName}</Badge>
                      <span className="text-sm text-muted-foreground">
                        por {log.userName}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(log.createdAt), "PPP 'a las' p", { locale: es })}
                      </span>
                      <span>ID: {log.recordId}</span>
                    </div>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer">
                          Ver metadata
                        </summary>
                        <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

