import { describe, expect, it } from "vitest"
import {
  resolveApiTarget,
  resolveHmrConfig,
  resolveMinioTarget,
  resolveWebExternalPort,
} from "./vite.helpers"

describe("vite helpers", () => {
  it("uses explicit proxy targets when provided", () => {
    expect(resolveApiTarget({ API_PROXY_TARGET: "http://api:8000" })).toBe(
      "http://api:8000",
    )
    expect(
      resolveMinioTarget({ MINIO_PROXY_TARGET: "http://minio:9000" }),
    ).toBe("http://minio:9000")
  })

  it("derives local proxy targets from repo host ports", () => {
    expect(
      resolveApiTarget({ API_HOST_PORT: "49371", DISABLE_TLS: "true" }),
    ).toBe("http://localhost:49371")
    expect(resolveMinioTarget({ MINIO_HOST_PORT: "49376" })).toBe(
      "http://localhost:49376",
    )
  })

  it("keeps local dev HMR on the real dev port", () => {
    expect(resolveWebExternalPort({}, false)).toBe(5173)
    expect(
      resolveHmrConfig({
        isDocker: false,
        useHttps: true,
        tailscaleHost: "kudzu.tail.example.ts.net",
        webExternalPort: 49372,
      }),
    ).toBeUndefined()
  })

  it("uses docker external ports for mapped HMR sessions", () => {
    expect(
      resolveWebExternalPort({ WEB_EXTERNAL_PORT: "49372" }, true),
    ).toBe(49372)
    expect(
      resolveHmrConfig({
        isDocker: true,
        useHttps: true,
        tailscaleHost: "kudzu.tail.example.ts.net",
        webExternalPort: 49372,
      }),
    ).toEqual({
      protocol: "wss",
      host: "kudzu.tail.example.ts.net",
      clientPort: 49372,
    })
  })
})
