import { createFileRoute } from "@tanstack/react-router"

function PhoneBanking() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-muted-foreground">Phone banking mode coming soon</p>
    </div>
  )
}

export const Route = createFileRoute("/field/$campaignId/phone-banking")({
  component: PhoneBanking,
})
