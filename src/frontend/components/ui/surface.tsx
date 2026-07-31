import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/frontend/lib/utils";

type SurfaceVariant = "panel" | "solid" | "flat";

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  asChild?: boolean;
}

function Surface({ className, variant = "panel", asChild = false, ...props }: SurfaceProps) {
  const Comp = asChild ? Slot : "div";
  return <Comp className={cn(surfaceClassName(variant), className)} {...props} />;
}

function surfaceClassName(variant: SurfaceVariant) {
  if (variant === "solid") {
    return "rounded-[var(--radius-panel)] border border-[color:var(--panel-border)] bg-[color:var(--panel-solid)] shadow-[var(--shadow-hover)]";
  }
  if (variant === "flat") {
    return "rounded-[var(--radius-panel)] border border-[color:var(--line)] bg-[color:var(--panel-flat)] shadow-[var(--shadow-inset)]";
  }
  return "rounded-[var(--radius-panel)] border border-[color:var(--line)] bg-[color:var(--canvas)] shadow-[var(--shadow-soft)]";
}

export { Surface };
