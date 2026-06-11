import * as React from "react";
import { cn } from "@/frontend/lib/utils";

const inputClassName =
  "flex h-10 w-full rounded-xl border border-[color:var(--control-border)] bg-[color:var(--control-bg)] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-[var(--shadow-inset)] outline-none transition-[background,border-color,box-shadow] placeholder:text-[color:var(--muted-foreground)] hover:bg-[color:var(--control-bg-hover)] focus-visible:border-[color:var(--focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-soft)] disabled:cursor-not-allowed disabled:opacity-55";

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
    <select
      ref={ref}
      className={cn(inputClassName, "cursor-pointer appearance-none pr-8", className)}
      {...props}
    />
  ),
);
NativeSelect.displayName = "NativeSelect";

export { Input, NativeSelect, Textarea, inputClassName };
