import { useState, useMemo } from "react"
import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import type { ColumnDef, SortingState } from "@tanstack/react-table"

import { useVotersQuery, useCreateVoter } from "@/hooks/useVoters"
import { RequireRole } from "@/components/shared/RequireRole"
import { DataTable } from "@/components/shared/DataTable"
import { VoterFilterBuilder } from "@/components/voters/VoterFilterBuilder"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
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
import type { Voter, VoterFilter, VoterCreate } from "@/types/voter"

// ─── Create form schema ───────────────────────────────────────────────────────

const voterSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  party: z.string().optional(),
  address_line1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
})

type VoterFormData = z.infer<typeof voterSchema>

// ─── Active filter chips ──────────────────────────────────────────────────────

interface FilterChipProps {
  label: string
  onDismiss: () => void
}

function FilterChip({ label, onDismiss }: FilterChipProps) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
        aria-label={`Remove ${label} filter`}
      >
        ×
      </button>
    </Badge>
  )
}

function buildFilterChips(
  filters: VoterFilter,
  update: (partial: Partial<VoterFilter>) => void
) {
  const chips: FilterChipProps[] = []

  if (filters.parties && filters.parties.length > 0) {
    chips.push({
      label: `Party: ${filters.parties.join(", ")}`,
      onDismiss: () => update({ parties: undefined }),
    })
  }
  if (filters.age_min !== undefined || filters.age_max !== undefined) {
    chips.push({
      label: `Age: ${filters.age_min ?? ""}–${filters.age_max ?? ""}`,
      onDismiss: () => update({ age_min: undefined, age_max: undefined }),
    })
  }
  if (filters.voted_in && filters.voted_in.length > 0) {
    chips.push({
      label: `Voted in: ${filters.voted_in.join(", ")}`,
      onDismiss: () => update({ voted_in: undefined }),
    })
  }
  if (filters.not_voted_in && filters.not_voted_in.length > 0) {
    chips.push({
      label: `Not voted in: ${filters.not_voted_in.join(", ")}`,
      onDismiss: () => update({ not_voted_in: undefined }),
    })
  }
  if (filters.tags && filters.tags.length > 0) {
    chips.push({
      label: `Tags (all): ${filters.tags.length}`,
      onDismiss: () => update({ tags: undefined }),
    })
  }
  if (filters.city) {
    chips.push({
      label: `City: ${filters.city}`,
      onDismiss: () => update({ city: undefined }),
    })
  }
  if (filters.zip_code) {
    chips.push({
      label: `Zip: ${filters.zip_code}`,
      onDismiss: () => update({ zip_code: undefined }),
    })
  }
  if (filters.state) {
    chips.push({
      label: `State: ${filters.state}`,
      onDismiss: () => update({ state: undefined }),
    })
  }
  if (filters.gender) {
    chips.push({
      label: `Gender: ${filters.gender}`,
      onDismiss: () => update({ gender: undefined }),
    })
  }
  if (filters.precinct) {
    chips.push({
      label: `Precinct: ${filters.precinct}`,
      onDismiss: () => update({ precinct: undefined }),
    })
  }
  if (filters.congressional_district) {
    chips.push({
      label: `CD: ${filters.congressional_district}`,
      onDismiss: () => update({ congressional_district: undefined }),
    })
  }

  return chips
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
      if (v) (payload as Record<string, string>)[k] = v
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
        <Label htmlFor="address_line1">Address</Label>
        <Input id="address_line1" {...register("address_line1")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="city">City</Label>
          <Input id="city" {...register("city")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="state">State</Label>
          <Input id="state" {...register("state")} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="zip_code">Zip Code</Label>
        <Input id="zip_code" {...register("zip_code")} />
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
  navigate: ReturnType<typeof useNavigate>
): ColumnDef<Voter, unknown>[] {
  return [
    {
      id: "full_name",
      header: "Name",
      enableSorting: true,
      cell: ({ row }) => {
        const v = row.original
        const name = [v.first_name, v.last_name].filter(Boolean).join(" ") || "Unknown"
        return (
          <Link
            to="/campaigns/$campaignId/voters/$voterId"
            params={{ campaignId, voterId: v.id }}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {name}
          </Link>
        )
      },
    },
    {
      id: "party",
      header: "Party",
      enableSorting: true,
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
      cell: ({ row }) => row.original.city ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "district",
      header: "District",
      cell: ({ row }) =>
        row.original.congressional_district ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "age",
      header: "Age",
      enableSorting: true,
      cell: ({ row }) =>
        row.original.age ?? <span className="text-muted-foreground">—</span>,
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
              </RequireRole>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
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

  // Cursor-based pagination state
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [prevCursors, setPrevCursors] = useState<string[]>([])

  // Sorting state
  const [sorting, setSorting] = useState<SortingState>([])
  const sortBy = sorting[0]?.id
  const sortDir = sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined

  const { data, isLoading } = useVotersQuery(campaignId, {
    cursor,
    pageSize: 50,
    sortBy,
    sortDir,
    filters,
  })

  const voters = data?.items ?? []
  const hasNextPage = data?.pagination.has_more ?? false
  const hasPreviousPage = prevCursors.length > 0

  const filterUpdate = (partial: Partial<VoterFilter>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
    // Reset pagination when filters change
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

  const columns = useMemo(() => buildColumns(campaignId, navigate), [campaignId, navigate])

  const filterChips = buildFilterChips(filters, filterUpdate)

  // + New Voter sheet
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">All Voters</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Filters {filtersOpen ? "▲" : "▼"}
          </Button>
          <RequireRole minimum="manager">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              + New Voter
            </Button>
          </RequireRole>
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
              setCursor(undefined)
              setPrevCursors([])
            }}
          >
            Clear all
          </Button>
        </div>
      )}

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={voters}
        isLoading={isLoading}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        onNextPage={handleNextPage}
        onPreviousPage={handlePreviousPage}
        emptyIcon={Users}
        emptyTitle="No voters found"
        emptyDescription="Add your first voter or adjust your filters."
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
          </SheetHeader>
          <VoterCreateForm
            campaignId={campaignId}
            onSuccess={() => setCreateOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/")({
  component: VotersPage,
})
