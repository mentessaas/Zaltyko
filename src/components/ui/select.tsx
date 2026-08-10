"use client";

import * as React from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

const BASE_SELECT_CLASSES =
  "flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function cn(...classes: Array<string | undefined | false | null>): string {
  return classes.filter(Boolean).join(" ");
}

export function Select({
  value,
  onValueChange,
  id,
  className,
  children,
  ...props
}: SelectProps & { onValueChange?: (value: string) => void }) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (onValueChange) onValueChange(e.target.value);
  };

  // ZAL-494 / PV-1: <option> elements must be direct children of the underlying
  // <select> for HTMLSelectElement.options to collect them. We flatten
  // <SelectTrigger> (and rely on <SelectContent> rendering as a Fragment) so
  // the <option>s land directly inside <select>.
  //
  // We also capture the className/id passed to <SelectTrigger> and merge them
  // onto the <select> itself. PV-11: a <Label htmlFor="x"> needs the actual
  // form control to carry id="x"; passing id to a div wrapper leaves the label
  // association broken (WCAG 1.3.1 and 4.1.2).
  let triggerClassName: string | undefined;
  let triggerId: string | undefined;
  const flattened: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && (child.type as unknown) === SelectTrigger) {
      const tp = child.props as {
        className?: string;
        id?: string;
        children?: React.ReactNode;
      };
      if (tp.className) triggerClassName = cn(triggerClassName, tp.className);
      if (tp.id) triggerId = tp.id;
      if (tp.children !== undefined) flattened.push(tp.children);
      return;
    }
    flattened.push(child);
  });

  return (
    <SelectContext.Provider
      value={{
        value: String(value || ""),
        onValueChange: onValueChange || (() => {}),
      }}
    >
      <select
        id={id ?? triggerId}
        value={value}
        onChange={handleChange}
        className={cn(BASE_SELECT_CLASSES, className, triggerClassName)}
        {...props}
      >
        {flattened}
      </select>
    </SelectContext.Provider>
  );
}

export function SelectTrigger(_props: React.HTMLAttributes<HTMLDivElement>) {
  // Renders nothing — its children are flattened into the parent <select> by
  // <Select> above. Kept as a named export so the existing JSX
  // (<SelectTrigger>…</SelectTrigger>) keeps compiling; props are forwarded via
  // the parent flattening logic so styling and id land on the <select>.
  return null;
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = React.useContext(SelectContext);
  // The native <select> ignores any non-<option>/<optgroup> children — only
  // the selected <option>'s text is visible in the trigger. Render as a
  // Fragment (text node) to avoid the React `validateDOMNesting` warning
  // that <span> cannot appear as a child of <select>. Callers that need to
  // display a placeholder should rely on an empty `value` (the native
  // control shows the placeholder option if one is provided) rather than on
  // this component's text.
  return <>{ctx?.value || placeholder || "Selecciona..."}</>;
}

export function SelectContent({ children }: React.HTMLAttributes<HTMLDivElement>) {
  // Fragment so the <option> children become direct children of the
  // underlying <select> (HTMLSelectElement.options only collects option /
  // optgroup direct children — see ZAL-494).
  return <>{children}</>;
}

export function SelectItem({
  value,
  children,
  ...props
}: React.HTMLAttributes<HTMLOptionElement> & { value: string }) {
  // No `selected` attribute: the controlled <select value=...> marks the
  // matching option automatically; setting `selected` on <option> in React 18+
  // warns ("Use the `defaultValue` or `value` props on <select> instead").
  return (
    <option value={value} {...props}>
      {children}
    </option>
  );
}
