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
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { useFormGuard } from "@/hooks/useFormGuard"
import { useUpdateVolunteer } from "@/hooks/useVolunteers"
import { VOLUNTEER_SKILLS, formatSkillLabel } from "@/types/volunteer"
import type { VolunteerDetailResponse } from "@/types/volunteer"

interface VolunteerEditSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  volunteer: VolunteerDetailResponse
  campaignId: string
}

const editVolunteerSchema = z.object({
  first_name: z.string().min(1, "First name required"),
  last_name: z.string().min(1, "Last name required"),
  phone: z.string().optional(),
  email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  notes: z.string().optional(),
  skills: z.array(z.string()).default([]),
})

type EditVolunteerFormValues = z.infer<typeof editVolunteerSchema>

export function VolunteerEditSheet({
  open,
  onOpenChange,
  volunteer,
  campaignId,
}: VolunteerEditSheetProps) {
  const updateVolunteer = useUpdateVolunteer(campaignId, volunteer.id)

  const form = useForm<EditVolunteerFormValues>({
    resolver: zodResolver(editVolunteerSchema),
    defaultValues: {
      first_name: volunteer.first_name ?? "",
      last_name: volunteer.last_name ?? "",
      phone: volunteer.phone ?? "",
      email: volunteer.email ?? "",
      street: volunteer.street ?? "",
      city: volunteer.city ?? "",
      state: volunteer.state ?? "",
      zip_code: volunteer.zip_code ?? "",
      emergency_contact_name: volunteer.emergency_contact_name ?? "",
      emergency_contact_phone: volunteer.emergency_contact_phone ?? "",
      notes: volunteer.notes ?? "",
      skills: volunteer.skills ?? [],
    },
    mode: "onBlur",
  })

  // Reset form when sheet opens or volunteer data changes
  useEffect(() => {
    if (open) {
      form.reset({
        first_name: volunteer.first_name ?? "",
        last_name: volunteer.last_name ?? "",
        phone: volunteer.phone ?? "",
        email: volunteer.email ?? "",
        street: volunteer.street ?? "",
        city: volunteer.city ?? "",
        state: volunteer.state ?? "",
        zip_code: volunteer.zip_code ?? "",
        emergency_contact_name: volunteer.emergency_contact_name ?? "",
        emergency_contact_phone: volunteer.emergency_contact_phone ?? "",
        notes: volunteer.notes ?? "",
        skills: volunteer.skills ?? [],
      })
    }
  }, [open, volunteer, form])

  const { isBlocked, proceed, reset: resetBlock } = useFormGuard({ form })

  const selectedSkills = form.watch("skills")

  const toggleSkill = (skill: string) => {
    const current = form.getValues("skills")
    if (current.includes(skill)) {
      form.setValue(
        "skills",
        current.filter((s) => s !== skill),
        { shouldDirty: true },
      )
    } else {
      form.setValue("skills", [...current, skill], { shouldDirty: true })
    }
  }

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      // Filter out empty strings
      const payload = Object.fromEntries(
        Object.entries(data).filter(([key, v]) => {
          if (key === "skills") return true
          return v !== "" && v !== undefined
        }),
      )
      await updateVolunteer.mutateAsync(payload)
      toast.success("Volunteer updated")
      form.reset(data)
      onOpenChange(false)
    } catch {
      toast.error("Failed to update volunteer")
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
          <SheetTitle>Edit Volunteer</SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 mt-4 px-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit_first_name" className="text-xs">
                First Name
              </Label>
              <Input
                id="edit_first_name"
                {...form.register("first_name")}
                placeholder="First name"
                disabled={updateVolunteer.isPending}
              />
              {form.formState.errors.first_name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.first_name.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit_last_name" className="text-xs">
                Last Name
              </Label>
              <Input
                id="edit_last_name"
                {...form.register("last_name")}
                placeholder="Last name"
                disabled={updateVolunteer.isPending}
              />
              {form.formState.errors.last_name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.last_name.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit_phone" className="text-xs">
              Phone
            </Label>
            <Input
              id="edit_phone"
              {...form.register("phone")}
              placeholder="Phone number"
              disabled={updateVolunteer.isPending}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit_email" className="text-xs">
              Email
            </Label>
            <Input
              id="edit_email"
              type="email"
              {...form.register("email")}
              placeholder="Email address"
              disabled={updateVolunteer.isPending}
            />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit_street" className="text-xs">
              Street
            </Label>
            <Input
              id="edit_street"
              {...form.register("street")}
              placeholder="Street address"
              disabled={updateVolunteer.isPending}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit_city" className="text-xs">
                City
              </Label>
              <Input
                id="edit_city"
                {...form.register("city")}
                placeholder="City"
                disabled={updateVolunteer.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit_state" className="text-xs">
                State
              </Label>
              <Input
                id="edit_state"
                {...form.register("state")}
                placeholder="State"
                disabled={updateVolunteer.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit_zip_code" className="text-xs">
                Zip Code
              </Label>
              <Input
                id="edit_zip_code"
                {...form.register("zip_code")}
                placeholder="Zip"
                disabled={updateVolunteer.isPending}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit_emergency_name" className="text-xs">
                Emergency Contact Name
              </Label>
              <Input
                id="edit_emergency_name"
                {...form.register("emergency_contact_name")}
                placeholder="Contact name"
                disabled={updateVolunteer.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit_emergency_phone" className="text-xs">
                Emergency Contact Phone
              </Label>
              <Input
                id="edit_emergency_phone"
                {...form.register("emergency_contact_phone")}
                placeholder="Contact phone"
                disabled={updateVolunteer.isPending}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit_notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="edit_notes"
              {...form.register("notes")}
              placeholder="Additional notes..."
              disabled={updateVolunteer.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Skills</Label>
            <div className="grid grid-cols-2 gap-2">
              {VOLUNTEER_SKILLS.map((skill) => (
                <label
                  key={skill}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedSkills.includes(skill)}
                    onCheckedChange={() => toggleSkill(skill)}
                    disabled={updateVolunteer.isPending}
                  />
                  <span className="text-sm">{formatSkillLabel(skill)}</span>
                </label>
              ))}
            </div>
          </div>

          <SheetFooter className="px-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateVolunteer.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateVolunteer.isPending || !form.formState.isDirty}
            >
              {updateVolunteer.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
