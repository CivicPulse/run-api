import { createFileRoute } from "@tanstack/react-router"

function Canvassing() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-muted-foreground">Canvassing mode coming soon</p>
    </div>
  )
}

export const Route = createFileRoute("/field/$campaignId/canvassing")({
  component: Canvassing,
})
