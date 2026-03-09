"use client";

import { useState } from "react";
import { Edit, Trash2, Copy, CheckCircle, XCircle } from "lucide-react";
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

export interface Discount {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  applicableTo: string;
  minAmount: number | null;
  maxDiscount: number | null;
  startDate: string;
  endDate: string | null;
  maxUses: number | null;
  currentUses: number;
  isActive: boolean;
}

interface DiscountListProps {
  discounts: Discount[];
  onEdit?: (discount: Discount) => void;
  onDelete?: (id: string) => void;
  onToggleActive?: (discount: Discount) => void;
}

export function DiscountList({
  discounts,
  onEdit,
  onDelete,
  onToggleActive,
}: DiscountListProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  if (discounts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground text-center">
            No hay descuentos registrados.
          </p>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Crea tu primer descuento para comenzar.
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
          {discounts.map((discount) => (
            <Card key={discount.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{discount.name}</CardTitle>
                    {discount.code && (
                      <CardDescription className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {discount.code}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyCode(discount.code!)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </CardDescription>
                    )}
                  </div>
                  <Badge
                    variant={discount.isActive ? "default" : "secondary"}
                  >
                    {discount.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Descuento:</span>
                    <span className="font-medium">
                      {discount.discountType === "percentage"
                        ? `${discount.discountValue}%`
                        : `${discount.discountValue} EUR`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Aplicado a:</span>
                    <span>
                      {discount.applicableTo === "all"
                        ? "Todos"
                        : discount.applicableTo === "specific"
                        ? "Específico"
                        : discount.applicableTo}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Usos:</span>
                    <span>
                      {discount.currentUses}
                      {discount.maxUses && ` / ${discount.maxUses}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vigencia:</span>
                    <span className="text-xs">
                      {format(new Date(discount.startDate), "dd/MM/yyyy", {
                        locale: es,
                      })}
                      {discount.endDate
                        ? ` - ${format(
                            new Date(discount.endDate),
                            "dd/MM/yyyy",
                            { locale: es }
                          )}`
                        : " - Sin límite"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  {onEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(discount)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(discount.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </Button>
                  )}
                  {onToggleActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onToggleActive(discount)}
                    >
                      {discount.isActive ? (
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
                <TableHead>Nombre</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discounts.map((discount) => (
                <TableRow key={discount.id}>
                  <TableCell className="font-medium">{discount.name}</TableCell>
                  <TableCell>
                    {discount.code && (
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {discount.code}
                      </code>
                    )}
                  </TableCell>
                  <TableCell>
                    {discount.discountType === "percentage"
                      ? "Porcentaje"
                      : "Fijo"}
                  </TableCell>
                  <TableCell>
                    {discount.discountType === "percentage"
                      ? `${discount.discountValue}%`
                      : `${discount.discountValue} EUR`}
                  </TableCell>
                  <TableCell>
                    {discount.currentUses}
                    {discount.maxUses && ` / ${discount.maxUses}`}
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(discount.startDate), "dd/MM/yyyy", {
                      locale: es,
                    })}
                    {discount.endDate
                      ? ` - ${format(new Date(discount.endDate), "dd/MM/yyyy", {
                          locale: es,
                        })}`
                      : " - Sin límite"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={discount.isActive ? "default" : "secondary"}
                    >
                      {discount.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {onEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(discount)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(discount.id)}
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
