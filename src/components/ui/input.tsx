import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2 text-sm shadow-soft transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-zaltyko-text-main placeholder:text-zaltyko-text-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-primary-light focus-visible:ring-offset-2 focus-visible:border-zaltyko-primary disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
