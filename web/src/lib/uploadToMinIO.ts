/**
 * Upload a File to object storage via a presigned PUT URL using XMLHttpRequest.
 *
 * Uses XHR (not fetch/ky) so no Authorization header is added by the ky
 * interceptor — presigned URLs are self-authenticated.
 */
import { getConfig } from "../config"

export function uploadToMinIO(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  // Fix URLs that Cloudflare may have rewritten in the JSON response body.
  // Cloudflare rewrites R2 API endpoint URLs to the custom domain, breaking
  // presigned signatures. The config provides the correct upload_host (just
  // the hostname, not a full URL — Cloudflare won't rewrite bare hostnames).
  let url = uploadUrl
  try {
    const { upload_host } = getConfig()
    if (upload_host) {
      const parsed = new URL(uploadUrl)
      if (parsed.host !== upload_host) {
        parsed.host = upload_host
        parsed.protocol = "https:"
        url = parsed.toString()
      }
    }
  } catch {
    // Config not loaded or URL parsing failed; use as-is
  }

  // In local dev, rewrite HTTPS presigned URLs to relative paths so the
  // request goes through the Vite proxy instead of directly to MinIO.
  try {
    const parsed = new URL(url)
    if (
      window.location.protocol === "https:" &&
      parsed.protocol === "http:"
    ) {
      url = parsed.pathname + parsed.search
    }
  } catch {
    // URL parsing failed; use as-is
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", "text/csv")
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error("Upload network error"))
    xhr.send(file)
  })
}
