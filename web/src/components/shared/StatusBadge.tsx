import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusVariant = "default" | "success" | "warning" | "error" | "info"

const variantStyles: Record<StatusVariant, string> = {
  default: "",
  success: "bg-[--status-success] text-[--status-success-foreground]",
  warning: "bg-[--status-warning] text-[--status-warning-foreground]",
  error: "bg-[--status-error] text-[--status-error-foreground]",
  info: "bg-[--status-info] text-[--status-info-foreground]",
}

interface StatusBadgeProps {
  status: string
  variant?: StatusVariant
  className?: string
}

export function StatusBadge({
  status,
  variant = "default",
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(variantStyles[variant], className)}
    >
      {status}
    </Badge>
  )
}
