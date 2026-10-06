import { API_ENDPOINTS } from "@/lib/api-config";

/**
 * The hosted frontend proxies API calls through Vercel, which rejects request bodies over 4.5 MB
 * (FUNCTION_PAYLOAD_TOO_LARGE). Files are therefore sent in parts that stay well below that limit,
 * including multipart overhead, and the backend reassembles them.
 */
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

/** Parse a response as JSON; when it is not JSON (e.g. a proxy error page), turn its text into an error message. */
export async function readJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload ? (payload as { detail?: unknown }).detail : null;
    if (typeof detail === "string") throw new Error(detail);
    if (response.status === 413) throw new Error("The file is too large to upload.");
    throw new Error(text.split("\n")[0]?.trim() || `${fallbackError} (HTTP ${response.status})`);
  }
  if (payload === null) throw new Error(`${fallbackError}: the server returned an unexpected response.`);
  return payload as T;
}

function newUploadId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload a file in parts, then ask `completeUrl` to assemble and process it.
 * `onProgress` receives the share of bytes sent (0–1).
 */
export async function uploadInChunks<T>(
  file: File,
  completeUrl: string,
  { onProgress, fallbackError = "Upload failed" }: { onProgress?: (fraction: number) => void; fallbackError?: string } = {},
): Promise<T> {
  const uploadId = newUploadId();
  const totalChunks = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_BYTES));
  onProgress?.(0);
  for (let index = 0; index < totalChunks; index += 1) {
    const form = new FormData();
    form.append("chunk", file.slice(index * UPLOAD_CHUNK_BYTES, (index + 1) * UPLOAD_CHUNK_BYTES), `${file.name}.part${index}`);
    const response = await fetch(API_ENDPOINTS.uploadChunk(uploadId, index), { method: "POST", body: form });
    await readJsonResponse(response, fallbackError);
    onProgress?.(Math.min(1, ((index + 1) * UPLOAD_CHUNK_BYTES) / Math.max(file.size, 1)));
  }
  const response = await fetch(completeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_id: uploadId, filename: file.name, total_chunks: totalChunks }),
  });
  return readJsonResponse<T>(response, fallbackError);
}
