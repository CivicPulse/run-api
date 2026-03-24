import { useEffect, useState } from "react"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { HTTPError } from "ky"
import { Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RequireRole } from "@/components/shared/RequireRole"
import { useFormGuard } from "@/hooks/useFormGuard"
import { usePermissions } from "@/hooks/usePermissions"
import { useCreateVolunteer, useSelfRegister } from "@/hooks/useVolunteers"
import { useAuthStore } from "@/stores/authStore"
import {
  VOLUNTEER_SKILLS,
  VOLUNTEER_STATUSES,
  formatSkillLabel,
} from "@/types/volunteer"

const volunteerRegisterSchema = z.object({
  first_name: z.string().min(1, "First name required"),
  last_name: z.string().min(1, "Last name required"),
  phone: z.string().optional(),
  email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  // Manager-only fields (optional so form validates for volunteers too)
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  notes: z.string().optional(),
  skills: z.array(z.string()),
  status: z.string().optional(),
})

type VolunteerRegisterFormValues = z.infer<typeof volunteerRegisterSchema>

function VolunteerRegisterPage() {
  const { campaignId } = useParams({
    from: "/campaigns/$campaignId/volunteers/register/",
  })
  const navigate = useNavigate()
  const { hasRole } = usePermissions()
  const isManager = hasRole("manager")
  const user = useAuthStore((s) => s.user)

  const createVolunteer = useCreateVolunteer(campaignId)
  const selfRegister = useSelfRegister(campaignId)

  const [preFilled, setPreFilled] = useState(false)
  const [mode, setMode] = useState<"record" | "invite">("record")

  const form = useForm<VolunteerRegisterFormValues>({
    resolver: zodResolver(volunteerRegisterSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      street: "",
      city: "",
      state: "",
      zip_code: "",
      emergency_contact_name: "",
      emergency_contact_phone: "",
      notes: "",
      skills: [],
      status: "pending",
    },
    mode: "onBlur",
  })

  // Pre-fill from auth store for self-registration
  useEffect(() => {
    if (user && !preFilled && !form.formState.isDirty) {
      form.reset({
        first_name: user.profile?.given_name ?? "",
        last_name: user.profile?.family_name ?? "",
        email: user.profile?.email ?? "",
        phone: "",
        street: "",
        city: "",
        state: "",
        zip_code: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        notes: "",
        skills: [],
        status: "pending",
      })
      setPreFilled(true)
    }
  }, [user, preFilled, form])

  useFormGuard({ form })

  const isPending = createVolunteer.isPending || selfRegister.isPending

  const onSubmit = form.handleSubmit(async (data) => {
    // Filter out empty strings to avoid sending them to the backend
    const payload = Object.fromEntries(
      Object.entries(data).filter(([key, v]) => {
        if (key === "skills") return true
        return v !== "" && v !== undefined
      }),
    )

    try {
      if (isManager) {
        if (mode === "invite") {
          // Invite mode: create volunteer record and notify about invite
          const result = await createVolunteer.mutateAsync({
            ...payload,
            send_invite: true,
          } as unknown as Parameters<typeof createVolunteer.mutateAsync>[0])
          form.reset()
          setPreFilled(false)
          setMode("record")
          toast.info(
            "Volunteer created. Email invite feature is coming soon.",
          )
          navigate({
            to: "/campaigns/$campaignId/volunteers/$volunteerId",
            params: { campaignId, volunteerId: result.id },
          })
        } else {
          const result = await createVolunteer.mutateAsync(
            payload as unknown as Parameters<typeof createVolunteer.mutateAsync>[0],
          )
          form.reset()
          setPreFilled(false)
          toast.success("Volunteer created")
          navigate({
            to: "/campaigns/$campaignId/volunteers/$volunteerId",
            params: { campaignId, volunteerId: result.id },
          })
        }
      } else {
        const result = await selfRegister.mutateAsync(
          payload as unknown as Parameters<typeof selfRegister.mutateAsync>[0],
        )
        form.reset()
        setPreFilled(false)
        toast.success("You're registered!")
        navigate({
          to: "/campaigns/$campaignId/volunteers/$volunteerId",
          params: { campaignId, volunteerId: result.id },
        })
      }
    } catch (error) {
      if (
        error instanceof HTTPError &&
        error.response.status === 409
      ) {
        try {
          const body = await error.response.json<{
            volunteer_id?: string
          }>()
          if (body.volunteer_id) {
            toast.info("You're already registered")
            navigate({
              to: "/campaigns/$campaignId/volunteers/$volunteerId",
              params: { campaignId, volunteerId: body.volunteer_id },
            })
          } else {
            toast.error("Already registered")
            navigate({
              to: "/campaigns/$campaignId/volunteers/roster",
              params: { campaignId },
            })
          }
        } catch {
          toast.error("Already registered")
          navigate({
            to: "/campaigns/$campaignId/volunteers/roster",
            params: { campaignId },
          })
        }
      } else {
        toast.error("Failed to register volunteer")
      }
    }
  })

  const selectedSkills = useWatch({ control: form.control, name: "skills" })

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

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold tracking-tight mb-6">
        {isManager ? "Create Volunteer" : "Volunteer Registration"}
      </h2>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Volunteer type toggle (managers only) */}
        <RequireRole minimum="manager">
          <div className="space-y-3 pb-4 border-b">
            <Label className="text-xs font-medium">Volunteer Type</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as "record" | "invite")}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="record" id="mode-record" />
                <Label
                  htmlFor="mode-record"
                  className="text-sm font-normal cursor-pointer"
                >
                  Add volunteer record
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="invite" id="mode-invite" />
                <Label
                  htmlFor="mode-invite"
                  className="text-sm font-normal cursor-pointer"
                >
                  Invite to app
                </Label>
              </div>
            </RadioGroup>
            {mode === "invite" && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  This volunteer will receive an email invitation to access the
                  app. They will be able to log in and use field mode for
                  canvassing and phone banking.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </RequireRole>

        {/* Section 1: Essential fields (all users) */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="first_name" className="text-xs">
                First Name *
              </Label>
              <Input
                id="first_name"
                {...form.register("first_name")}
                placeholder="First name"
                disabled={isPending}
              />
              {form.formState.errors.first_name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.first_name.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="last_name" className="text-xs">
                Last Name *
              </Label>
              <Input
                id="last_name"
                {...form.register("last_name")}
                placeholder="Last name"
                disabled={isPending}
              />
              {form.formState.errors.last_name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.last_name.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone" className="text-xs">
              Phone
            </Label>
            <Input
              id="phone"
              {...form.register("phone")}
              placeholder="Phone number"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              {...form.register("email")}
              placeholder="Email address"
              disabled={isPending}
            />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>
        </div>

        {/* Section 2: Skills checkbox grid (all users) */}
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
                  disabled={isPending}
                />
                <span className="text-sm">{formatSkillLabel(skill)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Section 3: Manager-only fields */}
        <RequireRole minimum="manager">
          <div className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Additional Information
            </h3>

            <div className="space-y-1">
              <Label htmlFor="street" className="text-xs">
                Street
              </Label>
              <Input
                id="street"
                {...form.register("street")}
                placeholder="Street address"
                disabled={isPending}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="city" className="text-xs">
                  City
                </Label>
                <Input
                  id="city"
                  {...form.register("city")}
                  placeholder="City"
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="state" className="text-xs">
                  State
                </Label>
                <Input
                  id="state"
                  {...form.register("state")}
                  placeholder="State"
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="zip_code" className="text-xs">
                  Zip Code
                </Label>
                <Input
                  id="zip_code"
                  {...form.register("zip_code")}
                  placeholder="Zip"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="emergency_contact_name" className="text-xs">
                  Emergency Contact Name
                </Label>
                <Input
                  id="emergency_contact_name"
                  {...form.register("emergency_contact_name")}
                  placeholder="Contact name"
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emergency_contact_phone" className="text-xs">
                  Emergency Contact Phone
                </Label>
                <Input
                  id="emergency_contact_phone"
                  {...form.register("emergency_contact_phone")}
                  placeholder="Contact phone"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes" className="text-xs">
                Notes
              </Label>
              <Textarea
                id="notes"
                {...form.register("notes")}
                placeholder="Additional notes..."
                disabled={isPending}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(v) =>
                  form.setValue("status", v, { shouldDirty: true })
                }
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {VOLUNTEER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </RequireRole>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending
            ? "Submitting..."
            : isManager
              ? "Create Volunteer"
              : "Register"}
        </Button>
      </form>
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/volunteers/register/",
)({
  component: VolunteerRegisterPage,
})
