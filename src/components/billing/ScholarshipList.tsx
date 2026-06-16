"use client";

import { useState } from "react";
import { Edit, Trash2, User, Calendar, Award, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface Scholarship {
  id: string;
  athleteId: string;
  athleteName: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

interface ScholarshipListProps {
  scholarships: Scholarship[];
  onEdit?: (scholarship: Scholarship) => void;
  onDelete?: (id: string) => void;
  onToggleActive?: (scholarship: Scholarship) => void;
}

export function ScholarshipList({
  scholarships,
  onEdit,
  onDelete,
  onToggleActive,
}: ScholarshipListProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const getStatusBadge = (scholarship: Scholarship) => {
    const today = new Date();
    const startDate = new Date(scholarship.startDate);
    const endDate = scholarship.endDate ? new Date(scholarship.endDate) : null;

    if (!scholarship.isActive) {
      return <Badge variant="outline">Inactiva</Badge>;
    }

    if (startDate > today) {
      return <Badge variant="outline">Próxima</Badge>;
    }

    if (endDate && endDate < today) {
      return <Badge variant="error">Expirada</Badge>;
    }

    return <Badge variant="success">Activa</Badge>;
  };

  const getScholarshipType = (discountType: string, discountValue: number) => {
    if (discountType === "percentage" && discountValue >= 100) {
      return "Beca Completa";
    }
    if (discountType === "percentage") {
      return `Beca Parcial (${discountValue}%)`;
    }
    return `Beca Fija (${discountValue} EUR)`;
  };

  if (scholarships.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Award className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            No hay becas registradas.
          </p>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Crea tu primera beca para comenzar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button
          variant={viewMode === "grid" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("grid")}
        >
          Grid
        </Button>
        <Button
          variant={viewMode === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("list")}
        >
          Lista
        </Button>
      </div>

      {viewMode === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scholarships.map((scholarship) => (
            <Card key={scholarship.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{scholarship.name}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <User className="h-3 w-3" />
                      {scholarship.athleteName}
                    </CardDescription>
                  </div>
                  {getStatusBadge(scholarship)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {getScholarshipType(
                        scholarship.discountType,
                        scholarship.discountValue
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {format(new Date(scholarship.startDate), "dd MMM yyyy", {
                        locale: es,
                      })}
                      {scholarship.endDate
                        ? ` - ${format(new Date(scholarship.endDate), "dd MMM yyyy", {
                            locale: es,
                          })}`
                        : " - Sin fecha fin"}
                    </span>
                  </div>
                </div>
                {scholarship.description && (
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-2">
                    {scholarship.description}
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  {onEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(scholarship)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(scholarship.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </Button>
                  )}
                  {onToggleActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onToggleActive(scholarship)}
                    >
                      {scholarship.isActive ? (
                        <>
                          <XCircle className="mr-2 h-4 w-4" />
                          Desactivar
                        </>
                      ) : (
                        <>
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Activar
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Beca</TableHead>
                <TableHead>Atleta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descuento</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scholarships.map((scholarship) => (
                <TableRow key={scholarship.id}>
                  <TableCell className="font-medium">{scholarship.name}</TableCell>
                  <TableCell>{scholarship.athleteName}</TableCell>
                  <TableCell>
                    {scholarship.discountType === "percentage"
                      ? scholarship.discountValue >= 100
                        ? "Completa"
                        : "Parcial"
                      : "Fijo"}
                  </TableCell>
                  <TableCell>
                    {scholarship.discountType === "percentage"
                      ? `${scholarship.discountValue}%`
                      : `${scholarship.discountValue} EUR`}
                  </TableCell>
                  <TableCell>
                    {format(new Date(scholarship.startDate), "dd/MM/yyyy", {
                      locale: es,
                    })}
                  </TableCell>
                  <TableCell>
                    {scholarship.endDate
                      ? format(new Date(scholarship.endDate), "dd/MM/yyyy", {
                          locale: es,
                        })
                      : "Sin límite"}
                  </TableCell>
                  <TableCell>{getStatusBadge(scholarship)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {onEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(scholarship)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(scholarship.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
