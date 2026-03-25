import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Loader2 } from "lucide-react"

interface AddressSearchProps {
  onResult: (lat: number, lng: number) => void
}

export function AddressSearch({ onResult }: AddressSearchProps) {
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setIsSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        {
          headers: {
            "User-Agent": "CivicPulse/1.5 (campaign-tool)",
          },
        },
      )
      const results = await res.json()
      if (results.length > 0) {
        onResult(parseFloat(results[0].lat), parseFloat(results[0].lon))
      }
    } catch {
      // Silently fail -- search is non-critical
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Search address..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            handleSearch()
          }
        }}
        className="flex-1"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Search address"
        onClick={handleSearch}
        disabled={isSearching}
      >
        {isSearching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
