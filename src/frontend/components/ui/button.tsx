import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/frontend/lib/utils";

const buttonVariants = cva(
  "inline-flex min-w-0 items-center justify-center gap-2 rounded-[var(--radius-control)] text-sm font-medium leading-5 tracking-[-0.28px] transition-[background,border-color,box-shadow,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--on-accent)] hover:border-[color:var(--accent-hover)] hover:bg-[color:var(--accent-hover)]",
        secondary:
          "border border-[color:var(--control-border)] bg-[color:var(--control-bg)] text-[color:var(--foreground)] hover:border-[color:var(--line-strong)] hover:bg-[color:var(--canvas-soft)]",
        ghost:
          "text-[color:var(--muted-foreground)] hover:bg-[color:var(--canvas-soft-2)] hover:text-[color:var(--foreground)]",
        danger:
          "border border-[color:var(--danger)] bg-[color:var(--danger)] text-white hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-5",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
