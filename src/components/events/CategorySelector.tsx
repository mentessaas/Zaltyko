"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Category {
  value: string;
  label: string;
}

interface CategorySelectorProps {
  value: string[];
  onChange: (value: string[]) => void;
  categories: Category[];
  placeholder?: string;
  maxItems?: number;
  disabled?: boolean;
}

export function CategorySelector({
  value,
  onChange,
  categories,
  placeholder = "Seleccionar categorías",
  maxItems,
  disabled = false,
}: CategorySelectorProps) {
  const selectedCategories = categories.filter((c) => value.includes(c.value));

  const toggleCategory = (categoryValue: string) => {
    if (value.includes(categoryValue)) {
      onChange(value.filter((v) => v !== categoryValue));
    } else {
      if (maxItems && value.length >= maxItems) {
        return;
      }
      onChange([...value, categoryValue]);
    }
  };

  const removeCategory = (categoryValue: string) => {
    onChange(value.filter((v) => v !== categoryValue));
  };

  return (
    <div className="space-y-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="w-full justify-start font-normal"
          >
            {selectedCategories.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {selectedCategories.slice(0, 3).map((cat) => (
                  <Badge
                    key={cat.value}
                    variant="outline"
                    className="mr-1 text-xs"
                  >
                    {cat.label}
                  </Badge>
                ))}
                {selectedCategories.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{selectedCategories.length - 3}
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar categoría..." />
            <CommandList>
              <CommandEmpty>No se encontró categoría.</CommandEmpty>
              <CommandGroup>
                {categories.map((category) => {
                  const isSelected = value.includes(category.value);
                  return (
                    <CommandItem
                      key={category.value}
                      value={category.value}
                      onSelect={() => toggleCategory(category.value)}
                      disabled={!isSelected && maxItems !== undefined && value.length >= maxItems}
                      className="cursor-pointer"
                    >
                      <div
                        className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "border-muted-foreground"
                        }`}
                      >
                        {isSelected && (
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      {category.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected Categories Display */}
      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCategories.map((category) => (
            <Badge
              key={category.value}
              variant="outline"
              className="pl-2 pr-1 py-1 flex items-center gap-1"
            >
              {category.label}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeCategory(category.value)}
                  className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {maxItems && (
        <p className="text-xs text-muted-foreground">
          {value.length}/{maxItems} categorías seleccionadas
        </p>
      )}
    </div>
  );
}
