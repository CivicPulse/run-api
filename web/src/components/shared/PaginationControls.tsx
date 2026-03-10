import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationControlsProps {
  hasNextPage: boolean
  hasPreviousPage: boolean
  onNextPage: () => void
  onPreviousPage: () => void
  isLoading?: boolean
}

export function PaginationControls({
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  isLoading = false,
}: PaginationControlsProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onPreviousPage}
        disabled={!hasPreviousPage || isLoading}
      >
        <ChevronLeft className="mr-1 size-4" />
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onNextPage}
        disabled={!hasNextPage || isLoading}
      >
        Next
        <ChevronRight className="ml-1 size-4" />
      </Button>
    </div>
  )
}
