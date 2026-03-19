import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRecordDoorKnock } from "@/hooks/useWalkLists"

const RESULT_CODES = [
  { value: "supporter", label: "Supporter" },
  { value: "undecided", label: "Undecided" },
  { value: "opposed", label: "Opposed" },
  { value: "not_home", label: "Not Home" },
  { value: "come_back_later", label: "Come Back Later" },
  { value: "refused", label: "Refused" },
  { value: "moved", label: "Moved" },
  { value: "deceased", label: "Deceased" },
  { value: "inaccessible", label: "Inaccessible" },
]

const schema = z.object({
  result_code: z.string().min(1, "Result is required"),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface DoorKnockDialogProps {
  campaignId: string
  walkListId: string
  entryId: string | null
  voterId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DoorKnockDialog({
  campaignId,
  walkListId,
  entryId,
  voterId,
  open,
  onOpenChange,
}: DoorKnockDialogProps) {
  const record = useRecordDoorKnock(campaignId, walkListId)
  const {
    handleSubmit,
    setValue,
    register,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { result_code: "", notes: "" },
  })

  const onSubmit = (values: FormValues) => {
    if (!entryId || !voterId) return
    record.mutate(
      {
        walk_list_entry_id: entryId,
        voter_id: voterId,
        result_code: values.result_code,
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Door Knock</DialogTitle>
          <DialogDescription>Log the result of this door knock.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Result</Label>
            <Select onValueChange={(val) => setValue("result_code", val)}>
              <SelectTrigger>
                <SelectValue placeholder="Select result" />
              </SelectTrigger>
              <SelectContent>
                {RESULT_CODES.map((rc) => (
                  <SelectItem key={rc.value} value={rc.value}>
                    {rc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.result_code && (
              <p className="text-sm text-destructive">{errors.result_code.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="dk-notes">Notes</Label>
            <Textarea id="dk-notes" rows={3} {...register("notes")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? "Recording..." : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
