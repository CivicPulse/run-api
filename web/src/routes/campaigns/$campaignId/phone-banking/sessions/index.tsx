import { useState } from "react"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { MoreHorizontal, Phone } from "lucide-react"
import { toast } from "sonner"
import {
  usePhoneBankSessions,
  useCreatePhoneBankSession,
  useUpdateSessionStatus,
  useDeletePhoneBankSession,
} from "@/hooks/usePhoneBankSessions"
import { useCallLists } from "@/hooks/useCallLists"
import { useFormGuard } from "@/hooks/useFormGuard"
import { DataTable } from "@/components/shared/DataTable"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { RequireRole } from "@/components/shared/RequireRole"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import type { PhoneBankSession, SessionCreate, SessionUpdate } from "@/types/phone-bank-session"
import type { ColumnDef } from "@tanstack/react-table"

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking/sessions/")({
  component: SessionsPage,
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

interface SessionFormValues {
  name: string
  call_list_id: string
  scheduled_start: string
  scheduled_end: string
}

function SessionDialog({
  open,
  onOpenChange,
  editSession,
  campaignId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editSession?: PhoneBankSession
  campaignId: string
}) {
  const isEdit = !!editSession
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<SessionFormValues>({
    defaultValues: {
      name: editSession?.name ?? "",
      call_list_id: editSession?.call_list_id ?? "",
      scheduled_start: editSession?.scheduled_start
        ? editSession.scheduled_start.slice(0, 16)
        : "",
      scheduled_end: editSession?.scheduled_end
        ? editSession.scheduled_end.slice(0, 16)
        : "",
    },
  })

  useFormGuard({ form })

  const { data: callListsData } = useCallLists(campaignId)
  const callLists = callListsData?.items ?? []

  const createMutation = useCreatePhoneBankSession(campaignId)
  const updateMutation = useUpdateSessionStatus(campaignId, editSession?.id ?? "")

  const isPending = isSubmitting || createMutation.isPending || updateMutation.isPending

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      form.reset({
        name: "",
        call_list_id: "",
        scheduled_start: "",
        scheduled_end: "",
      })
    }
    onOpenChange(nextOpen)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    const toNullableISO = (val: string) => (val ? new Date(val).toISOString() : null)

    setIsSubmitting(true)
    try {
      if (isEdit) {
        const updateData: SessionUpdate = {
          name: values.name,
          scheduled_start: toNullableISO(values.scheduled_start),
          scheduled_end: toNullableISO(values.scheduled_end),
        }
        await updateMutation.mutateAsync(updateData)
        toast.success("Session updated")
      } else {
        const createData: SessionCreate = {
          name: values.name,
          call_list_id: values.call_list_id,
          scheduled_start: toNullableISO(values.scheduled_start),
          scheduled_end: toNullableISO(values.scheduled_end),
        }
        await createMutation.mutateAsync(createData)
        toast.success("Session created")
      }
      handleOpenChange(false)
    } catch {
      toast.error("Failed to save session")
    } finally {
      setIsSubmitting(false)
    }
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Session" : "New Session"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="session-name">Name</Label>
            <Input
              id="session-name"
              placeholder="e.g. Saturday Phone Bank"
              {...form.register("name", { required: true, minLength: 1 })}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">Name is required</p>
            )}
          </div>

          {/* Call list selector — disabled in edit mode */}
          <div className="space-y-2">
            <Label htmlFor="session-call-list">Call List</Label>
            <Select
              value={form.watch("call_list_id")}
              onValueChange={(val) =>
                form.setValue("call_list_id", val, { shouldDirty: true })
              }
              disabled={isEdit}
            >
              <SelectTrigger id="session-call-list">
                <SelectValue placeholder="Select a call list" />
              </SelectTrigger>
              <SelectContent>
                {callLists.map((cl) => (
                  <SelectItem key={cl.id} value={cl.id}>
                    {cl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isEdit && form.formState.errors.call_list_id && (
              <p className="text-sm text-destructive">Call list is required</p>
            )}
            {isEdit && (
              <p className="text-sm text-muted-foreground">
                Call list cannot be changed after creation
              </p>
            )}
          </div>

          {/* Scheduled start */}
          <div className="space-y-2">
            <Label htmlFor="session-start">
              Scheduled Start{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="session-start"
              type="datetime-local"
              {...form.register("scheduled_start")}
            />
          </div>

          {/* Scheduled end */}
          <div className="space-y-2">
            <Label htmlFor="session-end">
              Scheduled End{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="session-end"
              type="datetime-local"
              {...form.register("scheduled_end")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SessionsPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/phone-banking/sessions/",
  })

  const { data: sessionsData, isLoading } = usePhoneBankSessions(campaignId)
  const sessions = sessionsData?.items ?? []

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSession, setEditSession] = useState<PhoneBankSession | undefined>(undefined)

  // Delete dialog state
  const [deleteSession, setDeleteSession] = useState<PhoneBankSession | null>(null)

  const deleteMutation = useDeletePhoneBankSession(campaignId)

  const handleOpenCreate = () => {
    setEditSession(undefined)
    setDialogOpen(true)
  }

  const handleOpenEdit = (session: PhoneBankSession) => {
    setEditSession(session)
    setDialogOpen(true)
  }

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setEditSession(undefined)
    }
  }

  const handleDelete = async () => {
    if (!deleteSession) return
    try {
      await deleteMutation.mutateAsync(deleteSession.id)
      toast.success("Session deleted")
      setDeleteSession(null)
    } catch {
      toast.error("Failed to delete session")
    }
  }

  const columns: ColumnDef<PhoneBankSession>[] = [
    {
      accessorKey: "name",
      header: "Name",
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
      id: "scheduled_start",
      header: "Scheduled Start",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.scheduled_start
            ? new Date(row.original.scheduled_start).toLocaleString()
            : "\u2014"}
        </span>
      ),
    },
    {
      id: "callers",
      header: "Callers",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.caller_count}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <RequireRole minimum="manager">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleOpenEdit(row.original)
                }}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteSession(row.original)
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RequireRole>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sessions</h2>
        <RequireRole minimum="manager">
          <Button size="sm" onClick={handleOpenCreate}>
            + New Session
          </Button>
        </RequireRole>
      </div>

      <DataTable
        columns={columns}
        data={sessions}
        isLoading={isLoading}
        emptyIcon={Phone}
        emptyTitle="No sessions yet"
        emptyDescription="Create a phone bank session to get started."
      />

      {/* Create / Edit Dialog */}
      {dialogOpen && (
        <SessionDialog
          open={dialogOpen}
          onOpenChange={handleDialogOpenChange}
          editSession={editSession}
          campaignId={campaignId}
        />
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteSession}
        onOpenChange={(open) => {
          if (!open) setDeleteSession(null)
        }}
        title="Delete Session"
        description="This will permanently delete the session. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
