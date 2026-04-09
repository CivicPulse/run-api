import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { Loader2, Link2Off, UserRoundPlus } from "lucide-react"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import type { PublicSignupLink } from "@/types/signupLink"

function SignupEntryPage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()

  const signupLinkQuery = useQuery({
    queryKey: ["public-signup-link", token],
    queryFn: () => api.get(`api/v1/public/signup-links/${token}`).json<PublicSignupLink>(),
  })

  const link = signupLinkQuery.data
  const isValid = link?.status === "valid"

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
              You&apos;re viewing the volunteer signup page for{" "}
              <strong>{link.campaign_name}</strong>
              {link.organization_name ? ` with ${link.organization_name}` : ""}.
            </p>
            {link.candidate_name ? (
              <p className="text-muted-foreground">
                Candidate: {link.candidate_name}
              </p>
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
              <p className="text-muted-foreground">
                Link label: {link.link_label}
              </p>
            ) : null}
            <p className="rounded-2xl bg-muted/60 px-4 py-3 text-muted-foreground">
              Volunteer application submission is enabled in the next milestone step. This page confirms the link is valid and campaign-scoped.
            </p>
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

        <div className="flex flex-wrap gap-3">
          {isValid ? (
            <Button asChild>
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
