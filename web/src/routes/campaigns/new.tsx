import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useForm, Controller } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import type { Campaign, CampaignType } from "@/types/campaign"

const campaignTypes: { value: CampaignType; label: string }[] = [
  { value: "federal", label: "Federal" },
  { value: "state", label: "State" },
  { value: "local", label: "Local" },
  { value: "ballot", label: "Ballot" },
]

const schema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(100),
  type: z.enum(["federal", "state", "local", "ballot"]),
  candidate_name: z.string().optional().or(z.literal("")),
  party_affiliation: z.string().optional().or(z.literal("")),
  jurisdiction_name: z.string().optional().or(z.literal("")),
  election_date: z.string().optional().or(z.literal("")),
})

type FormValues = z.infer<typeof schema>

function NewCampaignPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      type: undefined,
      candidate_name: "",
      party_affiliation: "",
      jurisdiction_name: "",
      election_date: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: FormValues) => {
      const body: Record<string, unknown> = {
        name: data.name,
        type: data.type,
      }
      if (data.candidate_name) body.candidate_name = data.candidate_name
      if (data.party_affiliation) body.party_affiliation = data.party_affiliation
      if (data.jurisdiction_name) body.jurisdiction_name = data.jurisdiction_name
      if (data.election_date) body.election_date = data.election_date
      return api.post("api/v1/campaigns", { json: body }).json<Campaign>()
    },
    onSuccess: (campaign) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      navigate({ to: "/campaigns/$campaignId/dashboard", params: { campaignId: campaign.id } })
    },
  })

  const onSubmit = (data: FormValues) => mutation.mutate(data)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">New Campaign</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name *</Label>
              <Input
                id="name"
                placeholder="e.g. Smith for Senate 2026"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Campaign Type *</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full" aria-invalid={!!errors.type}>
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
                <p className="text-sm text-destructive">{errors.type.message}</p>
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

            {mutation.isError && (
              <p className="text-sm text-destructive">
                Failed to create campaign. Please try again.
              </p>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/" })}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Campaign
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute("/campaigns/new")({
  component: NewCampaignPage,
})
