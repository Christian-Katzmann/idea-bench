"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * GitSlip-style tabs.
 *
 * Default variant: underline-on-active (matches Settings tabs, project
 * detail tabs, and most inline navigation in GitSlip).
 * Pill variant:    filled-on-active, retained for narrow toolbars where
 * the underline reads as page chrome.
 */

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-4 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex items-center text-muted-foreground",
  {
    variants: {
      variant: {
        default:
          "w-full justify-start gap-6 border-b border-border group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch group-data-vertical/tabs:border-r group-data-vertical/tabs:border-b-0",
        pill:
          "h-9 w-fit justify-center rounded-lg bg-muted p-1 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors outline-none",
        "hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0 focus-visible:rounded-sm",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        /* Default (underline) variant */
        "group-data-[variant=default]/tabs-list:h-10 group-data-[variant=default]/tabs-list:px-0 group-data-[variant=default]/tabs-list:border-b-2 group-data-[variant=default]/tabs-list:border-transparent group-data-[variant=default]/tabs-list:-mb-px",
        "group-data-[variant=default]/tabs-list:data-active:border-foreground group-data-[variant=default]/tabs-list:data-active:text-foreground",
        /* Pill variant */
        "group-data-[variant=pill]/tabs-list:h-7 group-data-[variant=pill]/tabs-list:rounded-md group-data-[variant=pill]/tabs-list:px-3",
        "group-data-[variant=pill]/tabs-list:data-active:bg-card group-data-[variant=pill]/tabs-list:data-active:text-foreground group-data-[variant=pill]/tabs-list:data-active:shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
