import { createFileRoute } from "@tanstack/react-router"

function VoterTagsPage() {
  return <div>Voter Tags</div>
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/tags/")({
  component: VoterTagsPage,
})
