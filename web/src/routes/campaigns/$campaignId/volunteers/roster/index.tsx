import { useState } from "react"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import { MoreHorizontal, Users } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable } from "@/components/shared/DataTable"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { RequireRole } from "@/components/shared/RequireRole"
import {
  useVolunteerList,
  useUpdateVolunteerStatus,
} from "@/hooks/useVolunteers"
import {
  VOLUNTEER_SKILLS,
  VOLUNTEER_STATUSES,
  formatSkillLabel,
  type VolunteerResponse,
} from "@/types/volunteer"

// ---- Kebab actions per row (needs its own component for hook call) ----
interface RowActionsProps {
  volunteer: VolunteerResponse
  campaignId: string
  onDeactivate: (volunteer: VolunteerResponse) => void
}

function RowActions({ volunteer, campaignId, onDeactivate }: RowActionsProps) {
  const navigate = useNavigate()
  const statusMutation = useUpdateVolunteerStatus(campaignId, volunteer.id)

  const handleStatusChange = async (status: string) => {
    try {
      await statusMutation.mutateAsync(status)
      toast.success(`Status changed to ${status}`)
    } catch {
      toast.error("Failed to change status")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation()
            navigate({
              to: "/campaigns/$campaignId/volunteers/$volunteerId",
              params: { campaignId, volunteerId: volunteer.id },
            })
          }}
        >
          Edit volunteer
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Change Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {VOLUNTEER_STATUSES.map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={(e) => {
                  e.stopPropagation()
                  handleStatusChange(status)
                }}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onDeactivate(volunteer)
          }}
        >
          Deactivate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---- Main page ----
function RosterPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/volunteers/roster/",
  })
  const navigate = useNavigate()

  // Filter state
  const [nameSearch, setNameSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [skillsFilter, setSkillsFilter] = useState<string[]>([])

  // Deactivate confirm dialog
  const [deactivateTarget, setDeactivateTarget] =
    useState<VolunteerResponse | null>(null)
  const deactivateMutation = useUpdateVolunteerStatus(
    campaignId,
    deactivateTarget?.id ?? "",
  )

  // Data
  const { data, isLoading } = useVolunteerList(campaignId, {
    status: statusFilter,
    skills: skillsFilter.join(",") || undefined,
    name: nameSearch || undefined,
  })
  const volunteers = data?.items ?? []

  const handleDeactivate = async () => {
    if (!deactivateTarget) return
    try {
      await deactivateMutation.mutateAsync("inactive")
      toast.success("Volunteer deactivated")
      setDeactivateTarget(null)
    } catch {
      toast.error("Failed to deactivate volunteer")
    }
  }

  const toggleSkill = (skill: string) => {
    setSkillsFilter((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    )
  }

  const columns: ColumnDef<VolunteerResponse, unknown>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.first_name} {row.original.last_name}
        </span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.email ?? "-"}
        </span>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.phone ?? "-"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.status.charAt(0).toUpperCase() +
            row.original.status.slice(1)}
        </Badge>
      ),
    },
    {
      id: "skills",
      header: "Skills",
      cell: ({ row }) => {
        const skills = row.original.skills
        if (!skills || skills.length === 0) return "-"
        const visible = skills.slice(0, 2)
        const remaining = skills.length - 2
        return (
          <div className="flex items-center gap-1">
            {visible.map((skill) => (
              <Badge key={skill} variant="secondary">
                {formatSkillLabel(skill)}
              </Badge>
            ))}
            {remaining > 0 && (
              <Badge variant="secondary">+{remaining} more</Badge>
            )}
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <RequireRole minimum="manager">
          <RowActions
            volunteer={row.original}
            campaignId={campaignId}
            onDeactivate={setDeactivateTarget}
          />
        </RequireRole>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Volunteer Roster</h2>
      </div>

      {/* Filter controls */}
      <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
        <Input
          placeholder="Search by name..."
          className="col-span-2 md:w-64"
          value={nameSearch}
          onChange={(e) => setNameSearch(e.target.value)}
        />

        <Select
          value={statusFilter ?? "all"}
          onValueChange={(val) =>
            setStatusFilter(val === "all" ? undefined : val)
          }
        >
          <SelectTrigger className="md:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {VOLUNTEER_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start md:w-40">
              Skills
              {skillsFilter.length > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {skillsFilter.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-2">
              {VOLUNTEER_SKILLS.map((skill) => (
                <label
                  key={skill}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={skillsFilter.includes(skill)}
                    onCheckedChange={() => toggleSkill(skill)}
                  />
                  {formatSkillLabel(skill)}
                </label>
              ))}
            </div>
            {skillsFilter.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setSkillsFilter([])}
              >
                Clear
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={volunteers}
        isLoading={isLoading}
        emptyIcon={Users}
        emptyTitle="No volunteers yet"
        emptyDescription="Register volunteers or invite them to join the campaign."
        emptyAction={
          <RequireRole minimum="manager">
            <Button
              size="sm"
              onClick={() =>
                navigate({
                  to: "/campaigns/$campaignId/volunteers/register",
                  params: { campaignId },
                })
              }
            >
              Create Volunteer
            </Button>
          </RequireRole>
        }
        onRowClick={(row) =>
          navigate({
            to: "/campaigns/$campaignId/volunteers/$volunteerId",
            params: { campaignId, volunteerId: row.id },
          })
        }
      />

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null)
        }}
        title="Deactivate volunteer?"
        description="Deactivating preserves all hours and shift history. This action can be reversed by a manager."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={handleDeactivate}
        isPending={deactivateMutation.isPending}
      />
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/volunteers/roster/",
)({
  component: RosterPage,
})
