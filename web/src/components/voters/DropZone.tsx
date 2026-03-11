import { useRef } from "react"
import { CloudUpload, CheckCircle2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface DropZoneProps {
  onFileSelect: (file: File) => void
  uploading: boolean
  progress: number
  error?: string
}

export function DropZone({ onFileSelect, uploading, progress, error }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) onFileSelect(file)
  }

  function handleClick() {
    inputRef.current?.click()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
  }

  if (uploading) {
    return (
      <div className="w-full rounded-lg border-2 border-dashed p-12 text-center">
        <p className="mb-4 text-sm text-muted-foreground">Uploading...</p>
        <Progress value={progress} className="h-2" />
        <p className="mt-2 text-sm text-muted-foreground">{progress}%</p>
      </div>
    )
  }

  if (progress === 100 && !uploading && !error) {
    return (
      <div className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <p className="mt-2 text-sm text-muted-foreground">Upload complete</p>
      </div>
    )
  }

  return (
    <div
      className="w-full cursor-pointer rounded-lg border-2 border-dashed p-12 text-center hover:border-primary/50 hover:bg-muted/20"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleChange}
      />
      <CloudUpload className="mx-auto h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-lg font-medium">Drag &amp; drop your CSV here</p>
      <p className="mt-1 text-sm text-muted-foreground">
        or{" "}
        <span className="text-primary underline-offset-4 hover:underline">
          click to browse
        </span>
      </p>
      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            className="mt-2 text-sm text-primary underline"
            onClick={(e) => {
              e.stopPropagation()
              inputRef.current?.click()
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
