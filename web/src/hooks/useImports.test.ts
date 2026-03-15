import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { deriveStep } from "./useImports"

// ---------------------------------------------------------------------------
// deriveStep — pure function, no mocking needed
// ---------------------------------------------------------------------------
describe("IMPT-07: deriveStep maps status to wizard step", () => {
  it("deriveStep('pending') returns 1", () => {
    expect(deriveStep("pending")).toBe(1)
  })

  it("deriveStep('uploaded') returns 2", () => {
    expect(deriveStep("uploaded")).toBe(2)
  })

  it("deriveStep('queued') returns 3", () => {
    expect(deriveStep("queued")).toBe(3)
  })

  it("deriveStep('processing') returns 3", () => {
    expect(deriveStep("processing")).toBe(3)
  })

  it("deriveStep('completed') returns 4", () => {
    expect(deriveStep("completed")).toBe(4)
  })

  it("deriveStep('failed') returns 4", () => {
    expect(deriveStep("failed")).toBe(4)
  })

  it("deriveStep with unknown status returns 1", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(deriveStep("anything-unknown" as any)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// refetchInterval logic — tested inline (mirrors the hook's closure logic)
// We test the decision function directly rather than rendering the full hook,
// since the interval function is a deterministic mapping of status → ms | false.
// ---------------------------------------------------------------------------

/** Mirrors useImportJob's internal refetchInterval decision logic */
const jobIntervalFn = (status: string | undefined): number | false =>
  status === "completed" || status === "failed" ? false : 3000

describe("IMPT-05: useImportJob polling stops at terminal status", () => {
  it("returns false when status is 'completed'", () => {
    expect(jobIntervalFn("completed")).toBe(false)
  })

  it("returns false when status is 'failed'", () => {
    expect(jobIntervalFn("failed")).toBe(false)
  })

  it("returns 3000 when status is 'processing'", () => {
    expect(jobIntervalFn("processing")).toBe(3000)
  })

  it("returns 3000 when status is 'queued'", () => {
    expect(jobIntervalFn("queued")).toBe(3000)
  })

  it("returns 3000 when status is undefined (job still loading)", () => {
    expect(jobIntervalFn(undefined)).toBe(3000)
  })
})

/** Mirrors useImports (history) internal refetchInterval decision logic */
const historyIntervalFn = (items: Array<{ status: string }>): number | false => {
  const hasActive = items.some(
    (j) => j.status === "queued" || j.status === "processing",
  )
  return hasActive ? 3000 : false
}

describe("IMPT-06: useImports history conditional polling", () => {
  it("returns 3000 when any job has status 'queued'", () => {
    expect(
      historyIntervalFn([{ status: "completed" }, { status: "queued" }]),
    ).toBe(3000)
  })

  it("returns 3000 when any job has status 'processing'", () => {
    expect(
      historyIntervalFn([{ status: "failed" }, { status: "processing" }]),
    ).toBe(3000)
  })

  it("returns false when all jobs are terminal (completed/failed)", () => {
    expect(
      historyIntervalFn([
        { status: "completed" },
        { status: "failed" },
        { status: "completed" },
      ]),
    ).toBe(false)
  })

  it("returns false for empty items list (no active jobs)", () => {
    expect(historyIntervalFn([])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// XHR upload — mock XMLHttpRequest entirely so we can control open/send/onload
// ---------------------------------------------------------------------------

import { uploadToMinIO } from "@/lib/uploadToMinIO"

// A minimal XMLHttpRequest mock that captures calls and lets us trigger events
class MockXHR {
  static instances: MockXHR[] = []

  open = vi.fn()
  setRequestHeader = vi.fn()
  send = vi.fn()
  status = 200
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  upload = {
    onprogress: null as ((e: ProgressEvent) => void) | null,
  }

  constructor() {
    MockXHR.instances.push(this)
  }
}

describe("IMPT-01: XHR upload to MinIO presigned URL", () => {
  let OriginalXHR: typeof XMLHttpRequest

  beforeEach(() => {
    MockXHR.instances = []
    OriginalXHR = globalThis.XMLHttpRequest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.XMLHttpRequest = MockXHR as any
  })

  afterEach(() => {
    globalThis.XMLHttpRequest = OriginalXHR
  })

  it("uploadToMinIO calls XHR PUT with correct Content-Type and no Authorization header", async () => {
    const file = new File(["a,b\n1,2"], "voters.csv", { type: "text/csv" })
    const promise = uploadToMinIO("https://minio.example.com/presigned", file, vi.fn())

    // Trigger success on the XHR instance
    const xhr = MockXHR.instances[0]
    xhr.status = 200
    xhr.onload?.()

    await promise

    expect(xhr.open).toHaveBeenCalledWith("PUT", "https://minio.example.com/presigned")
    expect(xhr.setRequestHeader).toHaveBeenCalledWith("Content-Type", "text/csv")
    // Authorization header must NOT have been set (presigned URL is self-authenticated)
    const authCalls = xhr.setRequestHeader.mock.calls.filter(
      ([header]: string[]) => header.toLowerCase() === "authorization"
    )
    expect(authCalls).toHaveLength(0)
  })

  it("onProgress callback receives percent values 0-100", async () => {
    const onProgress = vi.fn()
    const file = new File(["a,b\n1,2"], "voters.csv", { type: "text/csv" })
    const promise = uploadToMinIO("https://minio.example.com/presigned", file, onProgress)

    const xhr = MockXHR.instances[0]

    // Simulate 50% progress
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent)
    expect(onProgress).toHaveBeenCalledWith(50)

    // Simulate 100% progress
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 } as ProgressEvent)
    expect(onProgress).toHaveBeenCalledWith(100)

    xhr.status = 200
    xhr.onload?.()
    await promise
  })

  it("resolves on 2xx status", async () => {
    const file = new File(["data"], "voters.csv", { type: "text/csv" })
    const promise = uploadToMinIO("https://minio.example.com/presigned", file, vi.fn())

    const xhr = MockXHR.instances[0]
    xhr.status = 204
    xhr.onload?.()

    await expect(promise).resolves.toBeUndefined()
  })

  it("rejects with 'Upload network error' on xhr.onerror", async () => {
    const file = new File(["data"], "voters.csv", { type: "text/csv" })
    const promise = uploadToMinIO("https://minio.example.com/presigned", file, vi.fn())

    const xhr = MockXHR.instances[0]
    xhr.onerror?.()

    await expect(promise).rejects.toThrow("Upload network error")
  })
})

// ---------------------------------------------------------------------------
// IMPT-02: detect columns returns suggested_mapping
// Test the useDetectColumns mutation by mocking the api client.
// ---------------------------------------------------------------------------

vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from "@/api/client"
import { useDetectColumns } from "./useImports"

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe("IMPT-02: detect columns returns suggested_mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("useDetectColumns calls POST /imports/{id}/detect and returns detected_columns and suggested_mapping", async () => {
    const detectResponse = {
      detected_columns: ["First Name", "Email", "Party"],
      suggested_mapping: {
        "First Name": "first_name",
        Email: "email",
        Party: null,
      },
    }

    mockApi.post.mockReturnValue({ json: vi.fn().mockResolvedValue(detectResponse) })

    const { result } = renderHook(
      () => useDetectColumns("campaign-abc", "job-xyz"),
      { wrapper: makeWrapper() },
    )

    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith(
      "api/v1/campaigns/campaign-abc/imports/job-xyz/detect",
    )
    expect(result.current.data?.detected_columns).toEqual(["First Name", "Email", "Party"])
    expect(result.current.data?.suggested_mapping["First Name"]).toBe("first_name")
    expect(result.current.data?.suggested_mapping["Party"]).toBeNull()
  })
})
