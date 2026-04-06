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
  // Fix URLs that Cloudflare may have rewritten.  When upload_base_url is
  // configured (e.g. https://files.civpulse.org), presigned URLs should target
  // that host.  Cloudflare sometimes rewrites the host in JSON response bodies
  // to match the site domain; undo that here.
  let url = uploadUrl
  try {
    const { upload_base_url } = getConfig()
    if (upload_base_url) {
      const uploadParts = new URL(uploadUrl)
      const baseParts = new URL(upload_base_url)
      if (uploadParts.host !== baseParts.host) {
        uploadParts.protocol = baseParts.protocol
        uploadParts.host = baseParts.host
        url = uploadParts.toString()
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
