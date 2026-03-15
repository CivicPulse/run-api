import { useState } from "react"
import { createFileRoute, useParams, Link } from "@tanstack/react-router"
import { toast } from "sonner"
import { MoreHorizontal, List } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable } from "@/components/shared/DataTable"
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog"
import { RequireRole } from "@/components/shared/RequireRole"
import { VoterFilterBuilder } from "@/components/voters/VoterFilterBuilder"
import {
  useVoterLists,
  useCreateVoterList,
  useUpdateVoterList,
  useDeleteVoterList,
} from "@/hooks/useVoterLists"
import { cn } from "@/lib/utils"
import {
  formatPropensityChip,
  formatMultiSelectChip,
  CATEGORY_CLASSES,
} from "@/lib/filterChipUtils"
import type { VoterList } from "@/types/voter-list"
import type { VoterFilter } from "@/types/voter"

// ─── Filter chip component for dialogs ────────────────────────────────────────

interface FilterChipProps {
  label: string
  onDismiss: () => void
  className?: string
  tooltip?: string
}

function FilterChip({ label, onDismiss, className, tooltip }: FilterChipProps) {
  const badge = (
    <Badge variant="secondary" className={cn("gap-1 pr-1", className)}>
      {label}
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
        aria-label={`Remove ${label} filter`}
      >
        {"\u00d7"}
      </button>
    </Badge>
  )
  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    )
  }
  return badge
}

// ─── Build dismissible chips for dialog use ───────────────────────────────────

function buildDialogChips(
  filters: VoterFilter,
  setFilters: (f: VoterFilter) => void,
): FilterChipProps[] {
  const chips: FilterChipProps[] = []
  const update = (partial: Partial<VoterFilter>) =>
    setFilters({ ...filters, ...partial })

  // ── Demographics ────────────────────────────────────────────────────────
  if (filters.parties && filters.parties.length > 0) {
    chips.push({
      label: `Party: ${filters.parties.join(", ")}`,
      className: CATEGORY_CLASSES.demographics,
      onDismiss: () => update({ parties: undefined }),
    })
  }
  if (filters.age_min !== undefined || filters.age_max !== undefined) {
    chips.push({
      label: `Age: ${filters.age_min ?? ""}\u2013${filters.age_max ?? ""}`,
      className: CATEGORY_CLASSES.demographics,
      onDismiss: () => update({ age_min: undefined, age_max: undefined }),
    })
  }
  if (filters.gender) {
    chips.push({
      label: `Gender: ${filters.gender}`,
      className: CATEGORY_CLASSES.demographics,
      onDismiss: () => update({ gender: undefined }),
    })
  }
  if (filters.ethnicities && filters.ethnicities.length > 0) {
    const { display, tooltip } = formatMultiSelectChip("Ethnicity", filters.ethnicities)
    chips.push({ label: display, className: CATEGORY_CLASSES.demographics, tooltip, onDismiss: () => update({ ethnicities: undefined }) })
  }
  if (filters.spoken_languages && filters.spoken_languages.length > 0) {
    const { display, tooltip } = formatMultiSelectChip("Language", filters.spoken_languages)
    chips.push({ label: display, className: CATEGORY_CLASSES.demographics, tooltip, onDismiss: () => update({ spoken_languages: undefined }) })
  }
  if (filters.military_statuses && filters.military_statuses.length > 0) {
    const { display, tooltip } = formatMultiSelectChip("Military", filters.military_statuses)
    chips.push({ label: display, className: CATEGORY_CLASSES.demographics, tooltip, onDismiss: () => update({ military_statuses: undefined }) })
  }

  // ── Scoring ─────────────────────────────────────────────────────────────
  const genLabel = formatPropensityChip("Gen.", filters.propensity_general_min, filters.propensity_general_max)
  if (genLabel) {
    chips.push({ label: genLabel, className: CATEGORY_CLASSES.scoring, onDismiss: () => update({ propensity_general_min: undefined, propensity_general_max: undefined }) })
  }
  const priLabel = formatPropensityChip("Pri.", filters.propensity_primary_min, filters.propensity_primary_max)
  if (priLabel) {
    chips.push({ label: priLabel, className: CATEGORY_CLASSES.scoring, onDismiss: () => update({ propensity_primary_min: undefined, propensity_primary_max: undefined }) })
  }
  const combLabel = formatPropensityChip("Comb.", filters.propensity_combined_min, filters.propensity_combined_max)
  if (combLabel) {
    chips.push({ label: combLabel, className: CATEGORY_CLASSES.scoring, onDismiss: () => update({ propensity_combined_min: undefined, propensity_combined_max: undefined }) })
  }

  // ── Location ────────────────────────────────────────────────────────────
  if (filters.registration_city) {
    chips.push({ label: `City: ${filters.registration_city}`, className: CATEGORY_CLASSES.location, onDismiss: () => update({ registration_city: undefined }) })
  }
  if (filters.registration_state) {
    chips.push({ label: `State: ${filters.registration_state}`, className: CATEGORY_CLASSES.location, onDismiss: () => update({ registration_state: undefined }) })
  }
  if (filters.registration_zip) {
    chips.push({ label: `Zip: ${filters.registration_zip}`, className: CATEGORY_CLASSES.location, onDismiss: () => update({ registration_zip: undefined }) })
  }
  if (filters.precinct) {
    chips.push({ label: `Precinct: ${filters.precinct}`, className: CATEGORY_CLASSES.location, onDismiss: () => update({ precinct: undefined }) })
  }
  if (filters.mailing_city) {
    chips.push({ label: `Mail City: ${filters.mailing_city}`, className: CATEGORY_CLASSES.location, onDismiss: () => update({ mailing_city: undefined }) })
  }
  if (filters.mailing_state) {
    chips.push({ label: `Mail State: ${filters.mailing_state}`, className: CATEGORY_CLASSES.location, onDismiss: () => update({ mailing_state: undefined }) })
  }
  if (filters.mailing_zip) {
    chips.push({ label: `Mail Zip: ${filters.mailing_zip}`, className: CATEGORY_CLASSES.location, onDismiss: () => update({ mailing_zip: undefined }) })
  }

  // ── Voting ──────────────────────────────────────────────────────────────
  if (filters.voted_in && filters.voted_in.length > 0) {
    chips.push({ label: `Voted in: ${filters.voted_in.join(", ")}`, className: CATEGORY_CLASSES.voting, onDismiss: () => update({ voted_in: undefined }) })
  }
  if (filters.not_voted_in && filters.not_voted_in.length > 0) {
    chips.push({ label: `Not voted in: ${filters.not_voted_in.join(", ")}`, className: CATEGORY_CLASSES.voting, onDismiss: () => update({ not_voted_in: undefined }) })
  }
  if (filters.congressional_district) {
    chips.push({ label: `CD: ${filters.congressional_district}`, className: CATEGORY_CLASSES.voting, onDismiss: () => update({ congressional_district: undefined }) })
  }

  // ── Other ───────────────────────────────────────────────────────────────
  if (filters.tags && filters.tags.length > 0) {
    chips.push({ label: `Tags (all): ${filters.tags.length}`, className: CATEGORY_CLASSES.other, onDismiss: () => update({ tags: undefined }) })
  }
  if (filters.registered_after) {
    chips.push({ label: `Registered after: ${filters.registered_after}`, className: CATEGORY_CLASSES.other, onDismiss: () => update({ registered_after: undefined }) })
  }
  if (filters.registered_before) {
    chips.push({ label: `Registered before: ${filters.registered_before}`, className: CATEGORY_CLASSES.other, onDismiss: () => update({ registered_before: undefined }) })
  }
  if (filters.has_phone !== undefined) {
    chips.push({ label: `Has phone: ${filters.has_phone ? "Yes" : "No"}`, className: CATEGORY_CLASSES.other, onDismiss: () => update({ has_phone: undefined }) })
  }
  if (filters.logic && filters.logic !== "AND") {
    chips.push({ label: `Match: ${filters.logic}`, className: CATEGORY_CLASSES.other, onDismiss: () => update({ logic: undefined }) })
  }

  return chips
}

function VoterListsPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/voters/lists/",
  })

  const { data: lists = [], isLoading } = useVoterLists(campaignId)

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [listType, setListType] = useState<"static" | "dynamic" | null>(null)
  const [createName, setCreateName] = useState("")
  const [filters, setFilters] = useState<VoterFilter>({})

  // Edit dialog state
  const [editList, setEditList] = useState<VoterList | null>(null)
  const [editName, setEditName] = useState("")
  const [editFilters, setEditFilters] = useState<VoterFilter>({})

  // Delete dialog state
  const [deleteList, setDeleteList] = useState<VoterList | null>(null)

  const createMutation = useCreateVoterList(campaignId)
  const updateMutation = useUpdateVoterList(
    campaignId,
    editList?.id ?? "",
  )
  const deleteMutation = useDeleteVoterList(
    campaignId,
    deleteList?.id ?? "",
  )

  // Create handlers
  const handleCreate = async () => {
    if (!listType || !createName.trim()) return
    try {
      await createMutation.mutateAsync({
        name: createName.trim(),
        list_type: listType,
        filter_query: listType === "dynamic" ? JSON.stringify(filters) : undefined,
      })
      toast.success("List created")
      setCreateOpen(false)
      setListType(null)
      setCreateName("")
      setFilters({})
    } catch {
      toast.error("Failed to create list")
    }
  }

  const handleCreateDialogChange = (open: boolean) => {
    setCreateOpen(open)
    if (!open) {
      setListType(null)
      setCreateName("")
      setFilters({})
    }
  }

  // Edit handlers
  const handleEditOpen = (list: VoterList) => {
    setEditList(list)
    setEditName(list.name)
    setEditFilters(
      list.list_type === "dynamic" && list.filter_query
        ? (JSON.parse(list.filter_query) as VoterFilter)
        : {},
    )
  }

  const handleEditSave = async () => {
    if (!editList || !editName.trim()) return
    try {
      await updateMutation.mutateAsync({
        name: editName.trim(),
        filter_query:
          editList.list_type === "dynamic"
            ? JSON.stringify(editFilters)
            : undefined,
      })
      toast.success("List updated")
      setEditList(null)
    } catch {
      toast.error("Failed to update list")
    }
  }

  // Delete handler
  const handleDelete = async () => {
    if (!deleteList) return
    try {
      await deleteMutation.mutateAsync()
      toast.success("List deleted")
      setDeleteList(null)
    } catch {
      toast.error("Failed to delete list")
    }
  }

  const columns: ColumnDef<VoterList, unknown>[] = [
    {
      accessorKey: "name",
      header: "Name",
      enableSorting: true,
      cell: ({ row }) => (
        <Link
          to="/campaigns/$campaignId/voters/lists/$listId"
          params={{ campaignId, listId: row.original.id }}
          className="font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "list_type",
      header: "Type",
      cell: ({ row }) => (
        <Badge
          variant={row.original.list_type === "dynamic" ? "default" : "secondary"}
        >
          {row.original.list_type === "dynamic" ? "Dynamic" : "Static"}
        </Badge>
      ),
    },
    {
      accessorKey: "voter_count",
      header: () => <span className="block text-right">Members</span>,
      cell: ({ row }) => (
        <span className="block text-right text-muted-foreground">
          {(row.original as VoterList & { voter_count?: number }).voter_count ?? 0}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {new Date(row.original.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const list = row.original
        return (
          <RequireRole minimum="manager">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEditOpen(list)
                  }}
                >
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteList(list)
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </RequireRole>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Voter Lists</h2>
        <RequireRole minimum="manager">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            + New List
          </Button>
        </RequireRole>
      </div>

      <DataTable
        columns={columns}
        data={lists}
        isLoading={isLoading}
        emptyIcon={List}
        emptyTitle="No voter lists"
        emptyDescription="Create a list to organize voters for canvassing and phone banking."
      />

      {/* Create List Dialog */}
      <Dialog open={createOpen} onOpenChange={handleCreateDialogChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Voter List</DialogTitle>
          </DialogHeader>

          {listType === null ? (
            // Step 1: choose list type
            <div className="grid grid-cols-2 gap-4 py-4">
              <button
                className="flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left hover:border-primary hover:bg-muted/50 transition-colors"
                onClick={() => setListType("static")}
              >
                <span className="font-medium">Static List</span>
                <span className="text-sm text-muted-foreground">
                  Manually add and remove voters. Use for hand-curated lists like
                  high-priority contacts.
                </span>
              </button>
              <button
                className="flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left hover:border-primary hover:bg-muted/50 transition-colors"
                onClick={() => setListType("dynamic")}
              >
                <span className="font-medium">Dynamic List</span>
                <span className="text-sm text-muted-foreground">
                  Auto-populates based on filter criteria. Membership updates
                  automatically as voter data changes.
                </span>
              </button>
            </div>
          ) : (
            // Step 2: fill in details
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-list-name">List Name</Label>
                <Input
                  id="create-list-name"
                  placeholder="e.g. High-priority DEM voters"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>

              {listType === "dynamic" && (
                <div className="space-y-2">
                  <Label>Filter Criteria</Label>
                  <VoterFilterBuilder
                    value={filters}
                    onChange={setFilters}
                    campaignId={campaignId}
                  />
                  {(() => {
                    const chips = buildDialogChips(filters, setFilters)
                    return chips.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {chips.map((chip) => (
                          <FilterChip key={chip.label} {...chip} />
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
                          Clear all
                        </Button>
                      </div>
                    ) : null
                  })()}
                  <p className="text-xs text-muted-foreground">
                    Voter count will update after the list is created.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setListType(null)}
                  disabled={createMutation.isPending}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleCreate}
                  disabled={!createName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating..." : "Create List"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit List Dialog */}
      <Dialog
        open={!!editList}
        onOpenChange={(open) => {
          if (!open) setEditList(null)
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit List</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-list-name">List Name</Label>
              <Input
                id="edit-list-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            {editList?.list_type === "dynamic" && (
              <div className="space-y-2">
                <Label>Filter Criteria</Label>
                <VoterFilterBuilder
                  value={editFilters}
                  onChange={setEditFilters}
                  campaignId={campaignId}
                />
                {(() => {
                  const chips = buildDialogChips(editFilters, setEditFilters)
                  return chips.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {chips.map((chip) => (
                        <FilterChip key={chip.label} {...chip} />
                      ))}
                      <Button variant="ghost" size="sm" onClick={() => setEditFilters({})}>
                        Clear all
                      </Button>
                    </div>
                  ) : null
                })()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditList(null)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleEditSave}
              disabled={!editName.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <DestructiveConfirmDialog
        open={!!deleteList}
        onOpenChange={(open) => {
          if (!open) setDeleteList(null)
        }}
        title={`Delete "${deleteList?.name ?? "this list"}"?`}
        description="This will permanently delete the list and its membership data."
        confirmText={deleteList?.name ?? ""}
        confirmLabel="Delete List"
        onConfirm={handleDelete}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/lists/")({
  component: VoterListsPage,
})
