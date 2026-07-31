import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/frontend/lib/utils";

const Tabs = TabsPrimitive.Root;

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  unstyled?: boolean;
};

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, unstyled = false, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={
      unstyled
        ? className
        : cn(
            "flex w-full gap-1 overflow-x-auto rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--canvas-soft-2)] p-1 shadow-[var(--shadow-inset)]",
            className,
          )
    }
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

type TabsTriggerProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  unstyled?: boolean;
};

const triggerClassName =
  "min-w-40 flex-1 rounded-[var(--radius-control)] border border-transparent px-3 py-2 text-left text-sm leading-5 text-[color:var(--muted-foreground)] transition-[background,border-color,box-shadow,color] hover:bg-[color:var(--canvas)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] data-[state=active]:border-[color:var(--line)] data-[state=active]:bg-[color:var(--canvas)] data-[state=active]:text-[color:var(--foreground)] data-[state=active]:shadow-[var(--shadow-soft)]";

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
