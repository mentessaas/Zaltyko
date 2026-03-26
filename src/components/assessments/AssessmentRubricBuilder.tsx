"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  weight: number;
}

interface AssessmentRubricBuilderProps {
  criteria: RubricCriterion[];
  onChange: (criteria: RubricCriterion[]) => void;
  disabled?: boolean;
}

export function AssessmentRubricBuilder({ criteria, onChange, disabled }: AssessmentRubricBuilderProps) {
  const addCriterion = () => {
    const newCriterion: RubricCriterion = {
      id: crypto.randomUUID(),
      name: "",
      description: "",
      maxScore: 10,
      weight: 1,
    };
    onChange([...criteria, newCriterion]);
  };

  const updateCriterion = (id: string, updates: Partial<RubricCriterion>) => {
    onChange(criteria.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const removeCriterion = (id: string) => {
    onChange(criteria.filter((c) => c.id !== id));
  };

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const totalMaxScore = criteria.reduce((sum, c) => sum + c.maxScore * c.weight, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Criterios de Evaluación</h3>
          <p className="text-sm text-muted-foreground">
            Define los criterios y puntuaciones para esta evaluación
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCriterion}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-1" />
          Añadir Criterio
        </Button>
      </div>

      {criteria.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-muted-foreground mb-2">No hay criterios definidos</p>
            <Button variant="outline" size="sm" onClick={addCriterion} disabled={disabled}>
              <Plus className="h-4 w-4 mr-1" />
              Añadir primer criterio
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {criteria.map((criterion, index) => (
            <Card key={criterion.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-2 text-muted-foreground">
                    <GripVertical className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Nombre del Criterio</Label>
                        <Input
                          value={criterion.name}
                          onChange={(e) => updateCriterion(criterion.id, { name: e.target.value })}
                          placeholder="Ej: Técnica de salto"
                          disabled={disabled}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Puntaje Máximo</Label>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={criterion.maxScore}
                            onChange={(e) => updateCriterion(criterion.id, { maxScore: parseInt(e.target.value) || 1 })}
                            disabled={disabled}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Peso</Label>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={criterion.weight}
                            onChange={(e) => updateCriterion(criterion.id, { weight: parseInt(e.target.value) || 1 })}
                            disabled={disabled}
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Descripción</Label>
                      <Textarea
                        value={criterion.description}
                        onChange={(e) => updateCriterion(criterion.id, { description: e.target.value })}
                        placeholder="Describe qué se evalúa en este criterio..."
                        rows={2}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCriterion(criterion.id)}
                    disabled={disabled || criteria.length === 1}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {criteria.length > 0 && (
        <div className="rounded-lg bg-muted p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Total de criterios: {criteria.length}
            </span>
            <span className="font-medium">
              Puntuación máxima: {totalMaxScore} puntos
            </span>
          </div>
          {totalWeight > 0 && totalWeight !== criteria.length && (
            <p className="text-xs text-muted-foreground mt-1">
              Nota: Los pesos no están equilibrados (suma: {totalWeight})
            </p>
          )}
        </div>
      )}
    </div>
  );
}
