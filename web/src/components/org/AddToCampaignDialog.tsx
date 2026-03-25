import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAddMemberToCampaign } from "@/hooks/useOrg"
import type { OrgCampaign, OrgMember } from "@/types/org"

const ASSIGNABLE_ROLES = ["viewer", "volunteer", "manager", "admin"] as const

interface AddToCampaignDialogProps {
  member: OrgMember | null
  open: boolean
  onOpenChange: (open: boolean) => void
  campaigns: OrgCampaign[]
}

export function AddToCampaignDialog({
  member,
  open,
  onOpenChange,
  campaigns,
}: AddToCampaignDialogProps) {
  const [selections, setSelections] = useState<Map<string, string>>(new Map())
  const addMember = useAddMemberToCampaign()

  // Filter out campaigns the member is already in
  const availableCampaigns = campaigns.filter(
    (c) =>
      !member?.campaign_roles.some((cr) => cr.campaign_id === c.id),
  )

  function handleCheckChange(campaignId: string, checked: boolean) {
    setSelections((prev) => {
      const next = new Map(prev)
      if (checked) {
        next.set(campaignId, "viewer")
      } else {
        next.delete(campaignId)
      }
      return next
    })
  }

  function handleRoleChange(campaignId: string, role: string) {
    setSelections((prev) => {
      const next = new Map(prev)
      next.set(campaignId, role)
      return next
    })
  }

  async function handleConfirm() {
    if (!member || selections.size === 0) return
    try {
      for (const [campaignId, role] of selections) {
        await addMember.mutateAsync({
          campaignId,
          userId: member.user_id,
          role,
        })
      }
      toast(
        `Added ${member.display_name ?? "member"} to ${selections.size} campaign(s).`,
      )
      setSelections(new Map())
      onOpenChange(false)
    } catch {
      toast.error("Failed to add member. Please try again.")
    }
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setSelections(new Map())
    }
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Add {member?.display_name ?? "member"} to campaigns
          </DialogTitle>
          <DialogDescription>
            Select campaigns and assign a role for each.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {availableCampaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This member is already in all campaigns.
            </p>
          ) : (
            availableCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-center gap-3"
              >
                <Checkbox
                  id={`campaign-${campaign.id}`}
                  checked={selections.has(campaign.id)}
                  onCheckedChange={(checked) =>
                    handleCheckChange(campaign.id, checked === true)
                  }
                />
                <label
                  htmlFor={`campaign-${campaign.id}`}
                  className="flex-1 text-sm font-medium"
                >
                  {campaign.name}
                </label>
                {selections.has(campaign.id) && (
                  <Select
                    value={selections.get(campaign.id)}
                    onValueChange={(value) =>
                      handleRoleChange(campaign.id, value)
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selections.size === 0 || addMember.isPending}
          >
            {addMember.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Add Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
