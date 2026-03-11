import { describe, it } from "vitest"

describe("useDNC", () => {
  it.todo("useDNCEntries fetches array (not paginated) from /api/v1/campaigns/{id}/dnc")
  it.todo("useAddDNCEntry posts to /api/v1/campaigns/{id}/dnc with phone_number and reason")
  it.todo("useImportDNC sends FormData multipart POST to /api/v1/campaigns/{id}/dnc/import")
  it.todo("useDeleteDNCEntry sends DELETE to /api/v1/campaigns/{id}/dnc/{id}")
})
