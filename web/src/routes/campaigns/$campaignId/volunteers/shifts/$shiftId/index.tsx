import { useState, useMemo } from "react"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import { HTTPError } from "ky"
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  UserPlus,
  Users,
} from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RequireRole } from "@/components/shared/RequireRole"
import { EmptyState } from "@/components/shared/EmptyState"
import { DataTable } from "@/components/shared/DataTable"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { ShiftDialog } from "@/components/shifts/ShiftDialog"
import { AssignVolunteerDialog } from "@/components/shifts/AssignVolunteerDialog"
import { AdjustHoursDialog } from "@/components/shifts/AdjustHoursDialog"
import {
  useShiftDetail,
  useShiftVolunteers,
  useUpdateShiftStatus,
  useCheckInVolunteer,
  useCheckOutVolunteer,
  useRemoveVolunteer,
  useSelfSignup,
  useCancelSignup,
} from "@/hooks/useShifts"
import { useVolunteerList } from "@/hooks/useVolunteers"
import {
  shiftStatusVariant,
  shiftTypeLabel,
  signupStatusVariant,
  VALID_TRANSITIONS,
} from "@/types/shift"
import type { ShiftSignupResponse } from "@/types/shift"

// --- Helpers ---

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function computeHours(
  checkIn: string | null,
  checkOut: string | null,
): number | null {
  if (!checkIn || !checkOut) return null
  return (
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 3_600_000
  )
}

// --- Row Actions (per-row hooks pattern) ---

interface RowActionsProps {
  signup: ShiftSignupResponse
  campaignId: string
  shiftId: string
  shiftStatus: string
  volunteerName: string
  volunteersById: Record<string, { first_name: string; last_name: string }>
}

function RowActions({
  signup,
  campaignId,
  shiftId,
  shiftStatus,
  volunteerName,
}: RowActionsProps) {
  const checkInMutation = useCheckInVolunteer(campaignId, shiftId)
  const checkOutMutation = useCheckOutVolunteer(campaignId, shiftId)
  const removeMutation = useRemoveVolunteer(campaignId, shiftId)

  const [removeOpen, setRemoveOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)

  const handleCheckIn = async () => {
    try {
      await checkInMutation.mutateAsync(signup.volunteer_id)
      toast.success("Volunteer checked in")
    } catch {
      toast.error("Failed to check in volunteer")
    }
  }

  const handleCheckOut = async () => {
    try {
      await checkOutMutation.mutateAsync(signup.volunteer_id)
      toast.success("Volunteer checked out")
    } catch {
      toast.error("Failed to check out volunteer")
    }
  }

  const handleRemove = async () => {
    try {
      await removeMutation.mutateAsync(signup.volunteer_id)
      toast.success("Volunteer removed")
      setRemoveOpen(false)
    } catch {
      toast.error("Failed to remove volunteer")
    }
  }

  const hours = computeHours(signup.check_in_at, signup.check_out_at)

  return (
    <div className="flex items-center gap-2">
      {/* Inline check-in/out buttons (manager+, active shifts only) */}
      <RequireRole minimum="manager">
        {shiftStatus === "active" && signup.status === "signed_up" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCheckIn}
            disabled={checkInMutation.isPending}
          >
            {checkInMutation.isPending ? "..." : "Check In"}
          </Button>
        )}
        {shiftStatus === "active" && signup.status === "checked_in" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCheckOut}
            disabled={checkOutMutation.isPending}
          >
            {checkOutMutation.isPending ? "..." : "Check Out"}
          </Button>
        )}
      </RequireRole>

      {/* Kebab menu (manager+) */}
      <RequireRole minimum="manager">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRemoveOpen(true)}>
              Remove Volunteer
            </DropdownMenuItem>
            {signup.status === "checked_out" && (
              <DropdownMenuItem onClick={() => setAdjustOpen(true)}>
                Adjust Hours
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </RequireRole>

      {/* Remove confirmation dialog */}
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove Volunteer"
        description={`Are you sure you want to remove ${volunteerName} from this shift?`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
        isPending={removeMutation.isPending}
      />

      {/* Adjust hours dialog */}
      {adjustOpen && (
        <AdjustHoursDialog
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
          campaignId={campaignId}
          shiftId={shiftId}
          volunteerId={signup.volunteer_id}
          volunteerName={volunteerName}
          computedHours={hours}
        />
      )}
    </div>
  )
}

// --- Main Page Component ---

function ShiftDetailPage() {
  const { campaignId, shiftId } = useParams({
    from: "/campaigns/$campaignId/volunteers/shifts/$shiftId/",
  })

  // Data queries
  const { data: shift, isLoading: shiftLoading } = useShiftDetail(
    campaignId,
    shiftId,
  )
  const { data: volunteersData, isLoading: volunteersLoading } =
    useShiftVolunteers(campaignId, shiftId)
  const { data: allVolunteers } = useVolunteerList(campaignId)

  // Mutations
  const updateStatusMutation = useUpdateShiftStatus(campaignId, shiftId)
  const selfSignupMutation = useSelfSignup(campaignId, shiftId)
  const cancelSignupMutation = useCancelSignup(campaignId, shiftId)

  // UI state
  const [editOpen, setEditOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null)
  const [cancelSignupOpen, setCancelSignupOpen] = useState(false)

  // Volunteer name resolution (CRITICAL -- see RESEARCH.md Pitfall 1)
  const volunteersById = useMemo(() => {
    const map: Record<string, { first_name: string; last_name: string }> = {}
    for (const v of allVolunteers?.items ?? []) {
      map[v.id] = { first_name: v.first_name, last_name: v.last_name }
    }
    return map
  }, [allVolunteers])

  const signups = volunteersData?.items ?? []
  const existingVolunteerIds = useMemo(
    () => signups.map((s) => s.volunteer_id),
    [signups],
  )

  // Status transition handlers
  const handleStatusTransition = async (newStatus: string) => {
    try {
      await updateStatusMutation.mutateAsync({ status: newStatus })
      toast.success("Shift status updated")
      setConfirmStatus(null)
    } catch {
      toast.error("Failed to update shift status")
    }
  }

  // Self signup handler
  const handleSelfSignup = async () => {
    try {
      await selfSignupMutation.mutateAsync()
      toast.success("Signed up for shift")
    } catch (err) {
      if (err instanceof HTTPError) {
        if (err.response.status === 422) {
          toast.error("You are already signed up for this shift")
        } else if (err.response.status === 404) {
          toast.error("You need to register as a volunteer first")
        } else {
          toast.error("Failed to sign up")
        }
      } else {
        toast.error("Failed to sign up")
      }
    }
  }

  // Cancel signup handler
  const handleCancelSignup = async () => {
    try {
      await cancelSignupMutation.mutateAsync()
      toast.success("Signup cancelled")
      setCancelSignupOpen(false)
    } catch {
      toast.error("Failed to cancel signup")
    }
  }

  // Helper: resolve volunteer name
  const resolveName = (volunteerId: string) => {
    const v = volunteersById[volunteerId]
    return v ? `${v.first_name} ${v.last_name}` : volunteerId.slice(0, 8)
  }

  // --- Roster columns ---
  const columns: ColumnDef<ShiftSignupResponse, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "volunteer_id",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">
            {resolveName(row.original.volunteer_id)}
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            status={
              row.original.status.charAt(0).toUpperCase() +
              row.original.status.slice(1).replace("_", " ")
            }
            variant={signupStatusVariant(row.original.status)}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "check_in_at",
        header: "Check In",
        cell: ({ row }) =>
          row.original.check_in_at
            ? formatDateTime(row.original.check_in_at)
            : "--",
        enableSorting: false,
      },
      {
        accessorKey: "check_out_at",
        header: "Check Out",
        cell: ({ row }) =>
          row.original.check_out_at
            ? formatDateTime(row.original.check_out_at)
            : "--",
        enableSorting: false,
      },
      {
        id: "hours",
        header: "Hours",
        cell: ({ row }) => {
          const s = row.original
          // adjusted_hours is only on CheckInResponse, not ShiftSignupResponse
          // Compute from check_in_at and check_out_at
          const hours = computeHours(s.check_in_at, s.check_out_at)
          return hours != null ? hours.toFixed(1) : "--"
        },
        enableSorting: false,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          if (!shift) return null
          return (
            <RowActions
              signup={row.original}
              campaignId={campaignId}
              shiftId={shiftId}
              shiftStatus={shift.status}
              volunteerName={resolveName(row.original.volunteer_id)}
              volunteersById={volunteersById}
            />
          )
        },
        enableSorting: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volunteersById, shift, campaignId, shiftId],
  )

  // --- Loading state ---
  if (shiftLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-32" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    )
  }

  if (!shift) {
    return (
      <EmptyState
        title="Shift not found"
        description="The shift you're looking for doesn't exist or has been removed."
      />
    )
  }

  // Determine valid transitions
  const transitions = VALID_TRANSITIONS[shift.status] ?? []

  // Build location text
  const locationParts = [
    shift.location_name,
    shift.street,
    [shift.city, shift.state, shift.zip_code].filter(Boolean).join(", "),
  ].filter(Boolean)
  const locationText = locationParts.join(" - ")

  // Confirmation dialog content per transition
  const transitionConfig: Record<
    string,
    { label: string; variant: "default" | "destructive"; title: string; description: string }
  > = {
    active: {
      label: "Activate",
      variant: "default",
      title: "Activate Shift",
      description: "Are you sure you want to activate this shift?",
    },
    cancelled: {
      label: "Cancel Shift",
      variant: "destructive",
      title: "Cancel Shift",
      description:
        "Are you sure you want to cancel this shift? All signups will be affected.",
    },
    completed: {
      label: "Mark Complete",
      variant: "default",
      title: "Complete Shift",
      description: "Mark this shift as complete?",
    },
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        to="/campaigns/$campaignId/volunteers/shifts"
        params={{ campaignId }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Shifts
      </Link>

      {/* Header: Shift name + status badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            {shift.name}
          </h2>
          <StatusBadge
            status={
              shift.status.charAt(0).toUpperCase() + shift.status.slice(1)
            }
            variant={shiftStatusVariant(shift.status)}
          />
        </div>
        {/* Edit button (manager+, scheduled only) */}
        {shift.status === "scheduled" && (
          <RequireRole minimum="manager">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-4 mr-1" />
              Edit
            </Button>
          </RequireRole>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="space-y-6">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <StatusBadge
                  status={shiftTypeLabel(shift.type)}
                  variant="default"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="text-sm font-medium">
                  {formatDate(shift.start_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Time</p>
                <p className="text-sm font-medium">
                  {formatTime(shift.start_at)} - {formatTime(shift.end_at)}
                </p>
              </div>
              {locationText && (
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="text-sm font-medium">{locationText}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Capacity</p>
                <p className="text-sm font-medium">
                  {shift.signed_up_count}/{shift.max_volunteers} signed up
                  {shift.waitlist_count > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({shift.waitlist_count} waitlisted)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Description */}
            {shift.description && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Description
                </p>
                <p className="text-sm">{shift.description}</p>
              </div>
            )}

            {/* Status transition buttons (manager+) */}
            {transitions.length > 0 && (
              <RequireRole minimum="manager">
                <div className="flex items-center gap-2">
                  {transitions.map((target) => {
                    const config = transitionConfig[target]
                    if (!config) return null
                    // Activate is primary action -- no confirmation needed
                    if (target === "active") {
                      return (
                        <Button
                          key={target}
                          size="sm"
                          onClick={() => handleStatusTransition(target)}
                          disabled={updateStatusMutation.isPending}
                        >
                          {updateStatusMutation.isPending
                            ? "..."
                            : config.label}
                        </Button>
                      )
                    }
                    // Cancel/Complete require confirmation
                    return (
                      <Button
                        key={target}
                        size="sm"
                        variant={
                          config.variant === "destructive"
                            ? "destructive"
                            : "outline"
                        }
                        onClick={() => setConfirmStatus(target)}
                        disabled={updateStatusMutation.isPending}
                      >
                        {config.label}
                      </Button>
                    )
                  })}
                </div>
              </RequireRole>
            )}

            {/* Self-signup / cancel section */}
            {shift.status === "scheduled" && (
              <div className="flex items-center gap-2 border-t pt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelfSignup}
                  disabled={selfSignupMutation.isPending}
                >
                  <UserPlus className="size-4 mr-1" />
                  {selfSignupMutation.isPending ? "Signing up..." : "Sign Up"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCancelSignupOpen(true)}
                  disabled={cancelSignupMutation.isPending}
                >
                  Cancel Signup
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Roster Tab */}
        <TabsContent value="roster" className="mt-4">
          <div className="space-y-4">
            {/* Assign Volunteer button (manager+) */}
            <RequireRole minimum="manager">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setAssignOpen(true)}>
                  <UserPlus className="size-4 mr-1" />
                  Assign Volunteer
                </Button>
              </div>
            </RequireRole>

            <DataTable
              columns={columns}
              data={signups}
              isLoading={volunteersLoading}
              emptyIcon={Users}
              emptyTitle="No volunteers signed up"
              emptyDescription="No volunteers have signed up for this shift yet."
              emptyAction={
                <RequireRole minimum="manager">
                  <Button size="sm" onClick={() => setAssignOpen(true)}>
                    <UserPlus className="size-4 mr-1" />
                    Assign Volunteer
                  </Button>
                </RequireRole>
              }
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Status transition confirmation dialog */}
      {confirmStatus && transitionConfig[confirmStatus] && (
        <ConfirmDialog
          open={!!confirmStatus}
          onOpenChange={(open) => {
            if (!open) setConfirmStatus(null)
          }}
          title={transitionConfig[confirmStatus].title}
          description={transitionConfig[confirmStatus].description}
          confirmLabel={transitionConfig[confirmStatus].label}
          variant={transitionConfig[confirmStatus].variant}
          onConfirm={() => handleStatusTransition(confirmStatus)}
          isPending={updateStatusMutation.isPending}
        />
      )}

      {/* Cancel signup confirmation */}
      <ConfirmDialog
        open={cancelSignupOpen}
        onOpenChange={setCancelSignupOpen}
        title="Cancel Signup"
        description={`Cancel your signup for ${shift?.name ?? "this shift"}?`}
        confirmLabel="Cancel Signup"
        variant="destructive"
        onConfirm={handleCancelSignup}
        isPending={cancelSignupMutation.isPending}
      />

      {/* Edit Shift dialog */}
      {editOpen && shift && (
        <ShiftDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          editShift={shift}
          campaignId={campaignId}
        />
      )}

      {/* Assign Volunteer dialog */}
      {assignOpen && (
        <AssignVolunteerDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          campaignId={campaignId}
          shiftId={shiftId}
          shiftType={shift.type}
          existingVolunteerIds={existingVolunteerIds}
        />
      )}
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/volunteers/shifts/$shiftId/",
)({
  component: ShiftDetailPage,
})
