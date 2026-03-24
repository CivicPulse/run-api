import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"
import { toast } from "sonner"

interface GeoJsonImportProps {
  onImport: (geojsonString: string) => void
}

export function GeoJsonImport({ onImport }: GeoJsonImportProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const geojson = JSON.parse(evt.target?.result as string)
        // Handle Feature, FeatureCollection, or raw Geometry
        const geometry =
          geojson.type === "FeatureCollection"
            ? geojson.features[0]?.geometry
            : geojson.type === "Feature"
              ? geojson.geometry
              : geojson

        if (!geometry || geometry.type !== "Polygon") {
          toast.error("Only Polygon geometries are supported")
          return
        }

        onImport(JSON.stringify(geometry, null, 2))
        toast.success("GeoJSON imported — preview on map")
      } catch {
        toast.error("Invalid GeoJSON file")
      }
    }
    reader.readAsText(file)

    // Reset input so same file can be re-imported
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".geojson,.json"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-1 h-4 w-4" /> Import GeoJSON
      </Button>
    </>
  )
}
