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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useGenerateWalkList } from "@/hooks/useWalkLists"
import type { TurfResponse } from "@/types/turf"

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  turf_id: z.string().min(1, "Turf is required"),
})

type FormValues = z.infer<typeof schema>

interface WalkListGenerateDialogProps {
  campaignId: string
  turfs: TurfResponse[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WalkListGenerateDialog({
  campaignId,
  turfs,
  open,
  onOpenChange,
}: WalkListGenerateDialogProps) {
  const generate = useGenerateWalkList(campaignId)
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", turf_id: "" },
  })

  const onSubmit = (values: FormValues) => {
    generate.mutate(values, {
      onSuccess: () => {
        reset()
        onOpenChange(false)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Walk List</DialogTitle>
          <DialogDescription>Create a new walk list from a turf.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wl-name">Name</Label>
            <Input id="wl-name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Turf</Label>
            <Select onValueChange={(val) => setValue("turf_id", val)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a turf" />
              </SelectTrigger>
              <SelectContent>
                {turfs.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.turf_id && <p className="text-sm text-destructive">{errors.turf_id.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={generate.isPending}>
              {generate.isPending ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
