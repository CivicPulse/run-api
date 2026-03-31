/**
 * Upload a File to MinIO via a presigned PUT URL using XMLHttpRequest.
 *
 * Uses XHR (not fetch/ky) so no Authorization header is added by the ky
 * interceptor — presigned URLs are self-authenticated.
 */
export function uploadToMinIO(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  // Rewrite presigned URLs to relative paths so the request goes through
  // the Vite dev/preview proxy instead of directly to MinIO.  This avoids:
  //  - Mixed-content blocking (HTTPS page → HTTP MinIO)
  //  - Cross-origin XHR issues in headless Chromium (different port on localhost)
  // In production presigned URLs target the same origin (R2/S3) so no rewrite needed.
  let url = uploadUrl
  try {
    const parsed = new URL(uploadUrl)
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
