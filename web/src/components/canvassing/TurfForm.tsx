import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TurfMapEditor } from "@/components/canvassing/map/TurfMapEditor"
import { GeoJsonImport } from "@/components/canvassing/map/GeoJsonImport"
import { AddressSearch } from "@/components/canvassing/map/AddressSearch"
import { useTurfOverlaps } from "@/hooks/useTurfs"
import type { TurfResponse } from "@/types/turf"

const turfSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  boundary: z.string().min(1, "Boundary GeoJSON is required"),
})

type TurfFormValues = z.infer<typeof turfSchema>

interface TurfFormProps {
  defaultValues?: TurfResponse
  onSubmit: (data: { name: string; description?: string; boundary: Record<string, unknown> }) => void
  isPending: boolean
  submitLabel: string
  campaignId: string
  turfId?: string
}

export function TurfForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  campaignId,
  turfId,
}: TurfFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searchCenter, setSearchCenter] = useState<{
    lat: number
    lng: number
  } | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TurfFormValues>({
    resolver: zodResolver(turfSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      boundary: defaultValues?.boundary ? JSON.stringify(defaultValues.boundary, null, 2) : "",
    },
  })

  const boundaryValue = watch("boundary")
  const { data: overlaps } = useTurfOverlaps(
    campaignId,
    boundaryValue || null,
    turfId,
  )

  const onFormSubmit = (values: TurfFormValues) => {
    try {
      const boundary = JSON.parse(values.boundary) as Record<string, unknown>
      onSubmit({
        name: values.name,
        description: values.description || undefined,
        boundary,
      })
    } catch {
      // JSON parse error handled by zod refinement below isn't used,
      // but we guard here anyway
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" {...register("description")} />
      </div>
      <div className="space-y-2">
        <Label>Boundary</Label>
        <AddressSearch
          onResult={(lat, lng) => setSearchCenter({ lat, lng })}
        />
        <TurfMapEditor
          value={boundaryValue}
          onChange={(val) =>
            setValue("boundary", val, { shouldValidate: true })
          }
          defaultBoundary={defaultValues?.boundary}
          searchCenter={searchCenter}
          overlaps={overlaps ?? []}
        />
        {errors.boundary && (
          <p className="text-sm text-destructive">
            {errors.boundary.message}
          </p>
        )}
        {overlaps && overlaps.length > 0 && (
          <p className="text-sm text-amber-600">
            Overlaps with: {overlaps.map((o) => o.name).join(", ")}
          </p>
        )}
        <div className="flex items-center justify-between">
          <GeoJsonImport
            onImport={(val) =>
              setValue("boundary", val, { shouldValidate: true })
            }
          />
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-muted-foreground underline"
          >
            {showAdvanced ? "Hide" : "Show"} Advanced JSON
          </button>
        </div>
        {showAdvanced && (
          <Textarea id="boundary" rows={6} {...register("boundary")} />
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  )
}
