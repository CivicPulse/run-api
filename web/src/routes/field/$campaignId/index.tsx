import { createFileRoute } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { useFieldMe } from "@/hooks/useFieldMe"
import { useAuthStore } from "@/stores/authStore"
import { useTourStore, tourKey } from "@/stores/tourStore"
import { useTour } from "@/hooks/useTour"
import { welcomeSteps } from "@/components/field/tour/tourSteps"
import { AssignmentCard } from "@/components/field/AssignmentCard"
import { AssignmentCardSkeleton } from "@/components/field/AssignmentCardSkeleton"
import { FieldEmptyState } from "@/components/field/FieldEmptyState"
import { Button } from "@/components/ui/button"

type PullState = "idle" | "pulling" | "refreshing"

function FieldHub() {
  const { campaignId } = Route.useParams()
  const { data, isLoading, isError, refetch } = useFieldMe(campaignId)
  const queryClient = useQueryClient()

  // Tour auto-trigger
  const user = useAuthStore((state) => state.user)
  const userId = user?.profile?.sub
  const key = userId ? tourKey(campaignId, userId) : ""
  const { startSegment } = useTour(key)

  useEffect(() => {
    if (!key || !data || isLoading) return
    const { isSegmentComplete } = useTourStore.getState()
    if (isSegmentComplete(key, "welcome")) return
    const timer = setTimeout(() => {
      startSegment("welcome", welcomeSteps)
    }, 200)
    return () => clearTimeout(timer)
  }, [key, data, isLoading, startSegment])

  // Pull-to-refresh state
  const [pullState, setPullState] = useState<PullState>("idle")
  const touchStartY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (pullState === "refreshing") return
    touchStartY.current = e.touches[0].clientY
  }, [pullState])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullState === "refreshing") return
    const container = containerRef.current
    if (!container || container.scrollTop !== 0) return

    const deltaY = e.touches[0].clientY - touchStartY.current
    if (deltaY > 60) {
      setPullState("pulling")
    } else {
      setPullState("idle")
    }
  }, [pullState])

  const handleTouchEnd = useCallback(() => {
    if (pullState !== "pulling") return
    setPullState("refreshing")
    queryClient
      .invalidateQueries({ queryKey: ["field-me", campaignId] })
      .finally(() => {
        setPullState("idle")
      })
  }, [pullState, queryClient, campaignId])

  const firstName = data?.volunteer_name?.split(" ")[0] ?? ""
  const hasCanvassing = data?.canvassing != null
  const hasPhoneBanking = data?.phone_banking != null
  const hasAssignments = hasCanvassing || hasPhoneBanking

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col pt-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullState === "pulling" || pullState === "refreshing") && (
        <div className="flex justify-center pb-3">
          <RefreshCw
            className={`h-5 w-5 text-muted-foreground ${
              pullState === "refreshing" ? "animate-spin" : ""
            }`}
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          <div className="h-8" />
          <AssignmentCardSkeleton />
          <AssignmentCardSkeleton />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Couldn't load your assignments. Check your connection and try again.
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Success state */}
      {data && (
        <>
          <h1 data-tour="hub-greeting" className="mb-4 text-2xl font-bold">Hey {firstName}!</h1>

          {hasAssignments ? (
            <div className="flex flex-col gap-4">
              {data.canvassing && (
                <AssignmentCard
                  type="canvassing"
                  id={data.canvassing.walk_list_id}
                  name={data.canvassing.name}
                  total={data.canvassing.total}
                  completed={data.canvassing.completed}
                  campaignId={campaignId}
                />
              )}
              {data.phone_banking && (
                <AssignmentCard
                  type="phone-banking"
                  id={data.phone_banking.session_id}
                  name={data.phone_banking.name}
                  total={data.phone_banking.total}
                  completed={data.phone_banking.completed}
                  campaignId={campaignId}
                />
              )}
            </div>
          ) : (
            <FieldEmptyState />
          )}
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute("/field/$campaignId/")({
  component: FieldHub,
})
