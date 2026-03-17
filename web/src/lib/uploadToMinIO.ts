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
  // Rewrite HTTP presigned URLs to relative paths when on HTTPS to avoid
  // mixed-content blocking.  In dev the Vite proxy routes /voter-imports/*
  // to MinIO; in production presigned URLs are already HTTPS (R2/S3).
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
