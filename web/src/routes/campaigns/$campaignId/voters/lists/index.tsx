import { createFileRoute } from "@tanstack/react-router"

function VoterListsPage() {
  return <div>Voter Lists</div>
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/lists/")({
  component: VoterListsPage,
})
