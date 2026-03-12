import { useState } from "react"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { Phone } from "lucide-react"
import { toast } from "sonner"
import { useMyPhoneBankSessions, useCheckIn } from "@/hooks/usePhoneBankSessions"
import { DataTable } from "@/components/shared/DataTable"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import type { PhoneBankSession } from "@/types/phone-bank-session"
import type { ColumnDef } from "@tanstack/react-table"

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking/my-sessions/")({
  component: MySessionsPage,
})

function statusVariant(status: string): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "active":
      return "success"
    case "paused":
      return "warning"
    case "completed":
      return "info"
    case "draft":
      return "default"
    default:
      return "default"
  }
}

function RowAction({
  session,
  campaignId,
  checkedInSessionIds,
  onCheckInSuccess,
}: {
  session: PhoneBankSession
  campaignId: string
  checkedInSessionIds: Set<string>
  onCheckInSuccess: (sessionId: string) => void
}) {
  const checkIn = useCheckIn(campaignId, session.id)
  const isCheckedIn = checkedInSessionIds.has(session.id)

  if (session.status !== "active") {
    return <span className="text-muted-foreground">—</span>
  }

  if (isCheckedIn) {
    return (
      <Link
        to="/campaigns/$campaignId/phone-banking/sessions/$sessionId/call"
        params={{ campaignId, sessionId: session.id }}
        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3"
      >
        Resume Calling
      </Link>
    )
  }

  return (
    <Button
      size="sm"
      disabled={checkIn.isPending}
      onClick={() =>
        checkIn.mutate(undefined, {
          onSuccess: () => {
            onCheckInSuccess(session.id)
            toast.success("Checked in successfully")
          },
          onError: () => toast.error("Check-in failed"),
        })
      }
    >
      {checkIn.isPending ? "Checking in..." : "Check In"}
    </Button>
  )
}

function MySessionsPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/phone-banking/my-sessions/",
  })

  const { data: sessionsData, isLoading } = useMyPhoneBankSessions(campaignId)
  const sessions = sessionsData?.items ?? []

  // Track which sessions the current user has checked in to during this page session.
  // Resets on page refresh — acceptable for v1 (see CONTEXT.md option 3).
  const [checkedInSessionIds, setCheckedInSessionIds] = useState<Set<string>>(new Set())

  const handleCheckInSuccess = (sessionId: string) => {
    setCheckedInSessionIds((prev) => new Set(prev).add(sessionId))
  }

  const columns: ColumnDef<PhoneBankSession>[] = [
    {
      accessorKey: "name",
      header: "Session Name",
      cell: ({ row }) => (
        <Link
          to="/campaigns/$campaignId/phone-banking/sessions/$sessionId"
          params={{ campaignId, sessionId: row.original.id }}
          className="font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          variant={statusVariant(row.original.status)}
        />
      ),
    },
    {
      id: "call_list",
      header: "Call List",
      cell: ({ row }) => {
        const name = row.original.call_list_name
        if (!name) {
          return <span className="text-sm text-muted-foreground">Deleted list</span>
        }
        return (
          <Link
            to="/campaigns/$campaignId/phone-banking/call-lists/$callListId"
            params={{ campaignId, callListId: row.original.call_list_id }}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {name}
          </Link>
        )
      },
    },
    {
      id: "checked_in",
      header: "Checked In",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {checkedInSessionIds.has(row.original.id) ? "Yes" : "—"}
        </span>
      ),
    },
    {
      id: "action",
      header: "Action",
      cell: ({ row }) => (
        <RowAction
          session={row.original}
          campaignId={campaignId}
          checkedInSessionIds={checkedInSessionIds}
          onCheckInSuccess={handleCheckInSuccess}
        />
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">My Sessions</h2>
        <p className="text-sm text-muted-foreground mt-1">Sessions you're assigned to</p>
      </div>

      {!isLoading && sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-medium">No sessions assigned</p>
          <p className="text-sm mt-1">
            Ask a session manager to assign you to a phone bank session.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={sessions}
          isLoading={isLoading}
          emptyIcon={Phone}
          emptyTitle="No sessions assigned"
          emptyDescription="Ask a session manager to assign you to a phone bank session."
        />
      )}
    </div>
  )
}
