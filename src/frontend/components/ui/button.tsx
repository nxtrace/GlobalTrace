import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/frontend/lib/utils";

const buttonVariants = cva(
  "inline-flex min-w-0 items-center justify-center gap-2 rounded-full text-sm font-medium leading-tight transition-[background,border-color,box-shadow,transform,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border border-[color:var(--accent-border)] bg-[color:var(--accent)] text-white shadow-[var(--shadow-control)] hover:bg-[color:var(--accent-hover)] active:translate-y-px",
        secondary:
          "border border-[color:var(--glass-border)] bg-[color:var(--control-bg)] text-[color:var(--foreground)] shadow-[var(--shadow-control)] hover:bg-[color:var(--control-bg-hover)] active:translate-y-px",
        glass:
          "border border-[color:var(--glass-border)] bg-[color:var(--glass-control)] text-[color:var(--foreground)] shadow-[var(--shadow-control)] backdrop-blur-xl hover:border-[color:var(--accent-border)] hover:bg-[color:var(--glass-control-hover)] active:translate-y-px",
        ghost:
          "text-[color:var(--muted-foreground)] hover:bg-[color:var(--control-bg)] hover:text-[color:var(--foreground)] hover:shadow-[var(--shadow-inset)]",
        danger:
          "border border-[color:var(--danger-border)] bg-[color:var(--danger-bg)] text-[color:var(--danger)] hover:bg-[color:var(--danger-bg-hover)]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-5",
        icon: "h-9 w-9 p-0",
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
