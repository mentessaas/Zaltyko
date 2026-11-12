"use client";

import * as React from "react";

import { fieldControlClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { }

export interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

export function Select({ value, onValueChange, children, ...props }: SelectProps & { onValueChange?: (value: string) => void }) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (onValueChange) {
      onValueChange(e.target.value);
    }
  };

  return (
    <SelectContext.Provider value={{ value: String(value || ""), onValueChange: onValueChange || (() => { }) }}>
      <select {...props} value={value} onChange={handleChange} className={cn(fieldControlClassName, "h-11 px-4 py-2", props.className)}>
        {children}
      </select>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // Select is intentionally native for keyboard/mobile reliability. Keep the
  // Radix-compatible composition API without nesting divs inside <select>.
  void className;
  void props;
  return <>{children}</>;
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  // The native control renders the selected <option>; a span here would make
  // the resulting select invalid and caused blank dropdowns in browsers.
  void placeholder;
  React.useContext(SelectContext);
  return null;
}

export function SelectContent({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  void props;
  return <>{children}</>;
}

/**
 * Native <option> elements only support phrasing text. A number of screens
 * use the Radix-compatible API with icons, badges, or layout wrappers inside
 * SelectItem; keeping those nodes would create invalid HTML and blank menu
 * entries in Safari/Chromium. Convert the visual children into a stable,
 * accessible text label before rendering the native option.
 */
function getOptionLabel(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getOptionLabel).join(" ").replace(/\s+/g, " ").trim();
  if (React.isValidElement(node)) return getOptionLabel(node.props.children);
  return "";
}

export function SelectItem({ value, children, ...props }: React.HTMLAttributes<HTMLOptionElement> & { value: string }) {
  return (
    <option value={value} {...props}>
      {getOptionLabel(children)}
    </option>
  );
}
