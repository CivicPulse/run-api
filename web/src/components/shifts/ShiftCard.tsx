import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { MoreHorizontal, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { HTTPError } from "ky"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RequireRole } from "@/components/shared/RequireRole"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog"
import {
  useDeleteShift,
  useUpdateShiftStatus,
  useSelfSignup,
} from "@/hooks/useShifts"
import {
  shiftStatusVariant,
  shiftTypeLabel,
  VALID_TRANSITIONS,
} from "@/types/shift"
import type { Shift } from "@/types/field-ops"

interface ShiftCardProps {
  shift: Shift
  campaignId: string
  onEdit: (shift: Shift) => void
}

function formatTimeRange(startAt: string, endAt: string): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }
  return `${start.toLocaleTimeString(undefined, opts)} - ${end.toLocaleTimeString(undefined, opts)}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const STATUS_LABELS: Record<string, string> = {
  active: "Activate",
  cancelled: "Cancel Shift",
  completed: "Mark Complete",
}

export function ShiftCard({ shift, campaignId, onEdit }: ShiftCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [statusConfirm, setStatusConfirm] = useState<string | null>(null)

  const deleteMutation = useDeleteShift(campaignId)
  const statusMutation = useUpdateShiftStatus(campaignId, shift.id)
  const signupMutation = useSelfSignup(campaignId, shift.id)

  const validTransitions = VALID_TRANSITIONS[shift.status] ?? []

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(shift.id)
      toast.success("Shift deleted")
      setDeleteOpen(false)
    } catch {
      toast.error("Failed to delete shift")
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      await statusMutation.mutateAsync({ status: newStatus })
      toast.success(
        `Shift ${newStatus === "active" ? "activated" : newStatus === "completed" ? "marked complete" : "cancelled"}`,
      )
      setStatusConfirm(null)
    } catch {
      toast.error("Failed to update shift status")
    }
  }

  const handleSignup = async () => {
    try {
      await signupMutation.mutateAsync()
      toast.success(`Signed up for ${shift.name}`)
    } catch (err) {
      if (err instanceof HTTPError) {
        const status = err.response.status
        if (status === 422) {
          toast.error("Already signed up for this shift")
          return
        }
        if (status === 404) {
          toast.error("You need to register as a volunteer first", {
            description: "Go to the Register page to sign up as a volunteer.",
          })
          return
        }
      }
      toast.error("Failed to sign up for shift")
    }
  }

  return (
    <>
      <div className="rounded-lg border p-4 hover:bg-accent/50 transition-colors">
        {/* Top row: name + type badge | time + status */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/campaigns/$campaignId/volunteers/shifts/$shiftId"
              params={{ campaignId, shiftId: shift.id }}
              className="font-medium hover:underline truncate"
            >
              {shift.name}
            </Link>
            <StatusBadge
              status={shiftTypeLabel(shift.type)}
              variant="default"
              className="shrink-0"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-muted-foreground">
              {formatTimeRange(shift.start_at, shift.end_at)}
            </span>
            <StatusBadge
              status={shift.status}
              variant={shiftStatusVariant(shift.status)}
            />
            {/* Kebab menu for managers */}
            <RequireRole minimum="manager">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {shift.status === "scheduled" && (
                    <DropdownMenuItem onClick={() => onEdit(shift)}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {validTransitions.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      {validTransitions.map((ts) => (
                        <DropdownMenuItem
                          key={ts}
                          onClick={() => setStatusConfirm(ts)}
                          className={
                            ts === "cancelled"
                              ? "text-destructive focus:text-destructive"
                              : undefined
                          }
                        >
                          {STATUS_LABELS[ts] ?? ts}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {shift.status === "scheduled" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteOpen(true)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </RequireRole>
          </div>
        </div>

        {/* Bottom row: date, capacity, location, signup button */}
        <div className="mt-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{formatDate(shift.start_at)}</span>
            <span>Max: {shift.max_volunteers}</span>
            {shift.location_name && <span>{shift.location_name}</span>}
          </div>
          {shift.status === "scheduled" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignup}
              disabled={signupMutation.isPending}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              {signupMutation.isPending ? "Signing up..." : "Sign Up"}
            </Button>
          )}
        </div>
      </div>

      {/* Delete Confirmation */}
      <DestructiveConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Shift"
        description="This will permanently delete this shift and remove all volunteer signups. This action cannot be undone."
        confirmText={shift.name}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={deleteMutation.isPending}
      />

      {/* Status Transition Confirmation */}
      {statusConfirm && (
        <ConfirmDialog
          open={!!statusConfirm}
          onOpenChange={(open) => {
            if (!open) setStatusConfirm(null)
          }}
          title={`${STATUS_LABELS[statusConfirm] ?? statusConfirm}?`}
          description={`Are you sure you want to ${(STATUS_LABELS[statusConfirm] ?? statusConfirm).toLowerCase()} this shift?`}
          confirmLabel={STATUS_LABELS[statusConfirm] ?? statusConfirm}
          variant={statusConfirm === "cancelled" ? "destructive" : "default"}
          onConfirm={() => handleStatusChange(statusConfirm)}
          isPending={statusMutation.isPending}
        />
      )}
    </>
  )
}
