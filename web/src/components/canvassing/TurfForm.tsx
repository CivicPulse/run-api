import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
}

export function TurfForm({ defaultValues, onSubmit, isPending, submitLabel }: TurfFormProps) {
  const [showGeoJson, setShowGeoJson] = useState(!!defaultValues?.boundary)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TurfFormValues>({
    resolver: zodResolver(turfSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      boundary: defaultValues?.boundary ? JSON.stringify(defaultValues.boundary, null, 2) : "",
    },
  })

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
      {/* Skip link for keyboard users to bypass map area */}
      <a
        href="#turf-form-fields"
        className="sr-only focus:not-sr-only focus:relative focus:block focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring focus:mb-2"
      >
        Skip map, edit turf details
      </a>

      <div id="turf-form-fields" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...register("name")} />
          {errors.name && (
            <p className="text-sm text-destructive" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input id="description" {...register("description")} />
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={showGeoJson}
            aria-controls="geojson-panel"
            onClick={() => setShowGeoJson((prev) => !prev)}
          >
            {showGeoJson ? "Hide GeoJSON editor" : "Edit as GeoJSON"}
          </Button>

          {showGeoJson && (
            <div id="geojson-panel" role="region" aria-label="GeoJSON editor">
              <Label htmlFor="boundary">GeoJSON Polygon</Label>
              <Textarea
                id="boundary"
                rows={6}
                aria-invalid={!!errors.boundary}
                aria-describedby={errors.boundary ? "boundary-error" : undefined}
                {...register("boundary")}
              />
            </div>
          )}

          {errors.boundary && (
            <p
              id="boundary-error"
              className="text-sm text-destructive"
              role="alert"
            >
              {errors.boundary.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  )
}
