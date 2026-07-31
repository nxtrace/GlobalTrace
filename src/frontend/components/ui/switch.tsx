import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/frontend/lib/utils";

type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
  size?: "default" | "sm";
};

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, size = "default", ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border border-[color:var(--line-strong)] bg-[color:color-mix(in_srgb,var(--ink)_18%,var(--canvas))] p-0.5 transition-[background-color,border-color,box-shadow] hover:border-[color:var(--ink-muted)] hover:bg-[color:color-mix(in_srgb,var(--ink)_26%,var(--canvas))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[color:var(--accent)] data-[state=checked]:bg-[color:var(--accent)] data-[state=checked]:hover:border-[color:var(--accent-hover)] data-[state=checked]:hover:bg-[color:var(--accent-hover)]",
      size === "sm" ? "h-[18px] w-8" : "h-6 w-11",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block rounded-full bg-[color:var(--on-accent)] shadow-[0_1px_2px_rgba(0,0,0,0.22),0_0_0_1px_rgba(0,0,0,0.08)] transition-transform data-[state=unchecked]:translate-x-0",
        size === "sm"
          ? "size-3.5 data-[state=checked]:translate-x-3.5"
          : "size-5 data-[state=checked]:translate-x-5",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
