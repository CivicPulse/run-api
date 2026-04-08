import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

interface SmsBulkSendSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipientCount: number
  isPending?: boolean
  onSubmit: (body: string) => Promise<void> | void
}

export function SmsBulkSendSheet({
  open,
  onOpenChange,
  recipientCount,
  isPending = false,
  onSubmit,
}: SmsBulkSendSheetProps) {
  const [body, setBody] = useState("")

  useEffect(() => {
    if (!open) {
      setBody("")
    }
  }, [open])

  async function handleQueue() {
    const trimmed = body.trim()
    if (!trimmed || isPending) {
      return
    }
    await onSubmit(trimmed)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Send Bulk SMS</SheetTitle>
          <SheetDescription>
            Queue SMS to this segment? The selected recipients will receive this
            message from the chosen sender number.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-sm font-medium">Recipient count</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {recipientCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Messages are queued in the background so staff can keep working.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="bulk-sms-body" className="text-sm font-medium">
              Message body
            </label>
            <Textarea
              id="bulk-sms-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write the message that should go to this recipient set..."
              className="min-h-36 resize-none"
            />
          </div>
        </div>
        <SheetFooter className="border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleQueue()}
            disabled={isPending || body.trim().length === 0}
          >
            {isPending ? "Queueing..." : "Queue SMS"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
