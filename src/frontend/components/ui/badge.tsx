import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/frontend/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-6 max-w-full min-w-0 items-center gap-1 rounded-[var(--radius-pill)] border px-2.5 py-0.5 text-xs font-medium leading-4 shadow-[var(--shadow-inset)]",
  {
    variants: {
      variant: {
        default:
          "border-[color:var(--line)] bg-[color:var(--canvas-soft)] text-[color:var(--foreground)]",
        accent: "border-[color:var(--line-strong)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]",
        muted:
          "border-[color:var(--muted-border)] bg-[color:var(--muted-bg)] text-[color:var(--muted-foreground)]",
        warn: "border-[color:var(--warn-border)] bg-[color:var(--warn-bg)] text-[color:var(--warn)]",
        danger: "border-[color:var(--danger-border)] bg-[color:var(--danger-bg)] text-[color:var(--danger)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
