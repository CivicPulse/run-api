import { useMemo, useState } from "react"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import { ArrowLeft, Clock, Pencil, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RequireRole } from "@/components/shared/RequireRole"
import { EmptyState } from "@/components/shared/EmptyState"
import { VolunteerEditSheet } from "@/components/volunteers/VolunteerEditSheet"
import { AddAvailabilityDialog } from "@/components/volunteers/AddAvailabilityDialog"
import { useVolunteerDetail } from "@/hooks/useVolunteers"
import {
  useVolunteerCampaignTags,
  useAddTagToVolunteer,
  useRemoveTagFromVolunteer,
} from "@/hooks/useVolunteerTags"
import { useVolunteerAvailability, useDeleteAvailability } from "@/hooks/useVolunteerAvailability"
import { useVolunteerHours } from "@/hooks/useVolunteerHours"
import { formatSkillLabel } from "@/types/volunteer"
import type { AvailabilityResponse } from "@/types/volunteer"

function statusVariant(status: string) {
  switch (status) {
    case "active":
      return "success" as const
    case "pending":
      return "warning" as const
    case "inactive":
      return "error" as const
    default:
      return "default" as const
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDateRange(slot: AvailabilityResponse): string {
  const start = new Date(slot.start_at)
  const end = new Date(slot.end_at)
  const dateStr = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const startTime = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
  const endTime = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${dateStr} ${startTime} - ${endTime}`
}

function VolunteerDetailPage() {
  const { campaignId, volunteerId } = useParams({
    from: "/campaigns/$campaignId/volunteers/$volunteerId/",
  })

  const { data: volunteer, isLoading } = useVolunteerDetail(
    campaignId,
    volunteerId,
  )
  const { data: campaignTags } = useVolunteerCampaignTags(campaignId)
  const { data: availability } = useVolunteerAvailability(
    campaignId,
    volunteerId,
  )
  const { data: hours } = useVolunteerHours(campaignId, volunteerId)

  const addTag = useAddTagToVolunteer(campaignId, volunteerId)
  const removeTag = useRemoveTagFromVolunteer(campaignId, volunteerId)
  const deleteAvailability = useDeleteAvailability(campaignId, volunteerId)

  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [addAvailabilityOpen, setAddAvailabilityOpen] = useState(false)

  // Build a name-to-ID map for resolving tag names to IDs
  const tagsByName = useMemo(() => {
    const map = new Map<string, string>()
    if (campaignTags) {
      for (const tag of campaignTags) {
        map.set(tag.name, tag.id)
      }
    }
    return map
  }, [campaignTags])

  // Tags not yet assigned to this volunteer
  const availableTags = useMemo(() => {
    if (!campaignTags || !volunteer) return []
    return campaignTags.filter((t) => !volunteer.tags.includes(t.name))
  }, [campaignTags, volunteer])

  // Sort availability: future first, then past
  const sortedAvailability = useMemo(() => {
    if (!availability) return []
    return [...availability].sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    )
  }, [availability])

  // Most recent shift for "Last Active" stat
  const lastActiveDate = useMemo(() => {
    if (!hours?.shifts.length) return null
    const sorted = [...hours.shifts].sort(
      (a, b) =>
        new Date(b.check_in_at).getTime() - new Date(a.check_in_at).getTime(),
    )
    return sorted[0].check_in_at
  }, [hours])

  const handleAddTag = async (tagId: string) => {
    try {
      await addTag.mutateAsync(tagId)
      toast.success("Tag added")
    } catch {
      toast.error("Failed to add tag")
    }
  }

  const handleRemoveTag = async (tagName: string) => {
    const tagId = tagsByName.get(tagName)
    if (!tagId) return
    try {
      await removeTag.mutateAsync(tagId)
      toast.success("Tag removed")
    } catch {
      toast.error("Failed to remove tag")
    }
  }

  const handleDeleteAvailability = async (availabilityId: string) => {
    try {
      await deleteAvailability.mutateAsync(availabilityId)
      toast.success("Availability removed")
    } catch {
      toast.error("Failed to remove availability")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-32" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    )
  }

  if (!volunteer) {
    return (
      <EmptyState
        title="Volunteer not found"
        description="The volunteer you're looking for doesn't exist or has been removed."
      />
    )
  }

  const skillsText = volunteer.skills
    .map(formatSkillLabel)
    .join(" \u00B7 ")

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        to="/campaigns/$campaignId/volunteers/roster"
        params={{ campaignId }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Roster
      </Link>

      {/* Header section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {volunteer.first_name} {volunteer.last_name}
            </h1>
            <StatusBadge
              status={volunteer.status.charAt(0).toUpperCase() + volunteer.status.slice(1)}
              variant={statusVariant(volunteer.status)}
            />
          </div>
          <RequireRole minimum="manager">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditSheetOpen(true)}
            >
              <Pencil className="size-4 mr-1" />
              Edit
            </Button>
          </RequireRole>
        </div>

        {skillsText && (
          <p className="text-sm text-muted-foreground">{skillsText}</p>
        )}

        {/* Tag pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {volunteer.tags.map((tagName) => (
            <Badge key={tagName} variant="secondary" className="gap-1">
              {tagName}
              <RequireRole minimum="manager">
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tagName)}
                  className="ml-0.5 hover:text-destructive transition-colors"
                  aria-label={`Remove tag ${tagName}`}
                >
                  <X className="size-3" />
                </button>
              </RequireRole>
            </Badge>
          ))}

          <RequireRole minimum="manager">
            {availableTags.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-6 px-2">
                    <Plus className="size-3 mr-1" />
                    Add Tag
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {availableTags.map((tag) => (
                    <DropdownMenuItem
                      key={tag.id}
                      onClick={() => handleAddTag(tag.id)}
                    >
                      {tag.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </RequireRole>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="hours">Hours</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-4">
          <div className="space-y-6">
            {/* Contact info */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Contact
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm">{volunteer.phone || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{volunteer.email || "-"}</p>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Address
              </h3>
              {volunteer.street ||
              volunteer.city ||
              volunteer.state ||
              volunteer.zip_code ? (
                <div className="space-y-1">
                  {volunteer.street && (
                    <p className="text-sm">{volunteer.street}</p>
                  )}
                  <p className="text-sm">
                    {[volunteer.city, volunteer.state, volunteer.zip_code]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No address on file
                </p>
              )}
            </div>

            {/* Emergency Contact */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Emergency Contact
              </h3>
              {volunteer.emergency_contact_name ||
              volunteer.emergency_contact_phone ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="text-sm">
                      {volunteer.emergency_contact_name || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm">
                      {volunteer.emergency_contact_phone || "-"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No emergency contact
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Notes
              </h3>
              <p className="text-sm">
                {volunteer.notes || "No notes"}
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Availability Tab */}
        <TabsContent value="availability" className="mt-4">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => setAddAvailabilityOpen(true)}
              >
                <Plus className="size-4 mr-1" />
                Add Availability
              </Button>
            </div>

            {sortedAvailability.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No availability set"
                description="Add time slots when this volunteer is available"
                action={
                  <Button
                    size="sm"
                    onClick={() => setAddAvailabilityOpen(true)}
                  >
                    Add Availability
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {sortedAvailability.map((slot) => {
                  const isPast = new Date(slot.end_at) < new Date()
                  return (
                    <div
                      key={slot.id}
                      className={`flex items-center justify-between rounded-md border px-4 py-3 ${
                        isPast
                          ? "text-muted-foreground opacity-50"
                          : ""
                      }`}
                    >
                      <span className="text-sm">
                        {formatDateRange(slot)}
                      </span>
                      {!isPast && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleDeleteAvailability(slot.id)}
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Hours Tab */}
        <TabsContent value="hours" className="mt-4">
          {!hours || hours.shifts.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No hours recorded"
              description="Hours appear after completing shifts"
            />
          ) : (
            <div className="space-y-6">
              {/* Summary stat cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Total Hours</p>
                  <p className="text-2xl font-semibold">
                    {hours.total_hours.toFixed(1)}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">
                    Shifts Completed
                  </p>
                  <p className="text-2xl font-semibold">
                    {hours.shifts_worked}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Last Active</p>
                  <p className="text-2xl font-semibold">
                    {lastActiveDate ? formatDate(lastActiveDate) : "Never"}
                  </p>
                </Card>
              </div>

              {/* Shift history table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shift Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hours.shifts.map((shift) => (
                      <TableRow key={shift.shift_id}>
                        <TableCell className="font-medium">
                          {shift.shift_name}
                        </TableCell>
                        <TableCell>
                          {formatDate(shift.check_in_at)}
                        </TableCell>
                        <TableCell>
                          {formatTime(shift.check_in_at)}
                        </TableCell>
                        <TableCell>
                          {shift.check_out_at
                            ? formatTime(shift.check_out_at)
                            : "In progress"}
                        </TableCell>
                        <TableCell className="text-right">
                          {shift.hours.toFixed(1)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Sheet */}
      {volunteer && (
        <VolunteerEditSheet
          open={editSheetOpen}
          onOpenChange={setEditSheetOpen}
          volunteer={volunteer}
          campaignId={campaignId}
        />
      )}

      {/* Add Availability Dialog */}
      <AddAvailabilityDialog
        open={addAvailabilityOpen}
        onOpenChange={setAddAvailabilityOpen}
        campaignId={campaignId}
        volunteerId={volunteerId}
      />
    </div>
  )
}

export const Route = createFileRoute(
  "/campaigns/$campaignId/volunteers/$volunteerId/",
)({
  component: VolunteerDetailPage,
})
