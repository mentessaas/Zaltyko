"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export interface ComboboxOption<TValue = string> {
  value: TValue;
  label: string;
  disabled?: boolean;
  group?: string;
}

interface ComboboxProps<TValue = string> {
  value?: TValue;
  onChange?: (value: TValue | undefined) => void;
  options: ComboboxOption<TValue>[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  multiple?: false;
}

interface ComboboxMultipleProps<TValue = string> {
  value?: TValue[];
  onChange?: (value: TValue[]) => void;
  options: ComboboxOption<TValue>[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  multiple: true;
}

type ComboboxCombinedProps<TValue = string> =
  | ComboboxProps<TValue>
  | ComboboxMultipleProps<TValue>;

interface ComboboxTriggerProps {
  children?: React.ReactNode;
  className?: string;
  hasValue?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onClear?: () => void;
  onClick?: () => void;
}

const ComboboxTrigger = React.forwardRef<HTMLButtonElement, ComboboxTriggerProps>(
  ({ children, className, hasValue, placeholder, disabled, onClear, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={false}
        disabled={disabled}
        className={cn("w-full justify-between font-normal h-11 px-4", className)}
        {...props}
      >
        <span className={cn(!hasValue && "text-muted-foreground")}>
          {children || placeholder || "Selecciona..."}
        </span>
        <div className="flex items-center gap-1">
          {hasValue && !disabled && onClear && (
            <span
              role="button"
              tabIndex={0}
              className="hover:bg-accent rounded-md p-1"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onClear();
                }
              }}
              aria-label="Limpiar selección"
            >
              <X className="h-4 w-4" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </div>
      </Button>
    );
  }
);
ComboboxTrigger.displayName = "ComboboxTrigger";

const ComboboxContent = React.forwardRef<
  React.ElementRef<typeof PopoverContent>,
  React.ComponentPropsWithoutRef<typeof PopoverContent> & {
    children: React.ReactNode;
  }
>(({ children, className, ...props }, ref) => {
  return (
    <PopoverContent
      ref={ref}
      className={cn("w-[var(--radix-popover-trigger-width)] p-0", className)}
      align="start"
      {...props}
    >
      <Command className="rounded-lg border shadow-md">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Buscar..."
          />
        </div>
        <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden">
          {children}
        </CommandList>
      </Command>
    </PopoverContent>
  );
});
ComboboxContent.displayName = "ComboboxContent";

function ComboboxInner<TValue = string>(
  {
    value,
    onChange,
    options,
    placeholder,
    searchPlaceholder = "Buscar...",
    emptyMessage = "No se encontraron resultados",
    disabled,
    className,
    multiple,
  }: ComboboxCombinedProps<TValue>,
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedValues = React.useMemo(() => {
    if (multiple && Array.isArray(value)) {
      return new Set(value.map(String));
    }
    return new Set(value ? [String(value)] : []);
  }, [value, multiple]);

  const handleSelect = (currentValue: string) => {
    const selected = currentValue === value ? undefined : currentValue;

    if (multiple) {
      const currentArray = Array.isArray(value) ? value : [];
      if (selected) {
        onChange?.([...currentArray, selected as unknown as TValue]);
      }
    } else {
      onChange?.(selected as unknown as TValue);
      setOpen(false);
    }
  };

  const handleClear = () => {
    if (multiple) {
      onChange?.([]);
    } else {
      onChange?.(undefined);
    }
  };

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const lowerSearch = search.toLowerCase();
    return options.filter((option) =>
      option.label.toLowerCase().includes(lowerSearch)
    );
  }, [options, search]);

  const groupedOptions = React.useMemo(() => {
    const groups: Record<string, ComboboxOption<TValue>[]> = {};
    filteredOptions.forEach((option) => {
      const group = option.group || "";
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(option);
    });
    return groups;
  }, [filteredOptions]);

  const displayValue = React.useMemo(() => {
    if (multiple && Array.isArray(value)) {
      return value.length > 0
        ? `${value.length} seleccionado${value.length > 1 ? "s" : ""}`
        : "";
    }
    if (value) {
      const selectedOption = options.find((opt) => String(opt.value) === String(value));
      return selectedOption?.label || "";
    }
    return "";
  }, [value, multiple, options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ComboboxTrigger
          ref={ref}
          hasValue={!!(multiple ? (Array.isArray(value) && value.length > 0) : value)}
          placeholder={placeholder}
          disabled={disabled}
          onClear={handleClear}
          className={className}
          onClick={() => setOpen(!open)}
        >
          {displayValue}
        </ComboboxTrigger>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={true}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {Object.entries(groupedOptions).map(([group, groupOptions]) => (
              <CommandGroup
                key={group}
                heading={group || undefined}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {groupOptions.map((option) => {
                  const isSelected = selectedValues.has(String(option.value));
                  return (
                    <CommandItem
                      key={String(option.value)}
                      value={String(option.value)}
                      disabled={option.disabled}
                      onSelect={() => handleSelect(String(option.value))}
                      className={cn(
                        "cursor-pointer",
                        isSelected && "bg-primary/10 text-primary",
                        option.disabled && "opacity-50 cursor-not-allowed"
                      )}
                      aria-selected={isSelected}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1">{option.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const Combobox = React.forwardRef(ComboboxInner) as <TValue = string>(
  props: ComboboxCombinedProps<TValue> & { ref?: React.ForwardedRef<HTMLButtonElement> }
) => React.ReactElement;

export { Combobox, ComboboxTrigger, ComboboxContent };
export type { ComboboxProps, ComboboxMultipleProps, ComboboxCombinedProps };
