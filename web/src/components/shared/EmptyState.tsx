import React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon | React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  // forwardRef components (e.g. lucide-react icons) have typeof === "object",
  // so check for both plain functions and non-element objects (component refs).
  const isComponent =
    typeof icon === "function" ||
    (typeof icon === "object" && icon !== null && !React.isValidElement(icon))

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-muted-foreground">
          {isComponent
            ? (() => { const Icon = icon as LucideIcon; return <Icon className="h-10 w-10 text-muted-foreground/50" /> })()
            : icon}
        </div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
