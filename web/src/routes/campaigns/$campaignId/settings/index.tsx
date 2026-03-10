import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/campaigns/$campaignId/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/campaigns/$campaignId/settings/general",
      params: { campaignId: params.campaignId },
    })
  },
})
