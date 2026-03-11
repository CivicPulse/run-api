import { createFileRoute } from "@tanstack/react-router"

function ListDetailPage() {
  return <div>List Detail</div>
}

export const Route = createFileRoute("/campaigns/$campaignId/voters/lists/$listId")({
  component: ListDetailPage,
})
