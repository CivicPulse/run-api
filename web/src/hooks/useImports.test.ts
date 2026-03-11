import { describe, it } from "vitest"

describe("useImports", () => {
  describe("IMPT-01: initiate import job and XHR upload", () => {
    it.todo("initiates import job via POST /imports and returns upload_url")
    it.todo("uploadToMinIO calls XHR PUT with correct Content-Type and no Authorization header")
    it.todo("onProgress callback receives percent values 0-100")
  })

  describe("IMPT-02: detect columns returns suggested_mapping", () => {
    it.todo("useDetectColumns calls POST /imports/{id}/detect and returns detected_columns and suggested_mapping")
  })

  describe("IMPT-05: polling stops at terminal status", () => {
    it.todo("useImportJob returns refetchInterval: false when status is 'completed'")
    it.todo("useImportJob returns refetchInterval: false when status is 'failed'")
    it.todo("useImportJob polls every 3s when status is 'processing'")
  })

  describe("IMPT-06: import history with conditional polling", () => {
    it.todo("useImports polls every 3s when any job has status 'queued'")
    it.todo("useImports polls every 3s when any job has status 'processing'")
    it.todo("useImports stops polling when all jobs are terminal")
  })

  describe("IMPT-07: deriveStep maps status to wizard step", () => {
    it.todo("deriveStep('pending') returns 1")
    it.todo("deriveStep('uploaded') returns 2")
    it.todo("deriveStep('queued') returns 3")
    it.todo("deriveStep('processing') returns 3")
    it.todo("deriveStep('completed') returns 4")
    it.todo("deriveStep('failed') returns 4")
    it.todo("deriveStep with unknown status returns 1")
  })
})
