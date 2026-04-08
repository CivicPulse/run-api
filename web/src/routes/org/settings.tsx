import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { TooltipIcon } from "@/components/shared/TooltipIcon"
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { DangerZone } from "@/components/org/DangerZone"
import { PhoneNumbersCard } from "@/components/org/PhoneNumbersCard"
import { useOrg, useUpdateOrg } from "@/hooks/useOrg"
import { useOrgPermissions } from "@/hooks/useOrgPermissions"
import type { TwilioBudgetActivity, TwilioOrgUpdate } from "@/types/org"

function formatCurrency(cents: number | null | undefined) {
  if (cents == null) return "Not set"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

function formatActivityCost(activity: TwilioBudgetActivity) {
  if (activity.pending_cost) return "Pending"
  if (activity.cost_cents == null) return "Unknown"
  return formatCurrency(activity.cost_cents)
}

function OrgSettingsPage() {
  const { hasOrgRole } = useOrgPermissions()
  const isOwner = hasOrgRole("org_owner")
  const updateOrg = useUpdateOrg()
  const { data: org, isLoading } = useOrg()

  const [name, setName] = useState<string | null>(null)
  const [accountSid, setAccountSid] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState("")
  const [softBudget, setSoftBudget] = useState<string | null>(null)
  const [warningPercent, setWarningPercent] = useState<string | null>(null)
  const currentName = name ?? org?.name ?? ""
  const currentAccountSid = accountSid ?? org?.twilio?.account_sid ?? ""
  const currentSoftBudget =
    softBudget ??
    (org?.twilio?.budget?.soft_budget_cents != null
      ? String(org.twilio.budget.soft_budget_cents / 100)
      : "")
  const currentWarningPercent =
    warningPercent ?? String(org?.twilio?.budget?.warning_percent ?? 80)
  const isDirty = name !== null && name !== org?.name
  const twilioDirty =
    (accountSid !== null && accountSid !== org?.twilio?.account_sid) ||
    authToken.trim().length > 0 ||
    softBudget !== null ||
    warningPercent !== null

  async function handleSave() {
    if (!isDirty && !twilioDirty) return
    const payload: {
      name?: string
      twilio?: {
        account_sid?: string
        auth_token?: string
        soft_budget_cents?: number | null
        budget_warning_percent?: number
      }
    } = {}
    if (isDirty) {
      payload.name = currentName
    }
    const twilio: TwilioOrgUpdate = {}
    if (accountSid !== null && accountSid !== org?.twilio?.account_sid) {
      twilio.account_sid = currentAccountSid
    }
    if (authToken.trim()) {
      twilio.auth_token = authToken.trim()
    }
    if (softBudget !== null) {
      twilio.soft_budget_cents = softBudget.trim()
        ? Math.round(Number(softBudget) * 100)
        : null
    }
    if (warningPercent !== null) {
      twilio.budget_warning_percent = Number(currentWarningPercent)
    }
    if (Object.keys(twilio).length > 0) {
      payload.twilio = twilio
    }
    try {
      await updateOrg.mutateAsync(payload)
      toast("Organization updated.")
      setName(null)
      setAccountSid(null)
      setAuthToken("")
      setSoftBudget(null)
      setWarningPercent(null)
    } catch {
      toast.error("Failed to update organization. Please try again.")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-bold">Organization Settings</h1>
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Organization Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              placeholder="e.g. Macon-Bibb County Democrats"
              value={currentName}
              onChange={(e) => setName(e.target.value)}
              readOnly={!isOwner}
              className={!isOwner ? "bg-muted" : undefined}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="org-id">Organization ID</Label>
              <TooltipIcon content="This is your organization's unique identifier in the authentication system. Share it with support if you need assistance with account or access issues." />
            </div>
            <Input
              id="org-id"
              readOnly
              value={org?.zitadel_org_id ?? ""}
              className="bg-muted font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Read-only identifier from your identity provider.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Twilio Communications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Status: {org?.twilio?.ready ? "Ready" : "Needs configuration"}
            </p>
            <p className="text-sm text-muted-foreground">
              Org admins can inspect readiness. Only org owners can update write-only credentials.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio-account-sid">Twilio Account SID</Label>
            <Input
              id="twilio-account-sid"
              placeholder="AC..."
              value={currentAccountSid}
              onChange={(e) => setAccountSid(e.target.value)}
              readOnly={!isOwner}
              className={!isOwner ? "bg-muted" : undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio-auth-token">Twilio Auth Token</Label>
            <Input
              id="twilio-auth-token"
              type="password"
              placeholder={org?.twilio?.auth_token_hint ?? "Write-only secret"}
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              readOnly={!isOwner}
              className={!isOwner ? "bg-muted" : undefined}
            />
            <p className="text-xs text-muted-foreground">
              Stored secrets are never returned to the browser. Leave blank to keep the current token.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
            <p>
              Account SID configured: {org?.twilio?.account_sid_configured ? "Yes" : "No"}
            </p>
            <p>
              Auth token: {org?.twilio?.auth_token_hint ?? "Not configured"}
            </p>
          </div>
          {isOwner && (
            <div className="flex justify-end">
              <Button
                disabled={(!isDirty && !twilioDirty) || updateOrg.isPending}
                onClick={handleSave}
              >
                {updateOrg.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Twilio Spend &amp; Telemetry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Estimated spend
              </p>
              <p className="mt-1 text-lg font-semibold">
                {formatCurrency(org?.twilio?.budget?.estimated_total_spend_cents)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Remaining budget
              </p>
              <p className="mt-1 text-lg font-semibold">
                {formatCurrency(org?.twilio?.budget?.remaining_budget_cents)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                State
              </p>
              <p className="mt-1 text-lg font-semibold capitalize">
                {org?.twilio?.budget?.state?.replace("_", " ") ?? "Healthy"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="twilio-soft-budget">Soft budget (USD)</Label>
              <Input
                id="twilio-soft-budget"
                type="number"
                min="0"
                step="0.01"
                value={currentSoftBudget}
                onChange={(e) => setSoftBudget(e.target.value)}
                readOnly={!isOwner}
                className={!isOwner ? "bg-muted" : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twilio-warning-percent">Warning threshold (%)</Label>
              <Input
                id="twilio-warning-percent"
                type="number"
                min="1"
                max="100"
                value={currentWarningPercent}
                onChange={(e) => setWarningPercent(e.target.value)}
                readOnly={!isOwner}
                className={!isOwner ? "bg-muted" : undefined}
              />
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-medium">Recent activity</p>
            </div>
            <div className="divide-y">
              {(org?.twilio?.recent_activity ?? []).slice(0, 5).map((activity) => (
                <div
                  key={activity.id}
                  className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[120px_1fr_120px]"
                >
                  <span className="font-medium uppercase">{activity.channel}</span>
                  <span className="text-muted-foreground">
                    {activity.provider_status ?? activity.event_type}
                  </span>
                  <span className="text-right font-mono">
                    {formatActivityCost(activity)}
                  </span>
                </div>
              ))}
              {(org?.twilio?.recent_activity ?? []).length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  Voice and SMS spend events will appear here as activity is billed.
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <PhoneNumbersCard />

      <DangerZone />
    </div>
  )
}

export const Route = createFileRoute("/org/settings")({
  component: OrgSettingsPage,
  errorComponent: RouteErrorBoundary,
})
