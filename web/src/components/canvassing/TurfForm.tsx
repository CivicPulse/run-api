import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TurfMapEditor } from "@/components/canvassing/map/TurfMapEditor"
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
  const [showAdvanced, setShowAdvanced] = useState(false)

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
        <TurfMapEditor
          value={watch("boundary")}
          onChange={(val) => setValue("boundary", val, { shouldValidate: true })}
          defaultBoundary={defaultValues?.boundary}
        />
        {errors.boundary && <p className="text-sm text-destructive">{errors.boundary.message}</p>}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-muted-foreground underline"
        >
          {showAdvanced ? "Hide" : "Show"} Advanced JSON
        </button>
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
