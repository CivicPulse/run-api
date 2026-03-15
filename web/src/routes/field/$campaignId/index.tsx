import { createFileRoute } from "@tanstack/react-router"

function FieldHub() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-muted-foreground">Field hub loading...</p>
    </div>
  )
}

export const Route = createFileRoute("/field/$campaignId/")({
  component: FieldHub,
})
