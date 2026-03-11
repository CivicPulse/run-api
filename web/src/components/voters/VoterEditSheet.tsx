import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  party: z.string().optional(),
  gender: z.string().optional(),
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

export function VoterEditSheet({ open, onOpenChange, voter, campaignId }: VoterEditSheetProps) {
  const updateVoter = useUpdateVoter(campaignId, voter.id)

  const form = useForm<EditVoterFormValues>({
    resolver: zodResolver(editVoterSchema),
    defaultValues: {
      first_name: voter.first_name ?? "",
      last_name: voter.last_name ?? "",
      date_of_birth: voter.date_of_birth ?? "",
      party: voter.party ?? "",
      gender: voter.gender ?? "",
    },
    mode: "onBlur",
  })

  // Reset form when voter data changes or sheet opens
  useEffect(() => {
    if (open) {
      form.reset({
        first_name: voter.first_name ?? "",
        last_name: voter.last_name ?? "",
        date_of_birth: voter.date_of_birth ?? "",
        party: voter.party ?? "",
        gender: voter.gender ?? "",
      })
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
          <SheetTitle>Edit Voter</SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 mt-4">
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
              <Label htmlFor="last_name" className="text-xs">Last Name</Label>
              <Input
                id="last_name"
                {...form.register("last_name")}
                placeholder="Last name"
                disabled={updateVoter.isPending}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="date_of_birth" className="text-xs">Date of Birth</Label>
            <Input
              id="date_of_birth"
              type="date"
              {...form.register("date_of_birth")}
              disabled={updateVoter.isPending}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Party</Label>
            <Select
              value={form.watch("party")}
              onValueChange={(v) => form.setValue("party", v, { shouldDirty: true })}
              disabled={updateVoter.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select party..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unknown</SelectItem>
                {PARTY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Gender</Label>
            <Select
              value={form.watch("gender")}
              onValueChange={(v) => form.setValue("gender", v, { shouldDirty: true })}
              disabled={updateVoter.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select gender..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unknown</SelectItem>
                {GENDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
