import { useState } from "react"
import { ChevronDown, Loader2, Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { useOrgPermissions } from "@/hooks/useOrgPermissions"
import { useAuthStore } from "@/stores/authStore"

export function OrgSwitcher() {
  const { currentOrg, orgs } = useOrgPermissions()
  const switchOrg = useAuthStore((s) => s.switchOrg)
  const [isSwitching, setIsSwitching] = useState(false)

  // Don't render if user has only 1 org
  if (orgs.length <= 1) {
    return currentOrg ? (
      <span className="text-sm font-medium">{currentOrg.name}</span>
    ) : null
  }

  const handleSwitch = async (zitadelOrgId: string) => {
    if (zitadelOrgId === currentOrg?.zitadel_org_id) return
    setIsSwitching(true)
    await switchOrg(zitadelOrgId)
    // signinRedirect will navigate away, no need to reset state
  }

  if (isSwitching) {
    return <Loader2 className="h-4 w-4 animate-spin" />
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-1 text-sm font-medium">
          {currentOrg?.name ?? "Organization"}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitch(org.zitadel_org_id)}
            className="gap-2"
          >
            {org.name}
            {org.zitadel_org_id === currentOrg?.zitadel_org_id && (
              <Check className="ml-auto h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
