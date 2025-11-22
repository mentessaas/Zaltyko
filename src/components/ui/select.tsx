"use client";

import * as React from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

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
    <SelectContext.Provider value={{ value: value || "", onValueChange: onValueChange || (() => {}) }}>
      <select value={value} onChange={handleChange} {...props} className={`flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${props.className || ""}`}>
        {children}
      </select>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const context = React.useContext(SelectContext);
  return <span>{context?.value || placeholder || "Selecciona..."}</span>;
}

export function SelectContent({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}

export function SelectItem({ value, children, ...props }: React.HTMLAttributes<HTMLOptionElement> & { value: string }) {
  const context = React.useContext(SelectContext);
  const isSelected = context?.value === value;

  return (
    <option value={value} selected={isSelected} {...props}>
      {children}
    </option>
  );
}

