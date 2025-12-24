import type { ResolvedJmapConfig } from "./config.ts";
import { JmapApiError } from "./errors.ts";

/**
 * Response from a successful blob upload.
 */
export interface BlobUploadResponse {
  readonly accountId: string;
  readonly blobId: string;
  readonly type: string;
  readonly size: number;
}

/**
 * Upload a blob to the JMAP server.
 *
 * @param config - The resolved JMAP configuration
 * @param uploadUrl - The upload URL template from the session (e.g., "https://server/upload/{accountId}")
 * @param accountId - The account ID to upload to
 * @param blob - The blob or file to upload
 * @param signal - Optional abort signal
 * @returns The upload response containing the blobId
 */
export async function uploadBlob(
  config: ResolvedJmapConfig,
  uploadUrl: string,
  accountId: string,
  blob: Blob | File,
  signal?: AbortSignal,
): Promise<BlobUploadResponse> {
  signal?.throwIfAborted();

  const url = uploadUrl.replace("{accountId}", accountId);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.bearerToken}`,
    "Content-Type": blob.type || "application/octet-stream",
  };

  // Add custom headers from config
  for (const [key, value] of Object.entries(config.headers)) {
    headers[key] = value;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  // Combine signals if an external signal is provided
  const combinedSignal = signal
    ? combineSignals(signal, controller.signal)
    : controller.signal;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: blob,
      signal: combinedSignal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new JmapApiError(
        `Blob upload failed: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    const result = (await response.json()) as BlobUploadResponse;
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Combine multiple abort signals into one.
 */
function combineSignals(
  ...signals: AbortSignal[]
): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }

  return controller.signal;
}
