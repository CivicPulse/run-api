import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/campaigns/$campaignId/volunteers/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/campaigns/$campaignId/volunteers/roster",
      params,
    })
  },
})
