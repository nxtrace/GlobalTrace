import * as React from "react";
import { cn } from "@/frontend/lib/utils";

const inputClassName =
  "flex h-10 w-full rounded-xl border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-[var(--shadow-inset)] outline-none backdrop-blur-xl transition-[background,border-color,box-shadow] placeholder:font-normal placeholder:italic placeholder:text-[color:var(--ink-muted)] hover:border-[color:var(--input-border-hover)] hover:bg-[color:var(--input-bg-hover)] focus-visible:border-[color:var(--focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-soft)] disabled:cursor-not-allowed disabled:opacity-55";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputClassName, className)} {...props} />,
);
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(inputClassName, "min-h-24 resize-y leading-6", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <span className="native-select-control">
      <select
        ref={ref}
        className={cn(inputClassName, "native-select cursor-pointer appearance-none pr-9", className)}
        {...props}
      />
    </span>
  ),
);
NativeSelect.displayName = "NativeSelect";

export { Input, NativeSelect, Textarea, inputClassName };
