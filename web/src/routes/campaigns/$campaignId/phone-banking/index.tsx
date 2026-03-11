import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/campaigns/$campaignId/phone-banking/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/campaigns/$campaignId/phone-banking/call-lists",
      params,
    })
  },
})
