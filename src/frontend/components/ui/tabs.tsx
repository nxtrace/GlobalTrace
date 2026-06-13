import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/frontend/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex w-full gap-2 overflow-x-auto rounded-2xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] p-2 shadow-[var(--shadow-inset)] backdrop-blur-2xl",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

type TabsTriggerProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  unstyled?: boolean;
};

const triggerClassName =
  "min-w-40 flex-1 rounded-xl border border-transparent px-3 py-2 text-left text-sm text-[color:var(--muted-foreground)] transition-[background,border-color,box-shadow,color,transform] hover:-translate-y-px hover:bg-[color:var(--control-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] data-[state=active]:border-[color:var(--accent-border)] data-[state=active]:bg-[color:var(--panel-solid)] data-[state=active]:text-[color:var(--foreground)] data-[state=active]:shadow-[var(--shadow-control)]";

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, unstyled = false, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={unstyled ? className : cn(triggerClassName, className)}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
