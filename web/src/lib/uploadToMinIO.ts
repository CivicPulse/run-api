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
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)
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
