import { describe, expect, it } from "vitest"
import { isSafeRedirect } from "./safeRedirect"

describe("isSafeRedirect", () => {
  it("accepts simple same-origin absolute path", () => {
    expect(isSafeRedirect("/campaigns/new")).toBe(true)
  })

  it("accepts paths with query strings and nested segments", () => {
    expect(
      isSafeRedirect("/campaigns/some-id/settings/general?tab=danger"),
    ).toBe(true)
  })

  it("accepts the root path", () => {
    expect(isSafeRedirect("/")).toBe(true)
  })

  it("rejects protocol-relative URLs", () => {
    expect(isSafeRedirect("//evil.com/x")).toBe(false)
  })

  it("rejects absolute http(s) URLs", () => {
    expect(isSafeRedirect("https://evil.com/x")).toBe(false)
  })

  it("rejects javascript: scheme", () => {
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false)
  })

  it("rejects data: scheme", () => {
    expect(isSafeRedirect("data:text/html,x")).toBe(false)
  })

  it("rejects empty string", () => {
    expect(isSafeRedirect("")).toBe(false)
  })

  it("rejects null", () => {
    expect(isSafeRedirect(null)).toBe(false)
  })

  it("rejects undefined", () => {
    expect(isSafeRedirect(undefined)).toBe(false)
  })

  it("rejects relative paths without leading slash", () => {
    expect(isSafeRedirect("relative-no-slash")).toBe(false)
  })

  it("accepts /login as a same-origin destination", () => {
    expect(isSafeRedirect("/login")).toBe(true)
  })
})
