"use client";

import * as React from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, isBefore, startOfDay } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
  minDate?: Date;
  maxDate?: Date;
  locale?: "es" | "en";
}

interface DateRange {
  from?: Date;
  to?: Date;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
  minDate?: Date;
  maxDate?: Date;
  locale?: "es" | "en";
}

const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  ({
    value,
    onChange,
    placeholder = "Selecciona una fecha",
    disabled,
    className,
    minDate,
    maxDate,
    locale = "es",
  }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [viewDate, setViewDate] = React.useState(value || new Date());

    const dateLocale = locale === "es" ? es : enUS;

    const days = React.useMemo(() => {
      const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }, [viewDate]);

    const handleSelect = (day: Date) => {
      if (minDate && isBefore(day, startOfDay(minDate))) return;
      if (maxDate && isBefore(day, startOfDay(maxDate))) return;
      onChange?.(day);
      setOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        action();
      }
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={placeholder}
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal h-11 px-4",
              !value && "text-muted-foreground",
              className
            )}
            onClick={() => setOpen(!open)}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "PPP", { locale: dateLocale }) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewDate(subMonths(viewDate, 1))}
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {format(viewDate, "MMMM yyyy", { locale: dateLocale })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewDate(addMonths(viewDate, 1))}
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-muted-foreground py-1"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Selector de fecha">
              {days.map((day) => {
                const isDisabled =
                  (minDate && isBefore(day, startOfDay(minDate))) ||
                  (maxDate && isBefore(day, startOfDay(maxDate)));
                const isSelected = value && isSameDay(day, value);
                const isCurrentMonth = isSameMonth(day, viewDate);
                const isDayToday = isToday(day);

                return (
                  <div key={day.toISOString()} role="gridcell">
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleSelect(day)}
                      onKeyDown={(e) => handleKeyDown(e, () => handleSelect(day))}
                      tabIndex={isSelected ? 0 : -1}
                      className={cn(
                        "h-8 w-8 p-0 text-sm rounded-md transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        !isCurrentMonth && "text-muted-foreground/50",
                        isDayToday && "bg-primary/10 font-semibold text-primary",
                        isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                        isDisabled && "pointer-events-none opacity-50 cursor-not-allowed",
                        !isSelected && !isDisabled && "hover:bg-accent hover:text-accent-foreground"
                      )}
                      aria-label={format(day, "EEEE, MMMM d, yyyy", { locale: dateLocale })}
                      aria-selected={isSelected}
                      aria-disabled={isDisabled}
                    >
                      {format(day, "d")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);
DatePicker.displayName = "DatePicker";

const DateRangePicker = React.forwardRef<HTMLButtonElement, DateRangePickerProps>(
  ({
    value,
    onChange,
    placeholder = "Selecciona un rango de fechas",
    disabled,
    className,
    minDate,
    maxDate,
    locale = "es",
  }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [viewDate, setViewDate] = React.useState(value?.from || new Date());
    const [selecting, setSelecting] = React.useState<"from" | "to">("from");

    const dateLocale = locale === "es" ? es : enUS;

    const days = React.useMemo(() => {
      const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }, [viewDate]);

    const handleSelect = (day: Date) => {
      if (selecting === "from") {
        onChange?.({ from: day, to: undefined });
        setSelecting("to");
      } else {
        if (value?.from && isBefore(day, value.from)) {
          onChange?.({ from: day, to: undefined });
          setSelecting("to");
        } else {
          onChange?.({ from: value?.from, to: day });
          setOpen(false);
          setSelecting("from");
        }
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        action();
      }
    };

    const formatRange = () => {
      if (!value?.from) return placeholder;
      if (!value?.to) return format(value.from, "PPP", { locale: dateLocale });
      return `${format(value.from, "PPP", { locale: dateLocale })} - ${format(value.to, "PPP", { locale: dateLocale })}`;
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={placeholder}
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal h-11 px-4",
              !value?.from && "text-muted-foreground",
              className
            )}
            onClick={() => setOpen(!open)}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatRange()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewDate(subMonths(viewDate, 1))}
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {format(viewDate, "MMMM yyyy", { locale: dateLocale })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewDate(addMonths(viewDate, 1))}
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-muted-foreground py-1"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Selector de rango de fechas">
              {days.map((day) => {
                const isInRange =
                  value?.from &&
                  value?.to &&
                  !isBefore(day, value.from) &&
                  !isBefore(value.to, day);
                const isRangeStart = value?.from && isSameDay(day, value.from);
                const isRangeEnd = value?.to && isSameDay(day, value.to);
                const isCurrentMonth = isSameMonth(day, viewDate);
                const isDayToday = isToday(day);

                return (
                  <div key={day.toISOString()} role="gridcell">
                    <button
                      type="button"
                      onClick={() => handleSelect(day)}
                      onKeyDown={(e) => handleKeyDown(e, () => handleSelect(day))}
                      tabIndex={isRangeStart || isRangeEnd ? 0 : -1}
                      className={cn(
                        "h-8 w-8 p-0 text-sm rounded-md transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        !isCurrentMonth && "text-muted-foreground/50",
                        isDayToday && !isInRange && "bg-primary/10 font-semibold text-primary",
                        isInRange && "bg-primary/20",
                        (isRangeStart || isRangeEnd) && "bg-primary text-primary-foreground hover:bg-primary/90",
                        !isRangeStart && !isRangeEnd && "hover:bg-accent hover:text-accent-foreground"
                      )}
                      aria-label={format(day, "EEEE, MMMM d, yyyy", { locale: dateLocale })}
                      aria-selected={isRangeStart || isRangeEnd}
                    >
                      {format(day, "d")}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t text-xs text-muted-foreground text-center">
              {selecting === "from" ? "Selecciona fecha de inicio" : "Selecciona fecha de fin"}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);
DateRangePicker.displayName = "DateRangePicker";

export { DatePicker, DateRangePicker };
export type { DatePickerProps, DateRangePickerProps, DateRange };
