import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ChevronsUpDown } from "lucide-react"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFormGuard } from "@/hooks/useFormGuard"
import { useUpdateVoter } from "@/hooks/useVoters"
import type { Voter } from "@/types/voter"

interface VoterEditSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  voter: Voter
  campaignId: string
}

const editVoterSchema = z.object({
  // Personal
  first_name: z.string().optional(),
  middle_name: z.string().optional(),
  last_name: z.string().optional(),
  suffix: z.string().optional(),
  date_of_birth: z.string().optional(),
  party: z.string().optional(),
  gender: z.string().optional(),
  ethnicity: z.string().optional(),
  spoken_language: z.string().optional(),
  marital_status: z.string().optional(),
  military_status: z.string().optional(),

  // Registration Address
  registration_line1: z.string().optional(),
  registration_line2: z.string().optional(),
  registration_city: z.string().optional(),
  registration_state: z.string().optional(),
  registration_zip: z.string().optional(),
  registration_zip4: z.string().optional(),
  registration_county: z.string().optional(),
  registration_apartment_type: z.string().optional(),

  // Mailing Address
  mailing_line1: z.string().optional(),
  mailing_line2: z.string().optional(),
  mailing_city: z.string().optional(),
  mailing_state: z.string().optional(),
  mailing_zip: z.string().optional(),
  mailing_zip4: z.string().optional(),
  mailing_country: z.string().optional(),
  mailing_type: z.string().optional(),
})

type EditVoterFormValues = z.infer<typeof editVoterSchema>

const PARTY_OPTIONS = [
  { value: "DEM", label: "Democrat" },
  { value: "REP", label: "Republican" },
  { value: "IND", label: "Independent" },
  { value: "LIB", label: "Libertarian" },
  { value: "GRN", label: "Green" },
  { value: "NPA", label: "No Party Affiliation" },
  { value: "OTH", label: "Other" },
]

const GENDER_OPTIONS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "NB", label: "Non-binary" },
  { value: "O", label: "Other" },
  { value: "U", label: "Unknown" },
]

const NONE_VALUE = "__none__"

function buildDefaults(voter: Voter): EditVoterFormValues {
  return {
    first_name: voter.first_name ?? "",
    middle_name: voter.middle_name ?? "",
    last_name: voter.last_name ?? "",
    suffix: voter.suffix ?? "",
    date_of_birth: voter.date_of_birth ?? "",
    party: voter.party ?? "",
    gender: voter.gender ?? "",
    ethnicity: voter.ethnicity ?? "",
    spoken_language: voter.spoken_language ?? "",
    marital_status: voter.marital_status ?? "",
    military_status: voter.military_status ?? "",

    registration_line1: voter.registration_line1 ?? "",
    registration_line2: voter.registration_line2 ?? "",
    registration_city: voter.registration_city ?? "",
    registration_state: voter.registration_state ?? "",
    registration_zip: voter.registration_zip ?? "",
    registration_zip4: voter.registration_zip4 ?? "",
    registration_county: voter.registration_county ?? "",
    registration_apartment_type: voter.registration_apartment_type ?? "",

    mailing_line1: voter.mailing_line1 ?? "",
    mailing_line2: voter.mailing_line2 ?? "",
    mailing_city: voter.mailing_city ?? "",
    mailing_state: voter.mailing_state ?? "",
    mailing_zip: voter.mailing_zip ?? "",
    mailing_zip4: voter.mailing_zip4 ?? "",
    mailing_country: voter.mailing_country ?? "",
    mailing_type: voter.mailing_type ?? "",
  }
}

/** Returns true if any mailing address field has a value. */
function hasMailingData(voter: Voter): boolean {
  return !!(
    voter.mailing_line1 ||
    voter.mailing_line2 ||
    voter.mailing_city ||
    voter.mailing_state ||
    voter.mailing_zip ||
    voter.mailing_zip4 ||
    voter.mailing_country ||
    voter.mailing_type
  )
}

export function VoterEditSheet({ open, onOpenChange, voter, campaignId }: VoterEditSheetProps) {
  const updateVoter = useUpdateVoter(campaignId, voter.id)
  const [mailingOpen, setMailingOpen] = useState(hasMailingData(voter))

  const form = useForm<EditVoterFormValues>({
    resolver: zodResolver(editVoterSchema),
    defaultValues: buildDefaults(voter),
    mode: "onBlur",
  })

  // Reset form when voter data changes or sheet opens
  useEffect(() => {
    if (open) {
      form.reset(buildDefaults(voter))
      setMailingOpen(hasMailingData(voter))
    }
  }, [open, voter, form])

  // Block route navigation when form is dirty
  const { isBlocked, proceed, reset: resetBlock } = useFormGuard({ form })

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      // Filter out empty strings
      const payload = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== "" && v !== undefined),
      )
      await updateVoter.mutateAsync(payload)
      toast.success("Voter updated")
      form.reset(data)
      onOpenChange(false)
    } catch {
      toast.error("Failed to update voter")
    }
  })

  // Show blocker UI if navigation was attempted while form is dirty
  if (isBlocked) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
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
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Voter</SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-6 mt-4">
          {/* Section 1: Personal */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Separator className="flex-1" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Personal
              </span>
              <Separator className="flex-1" />
            </div>
            <div className="space-y-4">
              {/* Row 1: First Name | Middle Name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="first_name" className="text-xs">First Name</Label>
                  <Input
                    id="first_name"
                    {...form.register("first_name")}
                    placeholder="First name"
                    disabled={updateVoter.isPending}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="middle_name" className="text-xs">Middle Name</Label>
                  <Input
                    id="middle_name"
                    {...form.register("middle_name")}
                    placeholder="Middle name"
                    disabled={updateVoter.isPending}
                  />
                </div>
              </div>

              {/* Row 2: Last Name | Suffix */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="last_name" className="text-xs">Last Name</Label>
                  <Input
                    id="last_name"
                    {...form.register("last_name")}
                    placeholder="Last name"
                    disabled={updateVoter.isPending}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="suffix" className="text-xs">Suffix</Label>
                  <Input
                    id="suffix"
                    {...form.register("suffix")}
                    placeholder="Jr., Sr., III"
                    disabled={updateVoter.isPending}
                  />
                </div>
              </div>

              {/* Row 3: Date of Birth */}
              <div className="space-y-1">
                <Label htmlFor="date_of_birth" className="text-xs">Date of Birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  {...form.register("date_of_birth")}
                  disabled={updateVoter.isPending}
                />
              </div>

              {/* Row 4: Party */}
              <div className="space-y-1">
                <Label className="text-xs">Party</Label>
                <Select
                  value={form.watch("party") || NONE_VALUE}
                  onValueChange={(v) => form.setValue("party", v === NONE_VALUE ? "" : v, { shouldDirty: true })}
                  disabled={updateVoter.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select party..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Unknown</SelectItem>
                    {PARTY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Row 5: Gender */}
              <div className="space-y-1">
                <Label className="text-xs">Gender</Label>
                <Select
                  value={form.watch("gender") || NONE_VALUE}
                  onValueChange={(v) => form.setValue("gender", v === NONE_VALUE ? "" : v, { shouldDirty: true })}
                  disabled={updateVoter.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Unknown</SelectItem>
                    {GENDER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Row 6: Ethnicity */}
              <div className="space-y-1">
                <Label htmlFor="ethnicity" className="text-xs">Ethnicity</Label>
                <Input
                  id="ethnicity"
                  {...form.register("ethnicity")}
                  placeholder="Ethnicity"
                  disabled={updateVoter.isPending}
                />
              </div>

              {/* Row 7: Language */}
              <div className="space-y-1">
                <Label htmlFor="spoken_language" className="text-xs">Language</Label>
                <Input
                  id="spoken_language"
                  {...form.register("spoken_language")}
                  placeholder="Language"
                  disabled={updateVoter.isPending}
                />
              </div>

              {/* Row 8: Marital Status */}
              <div className="space-y-1">
                <Label htmlFor="marital_status" className="text-xs">Marital Status</Label>
                <Input
                  id="marital_status"
                  {...form.register("marital_status")}
                  placeholder="Marital status"
                  disabled={updateVoter.isPending}
                />
              </div>

              {/* Row 9: Military Status */}
              <div className="space-y-1">
                <Label htmlFor="military_status" className="text-xs">Military Status</Label>
                <Input
                  id="military_status"
                  {...form.register("military_status")}
                  placeholder="Military status"
                  disabled={updateVoter.isPending}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Registration Address */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Separator className="flex-1" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Registration Address
              </span>
              <Separator className="flex-1" />
            </div>
            <div className="space-y-4">
              {/* Line 1 */}
              <div className="space-y-1">
                <Label htmlFor="registration_line1" className="text-xs">Line 1</Label>
                <Input
                  id="registration_line1"
                  {...form.register("registration_line1")}
                  placeholder="Street address"
                  disabled={updateVoter.isPending}
                />
              </div>

              {/* Line 2 */}
              <div className="space-y-1">
                <Label htmlFor="registration_line2" className="text-xs">Line 2</Label>
                <Input
                  id="registration_line2"
                  {...form.register("registration_line2")}
                  placeholder="Apt, suite, unit"
                  disabled={updateVoter.isPending}
                />
              </div>

              {/* City | State */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="registration_city" className="text-xs">City</Label>
                  <Input
                    id="registration_city"
                    {...form.register("registration_city")}
                    placeholder="City"
                    disabled={updateVoter.isPending}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="registration_state" className="text-xs">State</Label>
                  <Input
                    id="registration_state"
                    {...form.register("registration_state")}
                    placeholder="State"
                    disabled={updateVoter.isPending}
                  />
                </div>
              </div>

              {/* ZIP | ZIP+4 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="registration_zip" className="text-xs">ZIP</Label>
                  <Input
                    id="registration_zip"
                    {...form.register("registration_zip")}
                    placeholder="ZIP code"
                    disabled={updateVoter.isPending}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="registration_zip4" className="text-xs">ZIP+4</Label>
                  <Input
                    id="registration_zip4"
                    {...form.register("registration_zip4")}
                    placeholder="ZIP+4"
                    disabled={updateVoter.isPending}
                  />
                </div>
              </div>

              {/* County */}
              <div className="space-y-1">
                <Label htmlFor="registration_county" className="text-xs">County</Label>
                <Input
                  id="registration_county"
                  {...form.register("registration_county")}
                  placeholder="County"
                  disabled={updateVoter.isPending}
                />
              </div>

              {/* Apartment Type */}
              <div className="space-y-1">
                <Label htmlFor="registration_apartment_type" className="text-xs">Apartment Type</Label>
                <Input
                  id="registration_apartment_type"
                  {...form.register("registration_apartment_type")}
                  placeholder="Apartment type"
                  disabled={updateVoter.isPending}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Mailing Address (Collapsible) */}
          <Collapsible open={mailingOpen} onOpenChange={setMailingOpen}>
            <div className="flex items-center gap-2 mb-3">
              <Separator className="flex-1" />
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                  {mailingOpen ? "Mailing Address" : "+ Add Mailing Address"}
                  <ChevronsUpDown className="size-3" />
                </button>
              </CollapsibleTrigger>
              <Separator className="flex-1" />
            </div>
            <CollapsibleContent forceMount className="data-[state=closed]:hidden">
              <div className="space-y-4">
                {/* Line 1 */}
                <div className="space-y-1">
                  <Label htmlFor="mailing_line1" className="text-xs">Line 1</Label>
                  <Input
                    id="mailing_line1"
                    {...form.register("mailing_line1")}
                    placeholder="Street address"
                    disabled={updateVoter.isPending}
                  />
                </div>

                {/* Line 2 */}
                <div className="space-y-1">
                  <Label htmlFor="mailing_line2" className="text-xs">Line 2</Label>
                  <Input
                    id="mailing_line2"
                    {...form.register("mailing_line2")}
                    placeholder="Apt, suite, unit"
                    disabled={updateVoter.isPending}
                  />
                </div>

                {/* City | State */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="mailing_city" className="text-xs">City</Label>
                    <Input
                      id="mailing_city"
                      {...form.register("mailing_city")}
                      placeholder="City"
                      disabled={updateVoter.isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mailing_state" className="text-xs">State</Label>
                    <Input
                      id="mailing_state"
                      {...form.register("mailing_state")}
                      placeholder="State"
                      disabled={updateVoter.isPending}
                    />
                  </div>
                </div>

                {/* ZIP | ZIP+4 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="mailing_zip" className="text-xs">ZIP</Label>
                    <Input
                      id="mailing_zip"
                      {...form.register("mailing_zip")}
                      placeholder="ZIP code"
                      disabled={updateVoter.isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mailing_zip4" className="text-xs">ZIP+4</Label>
                    <Input
                      id="mailing_zip4"
                      {...form.register("mailing_zip4")}
                      placeholder="ZIP+4"
                      disabled={updateVoter.isPending}
                    />
                  </div>
                </div>

                {/* Country */}
                <div className="space-y-1">
                  <Label htmlFor="mailing_country" className="text-xs">Country</Label>
                  <Input
                    id="mailing_country"
                    {...form.register("mailing_country")}
                    placeholder="Country"
                    disabled={updateVoter.isPending}
                  />
                </div>

                {/* Type */}
                <div className="space-y-1">
                  <Label htmlFor="mailing_type" className="text-xs">Type</Label>
                  <Input
                    id="mailing_type"
                    {...form.register("mailing_type")}
                    placeholder="Mailing type"
                    disabled={updateVoter.isPending}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Button
            type="submit"
            className="w-full"
            disabled={updateVoter.isPending || !form.formState.isDirty}
          >
            {updateVoter.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
