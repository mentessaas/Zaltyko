"use client";

import { useState } from "react";
import { Edit, Trash2, Calendar, Users, Tag } from "lucide-react";
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

export interface Campaign {
  id: string;
  discountId: string;
  discountName: string;
  discountCode: string | null;
  discountValue: number;
  discountType: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  maxUses: number | null;
  currentUses: number;
  isActive: boolean;
  createdAt?: string;
}

interface CampaignListProps {
  campaigns: Campaign[];
  onEdit?: (campaign: Campaign) => void;
  onDelete?: (id: string) => void;
  onToggleActive?: (campaign: Campaign) => void;
}

export function CampaignList({
  campaigns,
  onEdit,
  onDelete,
  onToggleActive,
}: CampaignListProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Tag className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            No hay campañas de descuentos registradas.
          </p>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Crea tu primera campaña para comenzar.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (campaign: Campaign) => {
    const today = new Date();
    const startDate = new Date(campaign.startDate);
    const endDate = campaign.endDate ? new Date(campaign.endDate) : null;

    if (!campaign.isActive) {
      return <Badge variant="secondary">Inactiva</Badge>;
    }

    if (startDate > today) {
      return <Badge variant="outline">Próxima</Badge>;
    }

    if (endDate && endDate < today) {
      return <Badge variant="destructive">Expirada</Badge>;
    }

    if (campaign.maxUses && campaign.currentUses >= campaign.maxUses) {
      return <Badge variant="warning">Agotada</Badge>;
    }

    return <Badge variant="default">Activa</Badge>;
  };

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
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{campaign.name}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Tag className="h-3 w-3" />
                      {campaign.discountName}
                    </CardDescription>
                  </div>
                  {getStatusBadge(campaign)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {campaign.discountCode && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Código:</span>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {campaign.discountCode}
                      </code>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Descuento:</span>
                    <span className="font-medium">
                      {campaign.discountType === "percentage"
                        ? `${campaign.discountValue}%`
                        : `${campaign.discountValue} EUR`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {format(new Date(campaign.startDate), "dd MMM", {
                        locale: es,
                      })}
                      {campaign.endDate
                        ? ` - ${format(new Date(campaign.endDate), "dd MMM yyyy", {
                            locale: es,
                          })}`
                        : " - Sin fecha fin"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Usos: {campaign.currentUses}
                      {campaign.maxUses && ` / ${campaign.maxUses}`}
                    </span>
                  </div>
                </div>
                {campaign.description && (
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-2">
                    {campaign.description}
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  {onEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(campaign)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(campaign.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
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
                <TableHead>Campaña</TableHead>
                <TableHead>Descuento</TableHead>
                <TableHead>Fecha Inicio</TableHead>
                <TableHead>Fecha Fin</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell className="font-medium">{campaign.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{campaign.discountName}</span>
                      {campaign.discountCode && (
                        <code className="text-xs text-muted-foreground">
                          {campaign.discountCode}
                        </code>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(new Date(campaign.startDate), "dd/MM/yyyy", {
                      locale: es,
                    })}
                  </TableCell>
                  <TableCell>
                    {campaign.endDate
                      ? format(new Date(campaign.endDate), "dd/MM/yyyy", {
                          locale: es,
                        })
                      : "Sin límite"}
                  </TableCell>
                  <TableCell>
                    {campaign.currentUses}
                    {campaign.maxUses && ` / ${campaign.maxUses}`}
                  </TableCell>
                  <TableCell>{getStatusBadge(campaign)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {onEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(campaign)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(campaign.id)}
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
