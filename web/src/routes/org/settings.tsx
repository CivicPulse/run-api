import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import { useUpdateOrg } from "@/hooks/useOrg"
import { useOrgPermissions } from "@/hooks/useOrgPermissions"
import { api } from "@/api/client"

interface OrgDetail {
  id: string
  name: string
  zitadel_org_id: string
  created_at: string
}

function OrgSettingsPage() {
  const { hasOrgRole } = useOrgPermissions()
  const isOwner = hasOrgRole("org_owner")
  const updateOrg = useUpdateOrg()

  const { data: org, isLoading } = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get("api/v1/org").json<OrgDetail>(),
  })

  const [name, setName] = useState<string | null>(null)
  const currentName = name ?? org?.name ?? ""
  const isDirty = name !== null && name !== org?.name

  async function handleSave() {
    if (!isDirty) return
    try {
      await updateOrg.mutateAsync({ name: currentName })
      toast("Organization updated.")
      setName(null)
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
            <Label htmlFor="org-id">Organization ID</Label>
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
          {isOwner && (
            <div className="flex justify-end">
              <Button
                disabled={!isDirty || updateOrg.isPending}
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

      <DangerZone />
    </div>
  )
}

export const Route = createFileRoute("/org/settings")({
  component: OrgSettingsPage,
})
