import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface EventCategory {
  id: string;
  name: string;
  description?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  levels?: string[] | null;
  gender?: string | null;
  maxCapacity?: number | null;
  registrationFee?: number | null;
  sortOrder?: number;
}

interface EventCategoriesListProps {
  categories: EventCategory[];
  className?: string;
}

function formatAgeRange(minAge?: number | null, maxAge?: number | null): string {
  if (minAge !== null && maxAge !== null) {
    return `${minAge}-${maxAge} años`;
  }
  if (minAge !== null) {
    return `+${minAge} años`;
  }
  if (maxAge !== null) {
    return `hasta ${maxAge} años`;
  }
  return "";
}

function formatPrice(cents: number | null | undefined): string {
  if (!cents) return "Gratis";
  return `${(cents / 100).toFixed(2)} €`;
}

function getGenderLabel(gender?: string | null): string {
  switch (gender) {
    case "female":
      return "Femenino";
    case "male":
      return "Masculino";
    case "mixed":
      return "Mixto";
    default:
      return "";
  }
}

function getLevelLabels(levels?: string[] | null): string[] {
  if (!levels || levels.length === 0) return [];
  const labels: Record<string, string> = {
    beginner: "Iniciación",
    intermediate: "Intermedio",
    advanced: "Avanzado",
    elite: "Élite",
  };
  return levels.map((l) => labels[l] || l);
}

export function EventCategoriesList({ categories, className }: EventCategoriesListProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="font-semibold text-sm text-muted-foreground">Categorías</h3>
      <div className="grid gap-3">
        {categories.map((category) => (
          <Card key={category.id} className="overflow-hidden">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm">{category.name}</h4>
                  {category.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {category.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {category.minAge !== null && category.maxAge !== null && (
                      <Badge variant="outline" className="text-[10px] py-0 h-5">
                        {formatAgeRange(category.minAge, category.maxAge)}
                      </Badge>
                    )}
                    {category.gender && (
                      <Badge variant="outline" className="text-[10px] py-0 h-5">
                        {getGenderLabel(category.gender)}
                      </Badge>
                    )}
                    {category.levels && category.levels.length > 0 && (
                      <>
                        {category.levels.slice(0, 2).map((level) => (
                          <Badge key={level} variant="outline" className="text-[10px] py-0 h-5">
                            {getLevelLabels([level])[0]}
                          </Badge>
                        ))}
                        {category.levels.length > 2 && (
                          <Badge variant="outline" className="text-[10px] py-0 h-5">
                            +{category.levels.length - 2}
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {category.registrationFee !== null && (
                    <span className="font-semibold text-sm text-zaltyko-primary">
                      {formatPrice(category.registrationFee)}
                    </span>
                  )}
                  {category.maxCapacity !== null && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 justify-end">
                      <Users className="h-3 w-3" />
                      <span>{category.maxCapacity}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface CategoryBadgeProps {
  category: EventCategory;
  className?: string;
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const parts = [category.name];

  if (category.minAge !== null && category.maxAge !== null) {
    parts.push(formatAgeRange(category.minAge, category.maxAge));
  }

  if (category.gender) {
    parts.push(getGenderLabel(category.gender));
  }

  return (
    <Badge variant="outline" className={cn("text-xs", className)}>
      {parts.join(" • ")}
    </Badge>
  );
}
