import { useState } from "react"
import { toast } from "sonner"
import { Tags, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { RequireRole } from "@/components/shared/RequireRole"
import { EmptyState } from "@/components/shared/EmptyState"
import {
  useVoterTags,
  useCampaignTags,
  useAddTagToVoter,
  useRemoveTagFromVoter,
} from "@/hooks/useVoterTags"

interface TagsTabProps {
  campaignId: string
  voterId: string
}

export function TagsTab({ campaignId, voterId }: TagsTabProps) {
  const [selectedTagId, setSelectedTagId] = useState<string>("")

  const { data: voterTags, isLoading: voterTagsLoading } = useVoterTags(campaignId, voterId)
  const { data: campaignTags, isLoading: campaignTagsLoading } = useCampaignTags(campaignId)
  const addTag = useAddTagToVoter(campaignId, voterId)
  const removeTag = useRemoveTagFromVoter(campaignId, voterId)

  const voterTagIds = new Set((voterTags ?? []).map((t) => t.id))
  const availableTags = (campaignTags ?? []).filter((t) => !voterTagIds.has(t.id))

  function handleAdd() {
    if (!selectedTagId) return
    addTag.mutate(selectedTagId, {
      onSuccess: () => {
        toast.success("Tag added")
        setSelectedTagId("")
      },
    })
  }

  function handleRemove(tagId: string) {
    removeTag.mutate(tagId, {
      onSuccess: () => toast.success("Tag removed"),
    })
  }

  if (voterTagsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
    )
  }

  const tags = voterTags ?? []

  return (
    <div className="space-y-6">
      {/* Current tags */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <Tags className="size-4 text-muted-foreground" />
          Current Tags
        </h3>
        {tags.length === 0 ? (
          <EmptyState
            title="No tags assigned"
            description="Assign tags to help categorize this voter."
            className="py-4"
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="flex items-center gap-1 pl-2 pr-1 py-0.5">
                <span>{tag.name}</span>
                <RequireRole minimum="manager">
                  <button
                    onClick={() => handleRemove(tag.id)}
                    disabled={removeTag.isPending}
                    className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 disabled:opacity-40"
                    aria-label={`Remove tag ${tag.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </RequireRole>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Add tag */}
      <RequireRole minimum="manager">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Add Tag</h3>
          {campaignTagsLoading ? (
            <Skeleton className="h-9 w-64" />
          ) : availableTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {(campaignTags ?? []).length === 0
                ? "No tags exist for this campaign yet."
                : "All campaign tags are already assigned to this voter."}
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="tag-selector" className="text-xs">Select tag</Label>
                <Select value={selectedTagId} onValueChange={setSelectedTagId} disabled={addTag.isPending}>
                  <SelectTrigger
                    id="tag-selector"
                    className="w-48"
                    aria-label="Select a tag to add"
                  >
                    <SelectValue placeholder="Choose a tag..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        {tag.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!selectedTagId || addTag.isPending}
              >
                Add Tag
              </Button>
            </div>
          )}
        </div>
      </RequireRole>
    </div>
  )
}
