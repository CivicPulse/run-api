import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusVariant = "default" | "success" | "warning" | "error" | "info"

const variantStyles: Record<StatusVariant, string> = {
  default: "",
  success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  warning:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
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
