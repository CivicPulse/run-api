import { useState, useMemo } from "react"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RequireRole } from "@/components/shared/RequireRole"
import { EmptyState } from "@/components/shared/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { useShiftList } from "@/hooks/useShifts"
import { ShiftDialog } from "@/components/shifts/ShiftDialog"
import { ShiftCard } from "@/components/shifts/ShiftCard"
import { SHIFT_TYPES, SHIFT_STATUSES, shiftTypeLabel } from "@/types/shift"
import type { Shift } from "@/types/field-ops"

export const Route = createFileRoute(
  "/campaigns/$campaignId/volunteers/shifts/",
)({
  component: ShiftListPage,
})

const ALL_VALUE = "__all__"

interface DateGroup {
  label: string
  shifts: Shift[]
}

function groupShiftsByDate(shifts: Shift[]): DateGroup[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000)
  // End of week: next Sunday at midnight
  const dayOfWeek = todayStart.getDay() // 0 = Sunday
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek
  const weekEnd = new Date(
    todayStart.getTime() + daysUntilSunday * 86_400_000,
  )

  const groups: Record<string, Shift[]> = {
    Today: [],
    "This Week": [],
    Upcoming: [],
    Past: [],
  }

  for (const shift of shifts) {
    const startAt = new Date(shift.start_at)
    if (startAt < todayStart) {
      groups.Past.push(shift)
    } else if (startAt < tomorrowStart) {
      groups.Today.push(shift)
    } else if (startAt < weekEnd) {
      groups["This Week"].push(shift)
    } else {
      groups.Upcoming.push(shift)
    }
  }

  // Sort within each group by start_at ascending
  for (const key of Object.keys(groups)) {
    groups[key].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    )
  }

  // Return non-empty groups in display order
  const order = ["Today", "This Week", "Upcoming", "Past"]
  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, shifts: groups[label] }))
}

function ShiftListPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/volunteers/shifts/",
  })

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>(ALL_VALUE)
  const [typeFilter, setTypeFilter] = useState<string>(ALL_VALUE)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editShift, setEditShift] = useState<Shift | undefined>(undefined)

  const filters = useMemo(
    () => ({
      status: statusFilter === ALL_VALUE ? undefined : statusFilter,
      type: typeFilter === ALL_VALUE ? undefined : typeFilter,
    }),
    [statusFilter, typeFilter],
  )

  const { data, isLoading } = useShiftList(campaignId, filters)
  const shifts = data?.items ?? []

  const dateGroups = useMemo(() => groupShiftsByDate(shifts), [shifts])

  const handleOpenCreate = () => {
    setEditShift(undefined)
    setDialogOpen(true)
  }

  const handleEdit = (shift: Shift) => {
    setEditShift(shift)
    setDialogOpen(true)
  }

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setEditShift(undefined)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Shifts</h2>
        <RequireRole minimum="manager">
          <Button size="sm" onClick={handleOpenCreate}>
            + Create Shift
          </Button>
        </RequireRole>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 justify-end">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Statuses</SelectItem>
            {SHIFT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Types</SelectItem>
            {SHIFT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {shiftTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
      ) : shifts.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No shifts yet"
          description="Create your first shift to start scheduling volunteers"
          action={
            <RequireRole minimum="manager">
              <Button size="sm" onClick={handleOpenCreate}>
                + Create Shift
              </Button>
            </RequireRole>
          }
        />
      ) : (
        <div className="space-y-6">
          {dateGroups.map((group) => (
            <div key={group.label} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.shifts.map((shift) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    campaignId={campaignId}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      {dialogOpen && (
        <ShiftDialog
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          editShift={editShift}
          campaignId={campaignId}
        />
      )}
    </div>
  )
}
