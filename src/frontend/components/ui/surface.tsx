import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/frontend/lib/utils";

type SurfaceVariant = "glass" | "solid" | "flat";

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  asChild?: boolean;
}

function Surface({ className, variant = "glass", asChild = false, ...props }: SurfaceProps) {
  const Comp = asChild ? Slot : "div";
  return <Comp className={cn(surfaceClassName(variant), className)} {...props} />;
}

function surfaceClassName(variant: SurfaceVariant) {
  if (variant === "solid") {
    return "rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel-solid)] shadow-[var(--shadow-panel)] backdrop-blur-2xl";
  }
  if (variant === "flat") {
    return "rounded-2xl border border-[color:var(--glass-border)] bg-[color:var(--panel-flat)] shadow-[var(--shadow-inset)] backdrop-blur-xl";
  }
  return "rounded-2xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] shadow-[var(--shadow-panel)] backdrop-blur-2xl supports-[backdrop-filter]:bg-[color:var(--glass-bg)]";
}

export { Surface };
