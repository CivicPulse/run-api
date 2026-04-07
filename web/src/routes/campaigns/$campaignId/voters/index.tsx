import { useDeferredValue, useMemo, useState } from "react"
import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import type { ColumnDef, SortingState } from "@tanstack/react-table"

import { useVoterSearch, useCreateVoter, useDeleteVoter } from "@/hooks/useVoters"
import { RequireRole } from "@/components/shared/RequireRole"
import { DataTable } from "@/components/shared/DataTable"
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog"
import { VoterFilterBuilder } from "@/components/voters/VoterFilterBuilder"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Users } from "lucide-react"
import { cn, calculateAge } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  formatPropensityChip,
  formatMultiSelectChip,
  CATEGORY_CLASSES,
} from "@/lib/filterChipUtils"
import type { Voter, VoterFilter, VoterCreate, VoterSearchBody, SortableColumn } from "@/types/voter"

// ─── Create form schema ───────────────────────────────────────────────────────

const voterSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  party: z.string().optional(),
  registration_line1: z.string().optional(),
  registration_city: z.string().optional(),
  registration_state: z.string().optional(),
  registration_zip: z.string().optional(),
  registration_date: z.string().optional(),
  propensity_general: z.number().optional(),
  propensity_primary: z.number().optional(),
  propensity_combined: z.number().optional(),
  age: z.number().optional(),
  party_change_indicator: z.string().optional(),
  cell_phone_confidence: z.number().optional(),
  household_party_registration: z.string().optional(),
  household_size: z.number().optional(),
  family_id: z.string().optional(),
})

type VoterFormData = z.infer<typeof voterSchema>

// ─── Active filter chips ──────────────────────────────────────────────────────

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

function buildFilterChips(
  filters: VoterFilter,
  update: (partial: Partial<VoterFilter>) => void,
  clearLookup: () => void,
) {
  const chips: FilterChipProps[] = []

  // ── Demographics ──────────────────────────────────────────────────────────

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
    chips.push({
      label: display,
      className: CATEGORY_CLASSES.demographics,
      tooltip,
      onDismiss: () => update({ ethnicities: undefined }),
    })
  }

  if (filters.spoken_languages && filters.spoken_languages.length > 0) {
    const { display, tooltip } = formatMultiSelectChip("Language", filters.spoken_languages)
    chips.push({
      label: display,
      className: CATEGORY_CLASSES.demographics,
      tooltip,
      onDismiss: () => update({ spoken_languages: undefined }),
    })
  }

  if (filters.military_statuses && filters.military_statuses.length > 0) {
    const { display, tooltip } = formatMultiSelectChip("Military", filters.military_statuses)
    chips.push({
      label: display,
      className: CATEGORY_CLASSES.demographics,
      tooltip,
      onDismiss: () => update({ military_statuses: undefined }),
    })
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  const genLabel = formatPropensityChip("Gen.", filters.propensity_general_min, filters.propensity_general_max)
  if (genLabel) {
    chips.push({
      label: genLabel,
      className: CATEGORY_CLASSES.scoring,
      onDismiss: () => update({ propensity_general_min: undefined, propensity_general_max: undefined }),
    })
  }

  const priLabel = formatPropensityChip("Pri.", filters.propensity_primary_min, filters.propensity_primary_max)
  if (priLabel) {
    chips.push({
      label: priLabel,
      className: CATEGORY_CLASSES.scoring,
      onDismiss: () => update({ propensity_primary_min: undefined, propensity_primary_max: undefined }),
    })
  }

  const combLabel = formatPropensityChip("Comb.", filters.propensity_combined_min, filters.propensity_combined_max)
  if (combLabel) {
    chips.push({
      label: combLabel,
      className: CATEGORY_CLASSES.scoring,
      onDismiss: () => update({ propensity_combined_min: undefined, propensity_combined_max: undefined }),
    })
  }

  // ── Location ──────────────────────────────────────────────────────────────

  if (filters.registration_city) {
    chips.push({
      label: `City: ${filters.registration_city}`,
      className: CATEGORY_CLASSES.location,
      onDismiss: () => update({ registration_city: undefined }),
    })
  }

  if (filters.registration_state) {
    chips.push({
      label: `State: ${filters.registration_state}`,
      className: CATEGORY_CLASSES.location,
      onDismiss: () => update({ registration_state: undefined }),
    })
  }

  if (filters.registration_zip) {
    chips.push({
      label: `Zip: ${filters.registration_zip}`,
      className: CATEGORY_CLASSES.location,
      onDismiss: () => update({ registration_zip: undefined }),
    })
  }

  if (filters.registration_county) {
    chips.push({
      label: `County: ${filters.registration_county}`,
      className: CATEGORY_CLASSES.location,
      onDismiss: () => update({ registration_county: undefined }),
    })
  }

  if (filters.precinct) {
    chips.push({
      label: `Precinct: ${filters.precinct}`,
      className: CATEGORY_CLASSES.location,
      onDismiss: () => update({ precinct: undefined }),
    })
  }

  if (filters.mailing_city) {
    chips.push({
      label: `Mail City: ${filters.mailing_city}`,
      className: CATEGORY_CLASSES.location,
      onDismiss: () => update({ mailing_city: undefined }),
    })
  }

  if (filters.mailing_state) {
    chips.push({
      label: `Mail State: ${filters.mailing_state}`,
      className: CATEGORY_CLASSES.location,
      onDismiss: () => update({ mailing_state: undefined }),
    })
  }

  if (filters.mailing_zip) {
    chips.push({
      label: `Mail Zip: ${filters.mailing_zip}`,
      className: CATEGORY_CLASSES.location,
      onDismiss: () => update({ mailing_zip: undefined }),
    })
  }

  // ── Voting ────────────────────────────────────────────────────────────────

  if (filters.voted_in && filters.voted_in.length > 0) {
    chips.push({
      label: `Voted in: ${filters.voted_in.join(", ")}`,
      className: CATEGORY_CLASSES.voting,
      onDismiss: () => update({ voted_in: undefined }),
    })
  }

  if (filters.not_voted_in && filters.not_voted_in.length > 0) {
    chips.push({
      label: `Not voted in: ${filters.not_voted_in.join(", ")}`,
      className: CATEGORY_CLASSES.voting,
      onDismiss: () => update({ not_voted_in: undefined }),
    })
  }

  if (filters.congressional_district) {
    chips.push({
      label: `CD: ${filters.congressional_district}`,
      className: CATEGORY_CLASSES.voting,
      onDismiss: () => update({ congressional_district: undefined }),
    })
  }

  // ── Other ─────────────────────────────────────────────────────────────────

  if (filters.tags && filters.tags.length > 0) {
    chips.push({
      label: `Tags (all): ${filters.tags.length}`,
      className: CATEGORY_CLASSES.other,
      onDismiss: () => update({ tags: undefined }),
    })
  }

  if (filters.tags_any && filters.tags_any.length > 0) {
    chips.push({
      label: `Tags (any): ${filters.tags_any.length}`,
      className: CATEGORY_CLASSES.other,
      onDismiss: () => update({ tags_any: undefined }),
    })
  }

  if (filters.registered_after) {
    chips.push({
      label: `Registered after: ${filters.registered_after}`,
      className: CATEGORY_CLASSES.other,
      onDismiss: () => update({ registered_after: undefined }),
    })
  }

  if (filters.registered_before) {
    chips.push({
      label: `Registered before: ${filters.registered_before}`,
      className: CATEGORY_CLASSES.other,
      onDismiss: () => update({ registered_before: undefined }),
    })
  }

  if (filters.has_phone !== undefined) {
    chips.push({
      label: `Has phone: ${filters.has_phone ? "Yes" : "No"}`,
      className: CATEGORY_CLASSES.other,
      onDismiss: () => update({ has_phone: undefined }),
    })
  }

  if (filters.logic && filters.logic !== "AND") {
    chips.push({
      label: `Match: ${filters.logic}`,
      className: CATEGORY_CLASSES.other,
      onDismiss: () => update({ logic: undefined }),
    })
  }

  if (filters.search) {
    chips.push({
      label: `Lookup: ${filters.search}`,
      className: CATEGORY_CLASSES.other,
      onDismiss: clearLookup,
    })
  }

  return chips
}

function normalizeLookupQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

// ─── VoterCreateForm ──────────────────────────────────────────────────────────

interface VoterCreateFormProps {
  campaignId: string
  onSuccess: () => void
}

function VoterCreateForm({ campaignId, onSuccess }: VoterCreateFormProps) {
  const createVoter = useCreateVoter(campaignId)
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<VoterFormData>({ resolver: zodResolver(voterSchema) })

  const onSubmit = async (data: VoterFormData) => {
    const payload: VoterCreate = {}
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== "") (payload as Record<string, string | number>)[k] = v
    }
    try {
      await createVoter.mutateAsync(payload)
      toast.success("Voter created")
      reset()
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create voter"
      toast.error(msg)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="first_name">First Name</Label>
          <Input id="first_name" {...register("first_name")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="last_name">Last Name</Label>
          <Input id="last_name" {...register("last_name")} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="date_of_birth">Date of Birth</Label>
        <Input id="date_of_birth" type="date" {...register("date_of_birth")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="party">Party</Label>
        <Input id="party" placeholder="DEM, REP, NPA..." {...register("party")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="registration_line1">Address</Label>
        <Input id="registration_line1" {...register("registration_line1")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="registration_city">City</Label>
          <Input id="registration_city" {...register("registration_city")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="registration_state">State</Label>
          <Input id="registration_state" {...register("registration_state")} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="registration_zip">Zip Code</Label>
        <Input id="registration_zip" {...register("registration_zip")} />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Creating..." : "Create Voter"}
      </Button>
    </form>
  )
}

// ─── Voter columns ────────────────────────────────────────────────────────────

function buildColumns(
  campaignId: string,
  navigate: ReturnType<typeof useNavigate>,
  onDelete: (voter: Voter) => void,
): ColumnDef<Voter, unknown>[] {
  return [
    {
      id: "full_name",
      header: "Name",
      enableSorting: true,
      accessorFn: (row) => row.last_name ?? "",
      cell: ({ row }) => {
        const v = row.original
        const name = [v.first_name, v.last_name].filter(Boolean).join(" ") || "Unknown"
        const cityState = [v.registration_city, v.registration_state].filter(Boolean).join(", ")
        const location = [cityState, v.registration_zip].filter(Boolean).join(" ")
        const context = [
          location || null,
          v.source_id ? `ID ${v.source_id}` : null,
          v.party ? `Party ${v.party}` : null,
        ].filter(Boolean)
        return (
          <div className="space-y-1">
            <Link
              to="/campaigns/$campaignId/voters/$voterId"
              params={{ campaignId, voterId: v.id }}
              className="font-medium hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {name}
            </Link>
            <div className="text-xs text-muted-foreground">
              {context.join(" • ") || "Open voter detail for more context"}
            </div>
          </div>
        )
      },
    },
    {
      id: "party",
      header: "Party",
      enableSorting: true,
      accessorFn: (row) => row.party ?? "",
      cell: ({ row }) => {
        const party = row.original.party
        if (!party) return <span className="text-muted-foreground">—</span>
        const variants: Record<string, "default" | "secondary" | "outline"> = {
          DEM: "default",
          REP: "secondary",
        }
        return <Badge variant={variants[party] ?? "outline"}>{party}</Badge>
      },
    },
    {
      id: "city",
      header: "City",
      enableSorting: true,
      accessorFn: (row) => row.registration_city ?? "",
      cell: ({ row }) => row.original.registration_city ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "district",
      header: "District",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) =>
        row.original.congressional_district ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "age",
      header: "Age",
      enableSorting: true,
      accessorFn: (row) => row.age ?? (row.date_of_birth ? calculateAge(row.date_of_birth) : 0),
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => {
        const v = row.original
        const computed = v.date_of_birth ? calculateAge(v.date_of_birth) : null
        return v.age ?? computed ?? <span className="text-muted-foreground">—</span>
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const voter = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => e.stopPropagation()}
                aria-label="Open voter actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  navigate({
                    to: "/campaigns/$campaignId/voters/$voterId",
                    params: { campaignId, voterId: voter.id },
                  })
                }
              >
                View detail
              </DropdownMenuItem>
              <RequireRole minimum="manager">
                <DropdownMenuItem
                  onClick={() =>
                    navigate({
                      to: "/campaigns/$campaignId/voters/$voterId",
                      params: { campaignId, voterId: voter.id },
                    })
                  }
                >
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(voter)}
                >
                  Delete
                </DropdownMenuItem>
              </RequireRole>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}

// ─── Sort column mapping ─────────────────────────────────────────────────────

const SORT_COLUMN_MAP: Record<string, SortableColumn> = {
  full_name: "last_name",
  party: "party",
  city: "registration_city",
  age: "age",
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function VotersPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/voters/",
  })
  const navigate = useNavigate()

  // Filter panel state
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<VoterFilter>({})
  const [lookupTerm, setLookupTerm] = useState("")
  const deferredLookupTerm = useDeferredValue(lookupTerm)

  // Cursor-based pagination state
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [prevCursors, setPrevCursors] = useState<string[]>([])

  // Sorting state
  const [sorting, setSorting] = useState<SortingState>([])
  const sortBy = sorting[0]?.id
  const sortDir = sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined

  const normalizedLookupInput = normalizeLookupQuery(lookupTerm)
  const activeLookup = normalizeLookupQuery(deferredLookupTerm) || undefined
  const lookupPending = normalizedLookupInput !== (activeLookup ?? "")
  const mappedSortBy = sortBy ? SORT_COLUMN_MAP[sortBy] ?? (sortBy as SortableColumn) : undefined
  const searchBody: VoterSearchBody = {
    filters: activeLookup ? { ...filters, search: activeLookup } : filters,
    cursor,
    limit: 50,
    sort_by: mappedSortBy,
    sort_dir: sortDir,
  }
  const { data, isLoading, isFetching, isError, error } = useVoterSearch(campaignId, searchBody)

  const voters = isError ? [] : data?.items ?? []
  const hasNextPage = isError ? false : data?.pagination.has_more ?? false
  const hasPreviousPage = prevCursors.length > 0
  const errorMessage =
    error instanceof Error && error.message === "Authentication required"
      ? "Your session expired while loading voters. Sign in again and retry."
      : "Failed to load voters for this campaign."

  const filterUpdate = (partial: Partial<VoterFilter>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
    // Reset pagination when filters change
    setCursor(undefined)
    setPrevCursors([])
  }

  const clearLookup = () => {
    setLookupTerm("")
    setCursor(undefined)
    setPrevCursors([])
  }

  const handleNextPage = () => {
    if (data?.pagination.next_cursor) {
      setPrevCursors((prev) => [...prev, cursor ?? ""])
      setCursor(data.pagination.next_cursor ?? undefined)
    }
  }

  const handlePreviousPage = () => {
    const prev = [...prevCursors]
    const previousCursor = prev.pop()
    setPrevCursors(prev)
    setCursor(previousCursor || undefined)
  }

  const handleSortingChange = (newSorting: SortingState) => {
    setSorting(newSorting)
    // Reset pagination on sort change
    setCursor(undefined)
    setPrevCursors([])
  }

  // Delete voter state
  const [deleteVoter, setDeleteVoter] = useState<Voter | null>(null)
  const deleteVoterMutation = useDeleteVoter(campaignId)

  const handleDelete = async () => {
    if (!deleteVoter) return
    try {
      await deleteVoterMutation.mutateAsync(deleteVoter.id)
    } catch {
      // Error toast is handled by useDeleteVoter's onError
    } finally {
      setDeleteVoter(null)
    }
  }

  const columns = useMemo(() => buildColumns(campaignId, navigate, setDeleteVoter), [campaignId, navigate, setDeleteVoter])

  const filterChips = buildFilterChips(
    activeLookup ? { ...filters, search: activeLookup } : filters,
    filterUpdate,
    clearLookup,
  )

  // + New Voter sheet
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">All Voters</h2>
        <div className="flex items-center gap-2">
          <RequireRole minimum="manager">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              + New Voter
            </Button>
          </RequireRole>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1 space-y-2">
          <Label htmlFor="voter-lookup">Find voters</Label>
          <Input
            id="voter-lookup"
            placeholder="Search by voter name"
            value={lookupTerm}
            onChange={(event) => {
              setLookupTerm(event.target.value)
              setCursor(undefined)
              setPrevCursors([])
            }}
          />
          <p className="text-sm text-muted-foreground">
            Lookup stays inside the current voter search flow and combines with the filters below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lookupTerm && (
            <Button variant="ghost" size="sm" onClick={clearLookup}>
              Clear search
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            Filters {filtersOpen ? "▲" : "▼"}
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <VoterFilterBuilder
          value={filters}
          onChange={(f) => {
            setFilters(f)
            setCursor(undefined)
            setPrevCursors([])
          }}
          campaignId={campaignId}
        />
      )}

      {/* Active filter chips */}
      {filterChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filterChips.map((chip) => (
            <FilterChip key={chip.label} {...chip} />
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({})
              clearLookup()
              setCursor(undefined)
              setPrevCursors([])
            }}
          >
            Clear all
          </Button>
        </div>
      )}

      {activeLookup && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {lookupPending || isFetching
            ? `Searching for "${normalizedLookupInput || activeLookup}"...`
            : voters.length > 0
              ? `Showing ${voters.length} lookup result${voters.length === 1 ? "" : "s"} for "${activeLookup}".`
              : `No lookup results matched "${activeLookup}".`}
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={voters}
        isLoading={isLoading && voters.length === 0}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        onNextPage={handleNextPage}
        onPreviousPage={handlePreviousPage}
        emptyIcon={Users}
        emptyTitle={activeLookup ? "No voters match this lookup" : "No voters yet"}
        emptyDescription={
          activeLookup
            ? "Try a different voter name or clear the lookup to return to the full list."
            : "Import a voter file or add voters manually to get started."
        }
        onRowClick={(voter) =>
          navigate({
            to: "/campaigns/$campaignId/voters/$voterId",
            params: { campaignId, voterId: voter.id },
          })
        }
      />

      {/* New Voter sheet */}
      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New Voter</SheetTitle>
            <SheetDescription>Add a new voter to this campaign.</SheetDescription>
          </SheetHeader>
          <VoterCreateForm
            campaignId={campaignId}
            onSuccess={() => setCreateOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Delete Voter Dialog */}
      <DestructiveConfirmDialog
        open={!!deleteVoter}
        onOpenChange={(open) => {
          if (!open) setDeleteVoter(null)
        }}
        title={`Delete "${[deleteVoter?.first_name, deleteVoter?.last_name].filter(Boolean).join(" ") || "voter"}"?`}
        description="This will permanently remove the voter and all associated data."
        confirmText={[deleteVoter?.first_name, deleteVoter?.last_name].filter(Boolean).join(" ") || "voter"}
        onConfirm={handleDelete}
        isPending={deleteVoterMutation.isPending}
      />
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/")({
  component: VotersPage,
})
