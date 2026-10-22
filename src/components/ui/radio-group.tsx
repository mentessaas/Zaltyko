"use client";

import * as React from "react";

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroupContext = React.createContext<{ value?: string; onValueChange?: (value: string) => void } | null>(null);

export function RadioGroup({ value, onValueChange, children, className = "", ...props }: RadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div className={`space-y-2 ${className}`} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
}

export function RadioGroupItem({ value, id, className = "", ...props }: RadioGroupItemProps) {
  const context = React.useContext(RadioGroupContext);
  const isChecked = context?.value === value;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (context?.onValueChange) {
      context.onValueChange(e.target.value);
    }
    if (props.onChange) {
      props.onChange(e);
    }
  };

  return (
    <input
      type="radio"
      id={id}
      value={value}
      checked={isChecked}
      onChange={handleChange}
      className={`h-4 w-4 border-border text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 ${className}`}
      {...props}
    />
  );
}

