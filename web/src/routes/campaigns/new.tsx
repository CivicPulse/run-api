import { useState, useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useForm, Controller } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Check, Loader2 } from "lucide-react"
import { TooltipIcon } from "@/components/shared/TooltipIcon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/api/client"
import { useFormGuard } from "@/hooks/useFormGuard"
import { useOrgMembers, useAddMemberToCampaign } from "@/hooks/useOrg"
import { useOrgPermissions } from "@/hooks/useOrgPermissions"
import { useAuthStore } from "@/stores/authStore"
import type { Campaign, CampaignType } from "@/types/campaign"

const campaignTypes: { value: CampaignType; label: string }[] = [
  { value: "federal", label: "Federal" },
  { value: "state", label: "State" },
  { value: "local", label: "Local" },
  { value: "ballot", label: "Ballot" },
]

const campaignRoles = [
  { value: "viewer", label: "Viewer" },
  { value: "volunteer", label: "Volunteer" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
]

const wizardSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(100),
  type: z.enum(["federal", "state", "local", "ballot"]),
  candidate_name: z.string().optional().or(z.literal("")),
  party_affiliation: z.string().optional().or(z.literal("")),
  jurisdiction_name: z.string().optional().or(z.literal("")),
  election_date: z.string().optional().or(z.literal("")),
})

type FormValues = z.infer<typeof wizardSchema>

const WIZARD_STEPS = ["Campaign Details", "Review", "Invite Team"]

function WizardStepIndicator({
  currentStep,
  steps,
}: {
  currentStep: number
  steps: string[]
}) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((label, index) => {
        const isCompleted = index < currentStep
        const isActive = index === currentStep
        return (
          <div key={label} className="flex items-center">
            {index > 0 && (
              <div
                className={`h-0 w-8 border-t-2 sm:w-12 ${
                  index <= currentStep
                    ? "border-primary"
                    : "border-muted"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : isActive
                      ? "bg-primary text-primary-foreground"
                      : "border border-muted-foreground text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`text-sm ${
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function NewCampaignPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [selectedMembers, setSelectedMembers] = useState<Map<string, string>>(
    new Map(),
  )
  const [submitError, setSubmitError] = useState<string | null>(null)

  const user = useAuthStore((s) => s.user)
  const currentUserId = user?.profile?.sub as string | undefined

  const { currentOrg } = useOrgPermissions()
  const { data: orgMembers } = useOrgMembers()
  const addMemberToCampaign = useAddMemberToCampaign()

  // Filter out current user from invite list
  const invitableMembers = (orgMembers ?? []).filter(
    (m) => m.user_id !== currentUserId,
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      name: "",
      type: "" as FormValues["type"],
      candidate_name: "",
      party_affiliation: "",
      jurisdiction_name: "",
      election_date: "",
    },
  })

  const {
    register,
    control,
    formState: { errors },
    trigger,
    getValues,
  } = form

  useFormGuard({ form })

  // Prevent accidental navigation via beforeunload when form is dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [form.formState.isDirty])

  const createCampaignMutation = useMutation({
    mutationFn: (data: FormValues) => {
      const body: Record<string, unknown> = {
        name: data.name,
        type: data.type,
      }
      if (data.candidate_name) body.candidate_name = data.candidate_name
      if (data.party_affiliation)
        body.party_affiliation = data.party_affiliation
      if (data.jurisdiction_name)
        body.jurisdiction_name = data.jurisdiction_name
      if (data.election_date) body.election_date = data.election_date
      return api.post("api/v1/campaigns", { json: body }).json<Campaign>()
    },
  })

  const handleNext = async () => {
    if (step === 0) {
      const valid = await trigger(["name", "type"])
      if (!valid) return
    }
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1))
  }

  const handleBack = () => {
    if (step === 0) {
      navigate({ to: "/" })
    } else {
      setStep((s) => s - 1)
    }
  }

  const handleToggleMember = (userId: string, checked: boolean) => {
    setSelectedMembers((prev) => {
      const next = new Map(prev)
      if (checked) {
        next.set(userId, "viewer")
      } else {
        next.delete(userId)
      }
      return next
    })
  }

  const handleMemberRoleChange = (userId: string, role: string) => {
    setSelectedMembers((prev) => {
      const next = new Map(prev)
      next.set(userId, role)
      return next
    })
  }

  const handleSubmit = async (skipInvites: boolean = false) => {
    setSubmitError(null)
    const data = getValues()
    try {
      const campaign = await createCampaignMutation.mutateAsync(data)

      // Add selected team members if not skipping
      if (!skipInvites && selectedMembers.size > 0) {
        const memberEntries = Array.from(selectedMembers.entries())
        for (const [userId, role] of memberEntries) {
          await addMemberToCampaign.mutateAsync({
            campaignId: campaign.id,
            userId,
            role,
          })
        }
      }

      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      queryClient.invalidateQueries({ queryKey: ["org", "campaigns"] })
      navigate({
        to: "/campaigns/$campaignId/dashboard",
        params: { campaignId: campaign.id },
      })
    } catch {
      setSubmitError(
        "Failed to create campaign. Check your connection and try again.",
      )
    }
  }

  const isPending =
    createCampaignMutation.isPending || addMemberToCampaign.isPending
  const values = getValues()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">Create Campaign</h1>
      </div>

      <WizardStepIndicator currentStep={step} steps={WIZARD_STEPS} />

      {/* Step 1: Campaign Details */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Smith for Senate 2026"
                  aria-invalid={!!errors.name}
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center">
                  <Label htmlFor="type">Campaign Type *</Label>
                  <TooltipIcon content="Primary: initial party election to select candidates. General: the main election between party nominees. Special: elections held outside the regular cycle. Local: city, county, or municipal elections." />
                </div>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={!!errors.type}
                      >
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                      <SelectContent>
                        {campaignTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.type && (
                  <p className="text-sm text-destructive">
                    {errors.type.message}
                  </p>
                )}
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="candidate_name">Candidate Name</Label>
                  <Input
                    id="candidate_name"
                    placeholder="e.g. Jane Smith"
                    {...register("candidate_name")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="party_affiliation">Party Affiliation</Label>
                  <Input
                    id="party_affiliation"
                    placeholder="e.g. Democratic"
                    {...register("party_affiliation")}
                  />
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="jurisdiction_name">Jurisdiction</Label>
                  <Input
                    id="jurisdiction_name"
                    placeholder="e.g. California 12th District"
                    {...register("jurisdiction_name")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="election_date">Election Date</Label>
                  <Input
                    id="election_date"
                    type="date"
                    {...register("election_date")}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={handleNext}>
                  Continue to Review
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Review your campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <dl className="space-y-3">
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-sm text-muted-foreground">Name</dt>
                  <dd className="text-sm font-medium">{values.name}</dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-sm text-muted-foreground">Type</dt>
                  <dd className="text-sm font-medium capitalize">
                    {values.type}
                  </dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-sm text-muted-foreground">Jurisdiction</dt>
                  <dd className="text-sm font-medium">
                    {values.jurisdiction_name || "Not specified"}
                  </dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-sm text-muted-foreground">
                    Election Date
                  </dt>
                  <dd className="text-sm font-medium">
                    {values.election_date || "Not specified"}
                  </dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-sm text-muted-foreground">Candidate</dt>
                  <dd className="text-sm font-medium">
                    {values.candidate_name || "Not specified"}
                  </dd>
                </div>
              </dl>

              {currentOrg && (
                <p className="text-sm text-muted-foreground">
                  This campaign will be created in{" "}
                  <span className="font-medium text-foreground">
                    {currentOrg.name}
                  </span>
                  .
                </p>
              )}

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={handleBack}>
                  Back
                </Button>
                <Button type="button" onClick={handleNext}>
                  Continue to Invite
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Invite Team */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Add team members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Select existing org members to add to this campaign. You can
                always add more later.
              </p>

              {invitableMembers.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No other members in your organization yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {invitableMembers.map((member) => {
                    const isSelected = selectedMembers.has(member.user_id)
                    return (
                      <div
                        key={member.user_id}
                        className="flex items-center gap-3 rounded-md border p-3"
                      >
                        <Checkbox
                          id={`member-${member.user_id}`}
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            handleToggleMember(
                              member.user_id,
                              checked === true,
                            )
                          }
                        />
                        <label
                          htmlFor={`member-${member.user_id}`}
                          className="flex flex-1 cursor-pointer flex-col"
                        >
                          <span className="text-sm font-medium">
                            {member.display_name || "Unknown"}
                          </span>
                          {member.email && (
                            <span className="text-xs text-muted-foreground">
                              {member.email}
                            </span>
                          )}
                        </label>
                        {isSelected && (
                          <Select
                            value={selectedMembers.get(member.user_id)}
                            onValueChange={(role) =>
                              handleMemberRoleChange(member.user_id, role)
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {campaignRoles.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}

              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" onClick={handleBack}>
                  Back
                </Button>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground underline"
                    onClick={() => handleSubmit(true)}
                    disabled={isPending}
                  >
                    Skip — create without inviting
                  </button>
                  <Button
                    type="button"
                    onClick={() => handleSubmit(false)}
                    disabled={isPending}
                  >
                    {isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Campaign
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export const Route = createFileRoute("/campaigns/new")({
  component: NewCampaignPage,
})
