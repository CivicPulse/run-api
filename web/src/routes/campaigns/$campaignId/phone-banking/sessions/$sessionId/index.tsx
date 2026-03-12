import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  usePhoneBankSession,
  useSessionCallers,
  useUpdateSessionStatus,
  useAssignCaller,
  useRemoveCaller,
  useCheckIn,
  useCheckOut,
  useSessionProgress,
  useReassignEntry,
} from "@/hooks/usePhoneBankSessions"
import { useMembers } from "@/hooks/useMembers"
import { STATUS_ACTIONS } from "@/types/phone-bank-session"
import { RequireRole } from "@/components/shared/RequireRole"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { ChevronsUpDown, Check, MoreHorizontal } from "lucide-react"
import type { PhoneBankSession, SessionCaller, SessionStatus } from "@/types/phone-bank-session"
import type { CampaignMember } from "@/types/campaign"

export const Route = createFileRoute(
  "/campaigns/$campaignId/phone-banking/sessions/$sessionId/",
)({ component: SessionDetailPage })

// --- Helpers ---

function statusVariant(
  status: SessionStatus,
): "default" | "success" | "warning" | "info" {
  switch (status) {
    case "active":
      return "success"
    case "paused":
      return "warning"
    case "completed":
      return "info"
    default:
      return "default"
  }
}

type StatusVariant = "default" | "success" | "warning" | "error" | "info"
const roleVariant: Record<string, StatusVariant> = {
  owner: "info",
  admin: "success",
  manager: "warning",
  volunteer: "default",
  viewer: "default",
}

function resolveCallerName(
  membersById: Map<string, CampaignMember>,
  userId: string,
): string {
  const member = membersById.get(userId)
  return member ? member.display_name : `${userId.slice(0, 12)}...`
}

function resolveCallerRole(
  membersById: Map<string, CampaignMember>,
  userId: string,
): string | null {
  return membersById.get(userId)?.role ?? null
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Not scheduled"
  return new Date(iso).toLocaleString()
}

// --- StatChip ---

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4 text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  )
}

// --- AddCallerDialog ---

function AddCallerDialog({
  open,
  onOpenChange,
  campaignId,
  sessionId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  sessionId: string
}) {
  const [userId, setUserId] = useState("")
  const assignMutation = useAssignCaller(campaignId, sessionId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId.trim()) return
    try {
      await assignMutation.mutateAsync(userId.trim())
      toast.success("Caller added")
      setUserId("")
      onOpenChange(false)
    } catch {
      toast.error("Failed to add caller")
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setUserId("")
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Caller</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-caller-user-id">User ID</Label>
            <Input
              id="add-caller-user-id"
              placeholder="ZITADEL user ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Enter the ZITADEL user ID of the campaign member to add.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={assignMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!userId.trim() || assignMutation.isPending}
            >
              {assignMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- ReassignInfoDialog ---

function ReassignInfoDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reassign Entries</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          To reassign an entry, use the call list entries table to find
          in-progress entries and reassign them. Entry-level reassignment from
          the progress dashboard will be available in a future update.
        </p>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- OverviewTab ---

function OverviewTab({
  session,
  callers,
  campaignId,
  sessionId,
  membersById,
  members,
}: {
  session: PhoneBankSession
  callers: SessionCaller[]
  campaignId: string
  sessionId: string
  membersById: Map<string, CampaignMember>
  members: CampaignMember[]
}) {
  const [addCallerOpen, setAddCallerOpen] = useState(false)
  const [checkedIn, setCheckedIn] = useState(false)

  const updateMutation = useUpdateSessionStatus(campaignId, sessionId)
  const removeMutation = useRemoveCaller(campaignId, sessionId)
  const checkInMutation = useCheckIn(campaignId, sessionId)
  const checkOutMutation = useCheckOut(campaignId, sessionId)

  const statusActions = STATUS_ACTIONS[session.status]

  const handleStatusTransition = async (newStatus: SessionStatus) => {
    try {
      await updateMutation.mutateAsync({ status: newStatus })
      toast.success(`Session ${newStatus}`)
    } catch {
      toast.error("Failed to update session status")
    }
  }

  const handleRemoveCaller = async (userId: string) => {
    try {
      await removeMutation.mutateAsync(userId)
      toast.success("Caller removed")
    } catch {
      toast.error("Failed to remove caller")
    }
  }

  const handleCheckIn = async () => {
    try {
      await checkInMutation.mutateAsync()
      setCheckedIn(true)
      toast.success("Checked in successfully")
    } catch {
      toast.error("Failed to check in")
    }
  }

  const handleCheckOut = async () => {
    try {
      await checkOutMutation.mutateAsync()
      setCheckedIn(false)
      toast.success("Checked out")
    } catch {
      toast.error("Failed to check out")
    }
  }

  return (
    <div className="space-y-8">
      {/* Section 1: Session metadata */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Session Details
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Name</span>
            <p className="font-medium mt-0.5">{session.name}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Status</span>
            <div className="mt-0.5">
              <StatusBadge
                status={session.status}
                variant={statusVariant(session.status)}
              />
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Call List</span>
            <p className="font-medium mt-0.5 font-mono text-xs">
              {session.call_list_id.slice(0, 12)}…
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Callers</span>
            <p className="font-medium mt-0.5">{session.caller_count}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Scheduled Start</span>
            <p className="font-medium mt-0.5">
              {formatDateTime(session.scheduled_start)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Scheduled End</span>
            <p className="font-medium mt-0.5">
              {formatDateTime(session.scheduled_end)}
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Status transition buttons (manager+) */}
      <RequireRole minimum="manager">
        {statusActions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Session Actions
            </h3>
            <div className="flex gap-2">
              {statusActions.map((action) => (
                <Button
                  key={action.status}
                  variant={action.variant ?? "default"}
                  onClick={() => handleStatusTransition(action.status)}
                  disabled={updateMutation.isPending}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </RequireRole>

      {/* Section 3: Caller management table (manager+) */}
      <RequireRole minimum="manager">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Callers
            </h3>
            <Button size="sm" onClick={() => setAddCallerOpen(true)}>
              + Add Caller
            </Button>
          </div>
          {callers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No callers assigned yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Caller</th>
                  <th className="text-left py-2 font-medium">Checked In</th>
                  <th className="text-left py-2 font-medium">Checked Out</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {callers.map((caller) => (
                  <tr key={caller.id} className="border-b hover:bg-muted/50">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span>
                          {resolveCallerName(membersById, caller.user_id)}
                        </span>
                        {resolveCallerRole(membersById, caller.user_id) && (
                          <StatusBadge
                            status={
                              resolveCallerRole(membersById, caller.user_id)!
                            }
                            variant={
                              roleVariant[
                                resolveCallerRole(membersById, caller.user_id)!
                              ] ?? "default"
                            }
                          />
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {caller.check_in_at
                        ? new Date(caller.check_in_at).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {caller.check_out_at
                        ? new Date(caller.check_out_at).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td className="py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleRemoveCaller(caller.user_id)}
                          >
                            Remove Caller
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </RequireRole>

      {/* Section 4: Caller actions — check in / check out / start calling (volunteer+) */}
      <RequireRole minimum="volunteer">
        {session.status === "active" && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Your Actions
            </h3>
            <div className="flex gap-2">
              {!checkedIn ? (
                <Button
                  onClick={handleCheckIn}
                  disabled={checkInMutation.isPending}
                >
                  {checkInMutation.isPending ? "Checking in..." : "Check In"}
                </Button>
              ) : (
                <>
                  <Link
                    to="/campaigns/$campaignId/phone-banking/sessions/$sessionId/call"
                    params={{ campaignId, sessionId }}
                  >
                    <Button>Start Calling</Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={handleCheckOut}
                    disabled={checkOutMutation.isPending}
                  >
                    {checkOutMutation.isPending ? "Checking out..." : "Check Out"}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </RequireRole>

      {/* AddCallerDialog */}
      {addCallerOpen && (
        <AddCallerDialog
          open={addCallerOpen}
          onOpenChange={setAddCallerOpen}
          campaignId={campaignId}
          sessionId={sessionId}
          members={members}
          assignedUserIds={new Set(callers.map((c) => c.user_id))}
        />
      )}
    </div>
  )
}

// --- ProgressTab ---

function ProgressTab({
  campaignId,
  sessionId,
  membersById,
}: {
  campaignId: string
  sessionId: string
  membersById: Map<string, CampaignMember>
}) {
  const { data: progress, isLoading } = useSessionProgress(campaignId, sessionId)
  // useReassignEntry imported for future use; v1 shows info dialog instead
  useReassignEntry(campaignId, sessionId)
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <RequireRole
      minimum="manager"
      fallback={
        <p className="text-muted-foreground">
          Manager access required to view session progress.
        </p>
      }
    >
      {progress ? (
        <div className="space-y-6">
          {/* Progress bar */}
          {(() => {
            const completionPct =
              progress.total_entries > 0
                ? Math.round((progress.completed / progress.total_entries) * 100)
                : 0
            return (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Progress</span>
                  <span>{completionPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>
            )
          })()}

          {/* Stat chips */}
          <div className="grid grid-cols-4 gap-4">
            <StatChip label="Total" value={progress.total_entries} />
            <StatChip label="Completed" value={progress.completed} />
            <StatChip label="In Progress" value={progress.in_progress} />
            <StatChip label="Available" value={progress.available} />
          </div>

          {/* Per-caller table */}
          <div>
            <h3 className="text-sm font-medium mb-3">Callers</h3>
            {progress.callers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No callers have checked in yet.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Caller</th>
                    <th className="text-left py-2 font-medium">Calls Made</th>
                    <th className="text-left py-2 font-medium">Checked In</th>
                    <th className="text-left py-2 font-medium">Checked Out</th>
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {progress.callers.map((caller) => (
                    <tr
                      key={caller.user_id}
                      className="border-b hover:bg-muted/50"
                    >
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span>
                            {resolveCallerName(membersById, caller.user_id)}
                          </span>
                          {resolveCallerRole(membersById, caller.user_id) && (
                            <StatusBadge
                              status={
                                resolveCallerRole(membersById, caller.user_id)!
                              }
                              variant={
                                roleVariant[
                                  resolveCallerRole(
                                    membersById,
                                    caller.user_id,
                                  )!
                                ] ?? "default"
                              }
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-2">{caller.calls_made}</td>
                      <td className="py-2 text-muted-foreground">
                        {caller.check_in_at
                          ? new Date(caller.check_in_at).toLocaleTimeString()
                          : "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {caller.check_out_at
                          ? new Date(caller.check_out_at).toLocaleTimeString()
                          : "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {caller.check_out_at
                          ? "Checked Out"
                          : caller.check_in_at
                            ? "Active"
                            : "Not checked in"}
                      </td>
                      <td className="py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              ⋮
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setReassignDialogOpen(true)}
                            >
                              Reassign entries
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Progress data unavailable.
        </p>
      )}

      <ReassignInfoDialog
        open={reassignDialogOpen}
        onOpenChange={setReassignDialogOpen}
      />
    </RequireRole>
  )
}

// --- SessionDetailPage ---

function SessionDetailPage() {
  const { campaignId, sessionId } = useParams({
    from: "/campaigns/$campaignId/phone-banking/sessions/$sessionId/",
  })

  const { data: session, isLoading } = usePhoneBankSession(campaignId, sessionId)
  const { data: callers } = useSessionCallers(campaignId, sessionId)
  const { data: membersData } = useMembers(campaignId)

  const membersById = useMemo(() => {
    const map = new Map<string, CampaignMember>()
    for (const m of membersData?.items ?? []) {
      map.set(m.user_id, m)
    }
    return map
  }, [membersData])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Session not found.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/campaigns/$campaignId/phone-banking/sessions"
          params={{ campaignId }}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Sessions
        </Link>
        <h2 className="text-2xl font-semibold mt-1">{session.name}</h2>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <OverviewTab
            session={session}
            callers={callers ?? []}
            campaignId={campaignId}
            sessionId={sessionId}
            membersById={membersById}
            members={membersData?.items ?? []}
          />
        </TabsContent>
        <TabsContent value="progress" className="mt-6">
          <ProgressTab
            campaignId={campaignId}
            sessionId={sessionId}
            membersById={membersById}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
