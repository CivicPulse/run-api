import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { Loader2, Link2Off, UserRoundPlus } from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  useCreateVolunteerApplication,
  useCurrentVolunteerApplication,
} from "@/hooks/useVolunteerApplications"
import { useAuthStore } from "@/stores/authStore"
import type { PublicSignupLink } from "@/types/signupLink"
import type { VolunteerApplication } from "@/types/volunteerApplication"

const applicationSchema = z.object({
  first_name: z.string().trim().min(1, "Enter your first name"),
  last_name: z.string().trim().min(1, "Enter your last name"),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
})

type ApplicationFormValues = z.infer<typeof applicationSchema>

function splitDisplayName(name: string | undefined) {
  if (!name) return { firstName: "", lastName: "" }
  const [firstName, ...rest] = name.trim().split(/\s+/)
  return {
    firstName: firstName ?? "",
    lastName: rest.join(" "),
  }
}

function SignupEntryPage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.status === "authenticated")
  const user = useAuthStore((state) => state.user)
  const [submittedApplication, setSubmittedApplication] =
    useState<VolunteerApplication | null>(null)

  const signupLinkQuery = useQuery({
    queryKey: ["public-signup-link", token],
    queryFn: () => api.get(`api/v1/public/signup-links/${token}`).json<PublicSignupLink>(),
  })
  const currentApplicationQuery = useCurrentVolunteerApplication(token, isAuthenticated)
  const createApplication = useCreateVolunteerApplication(token)

  const displayName = user?.display_name ?? undefined
  const email = user?.email ?? ""
  const { firstName, lastName } = splitDisplayName(displayName)

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      first_name: firstName,
      last_name: lastName,
      email,
      phone: "",
      notes: "",
    },
  })

  useEffect(() => {
    if (!isAuthenticated) return
    form.reset({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: currentApplicationQuery.data?.application?.phone ?? "",
      notes: currentApplicationQuery.data?.application?.notes ?? "",
    })
  }, [
    currentApplicationQuery.data?.application?.notes,
    currentApplicationQuery.data?.application?.phone,
    email,
    firstName,
    form,
    isAuthenticated,
    lastName,
  ])

  const link = signupLinkQuery.data
  const application = currentApplicationQuery.data?.application ?? submittedApplication
  const isValid = link?.status === "valid"

  const handleLogin = () => {
    navigate({ to: "/login", search: { redirect: `/signup/${token}` } })
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const application = await createApplication.mutateAsync({
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        phone: values.phone || null,
        notes: values.notes || null,
      })
      setSubmittedApplication(application)
      toast.success("Application submitted")
    } catch {
      toast.error("Unable to submit your application")
    }
  })

  return (
    <div className="min-h-svh bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 rounded-3xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          {isValid ? (
            <UserRoundPlus className="size-6 text-primary" />
          ) : (
            <Link2Off className="size-6 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              Volunteer signup
            </p>
            <h1 className="text-2xl font-semibold">
              {link?.campaign_name ?? "Signup link"}
            </h1>
          </div>
        </div>

        {signupLinkQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Loading signup details...</span>
          </div>
        ) : null}

        {isValid && link ? (
          <div className="space-y-3 text-sm">
            <p>
              Apply to volunteer with <strong>{link.campaign_name}</strong>
              {link.organization_name ? ` for ${link.organization_name}` : ""}.
            </p>
            {link.candidate_name ? (
              <p className="text-muted-foreground">Candidate: {link.candidate_name}</p>
            ) : null}
            {link.jurisdiction_name ? (
              <p className="text-muted-foreground">
                Jurisdiction: {link.jurisdiction_name}
              </p>
            ) : null}
            {link.election_date ? (
              <p className="text-muted-foreground">
                Election date: {format(new Date(link.election_date), "PPP")}
              </p>
            ) : null}
            {link.link_label ? (
              <p className="text-muted-foreground">Link label: {link.link_label}</p>
            ) : null}
          </div>
        ) : null}

        {signupLinkQuery.isError ? (
          <p className="text-sm text-destructive">
            Unable to load this signup link right now.
          </p>
        ) : null}

        {!signupLinkQuery.isLoading && !isValid ? (
          <p className="text-sm text-muted-foreground">
            This signup link is unavailable. Ask the campaign team for a fresh volunteer signup URL.
          </p>
        ) : null}

        {isValid && application?.status === "pending" ? (
          <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            Your application is pending review. Campaign admins will approve or reject it before access is granted.
          </div>
        ) : null}
        {isValid && application?.status === "approved" ? (
          <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            Your application has been approved. Sign in again if you do not see the campaign in your account yet.
          </div>
        ) : null}
        {isValid && application?.status === "rejected" ? (
          <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            This application was not approved. Contact the campaign team if you need more information.
          </div>
        ) : null}

        {isValid && !application ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" {...form.register("first_name")} />
                {form.formState.errors.first_name ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.first_name.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last name</Label>
                <Input id="last_name" {...form.register("last_name")} />
                {form.formState.errors.last_name ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.last_name.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...form.register("phone")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Why do you want to help?</Label>
              <Textarea
                id="notes"
                rows={4}
                placeholder="Share availability, experience, or what kind of volunteer work interests you."
                {...form.register("notes")}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={createApplication.isPending}>
                {createApplication.isPending ? "Submitting..." : "Submit application"}
              </Button>
              {!isAuthenticated ? (
                <Button type="button" variant="outline" onClick={handleLogin}>
                  Sign in instead
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}

        {isValid && !isAuthenticated ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You can apply anonymously here, or sign in first if you already have a CivicPulse account and want your saved profile reused automatically.
            </p>
            {!application ? <Button onClick={handleLogin}>Sign in for faster apply</Button> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {isValid ? (
            <Button asChild variant="outline">
              <Link to="/login" search={{ redirect: `/signup/${token}` }}>
                Sign in
              </Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Back to app
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/signup/$token")({
  component: SignupEntryPage,
})
