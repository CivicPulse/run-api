import { useState } from "react"
import {
  Phone,
  MessageSquare,
  Trash2,
  RefreshCw,
  Loader2,
  Plus,
} from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
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
import {
  useOrgNumbers,
  useRegisterOrgNumber,
  useDeleteOrgNumber,
  useSyncOrgNumber,
  useSetDefaultNumber,
} from "@/hooks/useOrgNumbers"
import { useOrgPermissions } from "@/hooks/useOrgPermissions"
import type { OrgPhoneNumber } from "@/types/org"

export function PhoneNumbersCard() {
  const { hasOrgRole } = useOrgPermissions()
  const isOwner = hasOrgRole("org_owner")
  const { data: numbers, isLoading, isError } = useOrgNumbers()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phone Numbers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isOwner && <RegisterForm />}

        {isLoading ? (
          <LoadingSkeleton />
        ) : isError ? (
          <p className="text-sm text-destructive">
            Failed to load phone numbers. Please try again.
          </p>
        ) : !numbers || numbers.length === 0 ? (
          <EmptyState isOwner={isOwner} />
        ) : (
          <NumberList numbers={numbers} isOwner={isOwner} />
        )}
      </CardContent>
    </Card>
  )
}

function RegisterForm() {
  const [phoneInput, setPhoneInput] = useState("")
  const register = useRegisterOrgNumber()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = phoneInput.replace(/[\s\-()]/g, "")
    if (!normalized.startsWith("+")) {
      toast.error("Phone number must start with + (E.164 format)")
      return
    }
    try {
      await register.mutateAsync({ phone_number: normalized })
      toast("Phone number registered")
      setPhoneInput("")
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to register number"
      toast.error(message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1 space-y-1">
        <Label htmlFor="register-phone">Register a phone number</Label>
        <Input
          id="register-phone"
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={register.isPending || !phoneInput.trim()}>
        {register.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="mr-2 h-4 w-4" />
        )}
        Register
      </Button>
    </form>
  )
}

function EmptyState({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center">
      <p className="text-sm text-muted-foreground">
        No phone numbers registered yet.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {isOwner
          ? "Add your first Twilio phone number above to get started."
          : "An org owner needs to register phone numbers."}
      </p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
          <div className="ml-auto">
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      ))}
    </div>
  )
}

function NumberList({
  numbers,
  isOwner,
}: {
  numbers: OrgPhoneNumber[]
  isOwner: boolean
}) {
  return (
    <div className="space-y-3">
      {numbers.map((num) => (
        <NumberRow key={num.id} number={num} isOwner={isOwner} />
      ))}
    </div>
  )
}

function NumberRow({
  number,
  isOwner,
}: {
  number: OrgPhoneNumber
  isOwner: boolean
}) {
  const sync = useSyncOrgNumber()
  const setDefault = useSetDefaultNumber()
  const deleteNumber = useDeleteOrgNumber()

  const syncedText = number.capabilities_synced_at
    ? `Synced ${formatDistanceToNow(new Date(number.capabilities_synced_at))} ago`
    : "Never synced"

  function handleDelete() {
    if (
      !window.confirm(
        "Remove this number? If it is a default, the default will be cleared.",
      )
    ) {
      return
    }
    deleteNumber.mutate(number.id, {
      onSuccess: () => toast("Phone number removed"),
      onError: () => toast.error("Failed to remove number"),
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:gap-4">
      {/* Number info */}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-medium">
          {number.phone_number}
        </p>
        {number.friendly_name && (
          <p className="text-xs text-muted-foreground">
            {number.friendly_name}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{syncedText}</p>
      </div>

      {/* Capability badges */}
      <div className="flex flex-wrap gap-1">
        {number.voice_capable && (
          <Badge className="bg-green-600 text-white hover:bg-green-600">
            Voice
          </Badge>
        )}
        {number.sms_capable && (
          <Badge className="bg-green-600 text-white hover:bg-green-600">
            SMS
          </Badge>
        )}
        {number.mms_capable && (
          <Badge className="bg-green-600 text-white hover:bg-green-600">
            MMS
          </Badge>
        )}
        {number.is_default_voice && (
          <Badge variant="outline">Default Voice</Badge>
        )}
        {number.is_default_sms && (
          <Badge variant="outline">Default SMS</Badge>
        )}
      </div>

      {/* Actions (owner only) */}
      {isOwner && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="Sync capabilities"
            disabled={sync.isPending}
            onClick={() =>
              sync.mutate(number.id, {
                onSuccess: () => toast("Capabilities synced"),
                onError: () => toast.error("Failed to sync"),
              })
            }
          >
            {sync.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>

          {number.voice_capable && !number.is_default_voice && (
            <Button
              variant="ghost"
              size="icon"
              title="Set as default voice"
              disabled={setDefault.isPending}
              onClick={() =>
                setDefault.mutate(
                  { id: number.id, capability: "voice" },
                  {
                    onSuccess: () => toast("Set as default voice number"),
                    onError: () => toast.error("Failed to set default"),
                  },
                )
              }
            >
              <Phone className="h-4 w-4" />
            </Button>
          )}

          {number.sms_capable && !number.is_default_sms && (
            <Button
              variant="ghost"
              size="icon"
              title="Set as default SMS"
              disabled={setDefault.isPending}
              onClick={() =>
                setDefault.mutate(
                  { id: number.id, capability: "sms" },
                  {
                    onSuccess: () => toast("Set as default SMS number"),
                    onError: () => toast.error("Failed to set default"),
                  },
                )
              }
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            title="Remove number"
            disabled={deleteNumber.isPending}
            onClick={handleDelete}
            className="text-destructive hover:text-destructive"
          >
            {deleteNumber.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
