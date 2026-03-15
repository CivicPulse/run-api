import { Skeleton } from "@/components/ui/skeleton"

export function AssignmentCardSkeleton() {
  return (
    <div className="min-h-[100px] rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>

        <Skeleton className="h-4 w-24" />

        <Skeleton className="h-2 w-full rounded-full" />

        <div className="flex justify-end">
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  )
}
