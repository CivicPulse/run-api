import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFormGuard } from "@/hooks/useFormGuard"
import { useCreateShift, useUpdateShift } from "@/hooks/useShifts"
import { useTurfs, usePhoneBankSessions } from "@/hooks/useFieldOps"
import { SHIFT_TYPES, shiftTypeLabel } from "@/types/shift"
import type { ShiftCreate } from "@/types/shift"
import type { Shift } from "@/types/field-ops"

interface ShiftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editShift?: Shift
  campaignId: string
}

const shiftFormSchema = z
  .object({
    name: z
      .string()
      .min(3, "Name must be at least 3 characters")
      .max(100, "Name must be 100 characters or fewer"),
    type: z.enum(SHIFT_TYPES, {
      required_error: "Type is required",
    }),
    start_at: z.string().min(1, "Start date/time is required"),
    end_at: z.string().min(1, "End date/time is required"),
    max_volunteers: z.coerce
      .number({ invalid_type_error: "Must be a number" })
      .int("Must be a whole number")
      .min(1, "Must be at least 1"),
    description: z.string().optional(),
    location_name: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip_code: z.string().optional(),
    turf_id: z.string().optional(),
    phone_bank_session_id: z.string().optional(),
  })
  .refine(
    (data) => {
      if (!data.start_at || !data.end_at) return true
      return new Date(data.end_at) > new Date(data.start_at)
    },
    {
      message: "End time must be after start time",
      path: ["end_at"],
    },
  )

type ShiftFormValues = z.infer<typeof shiftFormSchema>

const NONE_VALUE = "__none__"

export function ShiftDialog({
  open,
  onOpenChange,
  editShift,
  campaignId,
}: ShiftDialogProps) {
  const isEdit = !!editShift

  const createShift = useCreateShift(campaignId)
  const updateShift = useUpdateShift(campaignId, editShift?.id ?? "")

  const { data: turfsData } = useTurfs(campaignId)
  const turfs = turfsData?.items ?? []

  const { data: sessionsData } = usePhoneBankSessions(campaignId)
  const sessions = sessionsData?.items ?? []

  const form = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues: {
      name: editShift?.name ?? "",
      type: (editShift?.type as ShiftFormValues["type"]) ?? "general",
      start_at: editShift?.start_at ? editShift.start_at.slice(0, 16) : "",
      end_at: editShift?.end_at ? editShift.end_at.slice(0, 16) : "",
      max_volunteers: editShift?.max_volunteers ?? 1,
      description: editShift?.description ?? "",
      location_name: editShift?.location_name ?? "",
      street: editShift?.street ?? "",
      city: editShift?.city ?? "",
      state: editShift?.state ?? "",
      zip_code: editShift?.zip_code ?? "",
      turf_id: editShift?.turf_id ?? "",
      phone_bank_session_id: editShift?.phone_bank_session_id ?? "",
    },
    mode: "onBlur",
  })

  // Reset form when sheet opens or editShift changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: editShift?.name ?? "",
        type: (editShift?.type as ShiftFormValues["type"]) ?? "general",
        start_at: editShift?.start_at ? editShift.start_at.slice(0, 16) : "",
        end_at: editShift?.end_at ? editShift.end_at.slice(0, 16) : "",
        max_volunteers: editShift?.max_volunteers ?? 1,
        description: editShift?.description ?? "",
        location_name: editShift?.location_name ?? "",
        street: editShift?.street ?? "",
        city: editShift?.city ?? "",
        state: editShift?.state ?? "",
        zip_code: editShift?.zip_code ?? "",
        turf_id: editShift?.turf_id ?? "",
        phone_bank_session_id: editShift?.phone_bank_session_id ?? "",
      })
    }
  }, [open, editShift, form])

  const { isBlocked, proceed, reset: resetBlock } = useFormGuard({ form })

  const isPending = createShift.isPending || updateShift.isPending

  const onSubmit = form.handleSubmit(async (data) => {
    // Build payload, filtering empty optional strings
    const payload: ShiftCreate = {
      name: data.name,
      type: data.type,
      start_at: new Date(data.start_at).toISOString(),
      end_at: new Date(data.end_at).toISOString(),
      max_volunteers: data.max_volunteers,
    }
    if (data.description) payload.description = data.description
    if (data.location_name) payload.location_name = data.location_name
    if (data.street) payload.street = data.street
    if (data.city) payload.city = data.city
    if (data.state) payload.state = data.state
    if (data.zip_code) payload.zip_code = data.zip_code
    if (data.turf_id) payload.turf_id = data.turf_id
    if (data.phone_bank_session_id)
      payload.phone_bank_session_id = data.phone_bank_session_id

    try {
      if (isEdit) {
        await updateShift.mutateAsync(payload)
        toast.success("Shift updated")
      } else {
        await createShift.mutateAsync(payload)
        toast.success("Shift created")
      }
      form.reset()
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? "Failed to update shift" : "Failed to create shift")
    }
  })

  // Show blocker UI if navigation was attempted while form is dirty
  if (isBlocked) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Unsaved Changes</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              You have unsaved changes. Are you sure you want to leave?
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={proceed}>
                Leave without saving
              </Button>
              <Button variant="outline" size="sm" onClick={resetBlock}>
                Stay and keep editing
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Shift" : "Create Shift"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 mt-4 px-4">
          {/* Name */}
          <div className="space-y-1">
            <Label htmlFor="shift_name" className="text-xs">
              Name
            </Label>
            <Input
              id="shift_name"
              {...form.register("name")}
              placeholder="e.g. Saturday Canvass"
              disabled={isPending}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Type */}
          <div className="space-y-1">
            <Label htmlFor="shift_type" className="text-xs">
              Type
            </Label>
            <Select
              value={form.watch("type")}
              onValueChange={(val) =>
                form.setValue("type", val as ShiftFormValues["type"], {
                  shouldDirty: true,
                })
              }
              disabled={isPending}
            >
              <SelectTrigger id="shift_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {SHIFT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {shiftTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.type && (
              <p className="text-xs text-destructive">
                {form.formState.errors.type.message}
              </p>
            )}
          </div>

          {/* Date/Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="shift_start" className="text-xs">
                Start
              </Label>
              <Input
                id="shift_start"
                type="datetime-local"
                {...form.register("start_at")}
                disabled={isPending}
              />
              {form.formState.errors.start_at && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.start_at.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="shift_end" className="text-xs">
                End
              </Label>
              <Input
                id="shift_end"
                type="datetime-local"
                {...form.register("end_at")}
                disabled={isPending}
              />
              {form.formState.errors.end_at && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.end_at.message}
                </p>
              )}
            </div>
          </div>

          {/* Max Volunteers */}
          <div className="space-y-1">
            <Label htmlFor="shift_max" className="text-xs">
              Max Volunteers
            </Label>
            <Input
              id="shift_max"
              type="number"
              min={1}
              {...form.register("max_volunteers")}
              disabled={isPending}
            />
            {form.formState.errors.max_volunteers && (
              <p className="text-xs text-destructive">
                {form.formState.errors.max_volunteers.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="shift_desc" className="text-xs">
              Description{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="shift_desc"
              {...form.register("description")}
              placeholder="Shift details..."
              disabled={isPending}
            />
          </div>

          {/* Location */}
          <div className="space-y-1">
            <Label htmlFor="shift_loc" className="text-xs">
              Location Name{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="shift_loc"
              {...form.register("location_name")}
              placeholder="e.g. Community Center"
              disabled={isPending}
            />
          </div>

          {/* Address */}
          <div className="space-y-1">
            <Label htmlFor="shift_street" className="text-xs">
              Street{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="shift_street"
              {...form.register("street")}
              placeholder="Street address"
              disabled={isPending}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="shift_city" className="text-xs">
                City
              </Label>
              <Input
                id="shift_city"
                {...form.register("city")}
                placeholder="City"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shift_state" className="text-xs">
                State
              </Label>
              <Input
                id="shift_state"
                {...form.register("state")}
                placeholder="State"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shift_zip" className="text-xs">
                Zip Code
              </Label>
              <Input
                id="shift_zip"
                {...form.register("zip_code")}
                placeholder="Zip"
                disabled={isPending}
              />
            </div>
          </div>

          {/* Turf selector */}
          <div className="space-y-1">
            <Label htmlFor="shift_turf" className="text-xs">
              Turf{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Select
              value={form.watch("turf_id") || NONE_VALUE}
              onValueChange={(val) =>
                form.setValue("turf_id", val === NONE_VALUE ? "" : val, {
                  shouldDirty: true,
                })
              }
              disabled={isPending}
            >
              <SelectTrigger id="shift_turf">
                <SelectValue placeholder="Select turf" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None</SelectItem>
                {turfs.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Phone Bank Session selector */}
          <div className="space-y-1">
            <Label htmlFor="shift_session" className="text-xs">
              Phone Bank Session{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Select
              value={form.watch("phone_bank_session_id") || NONE_VALUE}
              onValueChange={(val) =>
                form.setValue(
                  "phone_bank_session_id",
                  val === NONE_VALUE ? "" : val,
                  { shouldDirty: true },
                )
              }
              disabled={isPending}
            >
              <SelectTrigger id="shift_session">
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None</SelectItem>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SheetFooter className="px-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.formState.isDirty}
            >
              {isPending
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save Changes"
                  : "Create Shift"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
