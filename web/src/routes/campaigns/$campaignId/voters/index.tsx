import { useState, useEffect, useMemo } from "react"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useVoters } from "@/hooks/useVoters"
import type { VoterFilter } from "@/types/voter"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

const PARTY_OPTIONS = [
  { label: "All Parties", value: "__all__" },
  { label: "Democrat", value: "Democrat" },
  { label: "Republican", value: "Republican" },
  { label: "Independent", value: "Independent" },
  { label: "Libertarian", value: "Libertarian" },
  { label: "Green", value: "Green" },
  { label: "Other", value: "Other" },
]

function VotersPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/voters/",
  })
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState("")
  const [party, setParty] = useState<string | undefined>(undefined)
  const [city, setCity] = useState("")

  const debouncedSearch = useDebounced(searchInput, 300)
  const debouncedCity = useDebounced(city, 300)

  const filters: VoterFilter = useMemo(() => {
    const f: VoterFilter = {}
    if (debouncedSearch) f.search = debouncedSearch
    if (party) f.party = party
    if (debouncedCity) f.city = debouncedCity
    return f
  }, [debouncedSearch, party, debouncedCity])

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useVoters(campaignId, filters)

  const voters = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Voters</h2>
        <p className="text-sm text-muted-foreground">
          Search and manage voter records
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search voters..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={party ?? "__all__"}
          onValueChange={(v) => setParty(v === "__all__" ? undefined : v)}
        >
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="Party" />
          </SelectTrigger>
          <SelectContent>
            {PARTY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter by city..."
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="sm:max-w-[200px]"
        />
      </div>

      {/* Results table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>City / State</TableHead>
                  <TableHead>Precinct</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {voters.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-8"
                    >
                      No voters found
                    </TableCell>
                  </TableRow>
                ) : (
                  voters.map((voter) => {
                    const name = [voter.first_name, voter.last_name]
                      .filter(Boolean)
                      .join(" ") || "Unknown"
                    const location = [voter.city, voter.state]
                      .filter(Boolean)
                      .join(", ") || "-"

                    return (
                      <TableRow
                        key={voter.id}
                        className="cursor-pointer"
                        onClick={() =>
                          navigate({
                            to: "/campaigns/$campaignId/voters/$voterId",
                            params: { campaignId, voterId: voter.id },
                          })
                        }
                      >
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell>{voter.party ?? "-"}</TableCell>
                        <TableCell>{location}</TableCell>
                        <TableCell>{voter.precinct ?? "-"}</TableCell>
                        <TableCell className="text-right">
                          {voter.age ?? "-"}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading..." : "Load More"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/")({
  component: VotersPage,
})
