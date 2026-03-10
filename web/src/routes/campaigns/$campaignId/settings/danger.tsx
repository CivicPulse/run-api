import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RequireRole } from "@/components/shared/RequireRole"
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog"
import { useCampaign, useDeleteCampaign, useTransferOwnership } from "@/hooks/useCampaigns"
import { api } from "@/api/client"
import type { CampaignMember } from "@/types/campaign"
import type { PaginatedResponse } from "@/types/common"

function DangerZone() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/settings/danger" })
  const navigate = useNavigate()
  const { data: campaign } = useCampaign(campaignId)
  const deleteCampaign = useDeleteCampaign(campaignId)
  const transferOwnership = useTransferOwnership(campaignId)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Transfer dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [selectedAdminId, setSelectedAdminId] = useState<string>("")
  const [confirmTransferOpen, setConfirmTransferOpen] = useState(false)

  // Load campaign members for the transfer dialog
  const { data: membersData } = useQuery({
    queryKey: ["campaigns", campaignId, "members"],
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/members`)
        .json<PaginatedResponse<CampaignMember>>(),
    enabled: transferDialogOpen,
  })

  const adminMembers = (membersData?.items ?? []).filter(
    (m) => m.role === "admin"
  )

  const selectedAdmin = adminMembers.find((m) => m.user_id === selectedAdminId)

  const handleDelete = async () => {
    try {
      await deleteCampaign.mutateAsync()
      toast.success("Campaign deleted")
      navigate({ to: "/" })
    } catch {
      toast.error("Failed to delete campaign")
    }
  }

  const handleTransfer = async () => {
    if (!selectedAdminId) return
    try {
      await transferOwnership.mutateAsync(selectedAdminId)
      toast.success("Ownership transferred")
      setConfirmTransferOpen(false)
      setTransferDialogOpen(false)
      setSelectedAdminId("")
    } catch {
      toast.error("Failed to transfer ownership")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">
          Irreversible and destructive actions.
        </p>
      </div>

      <RequireRole
        minimum="owner"
        fallback={
          <p className="text-sm text-muted-foreground">
            Only the campaign owner can access these settings.
          </p>
        }
      >
        <div className="space-y-4">
          {/* Transfer Ownership */}
          <Card className="border-destructive/50 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">Transfer ownership</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Transfer this campaign to another admin. You will become an admin after
                  transfer.
                </p>
              </div>
              <Button
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/10 shrink-0"
                onClick={() => setTransferDialogOpen(true)}
              >
                Transfer ownership
              </Button>
            </div>
          </Card>

          {/* Delete Campaign */}
          <Card className="border-destructive/50 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">Delete this campaign</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Once you delete a campaign, there is no going back. Please be certain.
                </p>
              </div>
              <Button
                variant="destructive"
                className="shrink-0"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete campaign
              </Button>
            </div>
          </Card>
        </div>
      </RequireRole>

      {/* Delete confirmation dialog */}
      <DestructiveConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete campaign"
        description="This action cannot be undone. This will permanently delete your campaign and all associated data."
        confirmText={campaign?.name ?? ""}
        confirmLabel="Delete campaign"
        onConfirm={handleDelete}
        isPending={deleteCampaign.isPending}
      />

      {/* Transfer ownership: admin selector dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              Select an admin to transfer campaign ownership to. You will be demoted to admin.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {adminMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No admin members found. Promote a member to admin before transferring ownership.
              </p>
            ) : (
              <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an admin..." />
                </SelectTrigger>
                <SelectContent>
                  {adminMembers.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.display_name} ({member.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setTransferDialogOpen(false)
                setSelectedAdminId("")
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!selectedAdminId}
              onClick={() => setConfirmTransferOpen(true)}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer ownership: confirm dialog */}
      {selectedAdmin && (
        <Dialog open={confirmTransferOpen} onOpenChange={setConfirmTransferOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm ownership transfer</DialogTitle>
              <DialogDescription>
                Transfer ownership to{" "}
                <strong>{selectedAdmin.display_name}</strong>? You will be demoted to
                admin after this action.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirmTransferOpen(false)}
                disabled={transferOwnership.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleTransfer}
                disabled={transferOwnership.isPending}
              >
                {transferOwnership.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Transfer ownership
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export const Route = createFileRoute("/campaigns/$campaignId/settings/danger")({
  component: DangerZone,
})
