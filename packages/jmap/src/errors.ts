/**
 * Error class for JMAP API errors.
 * @since 0.4.0
 */
export class JmapApiError extends Error {
  readonly statusCode?: number;
  readonly responseBody?: string;
  readonly jmapErrorType?: string;

  constructor(
    message: string,
    statusCode?: number,
    responseBody?: string,
    jmapErrorType?: string,
  ) {
    super(message);
    this.name = "JmapApiError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.jmapErrorType = jmapErrorType;
  }
}

/**
 * JMAP-specific error types from RFC 8620.
 * @since 0.4.0
 */
export const JMAP_ERROR_TYPES = {
  unknownCapability: "urn:ietf:params:jmap:error:unknownCapability",
  notJSON: "urn:ietf:params:jmap:error:notJSON",
  notRequest: "urn:ietf:params:jmap:error:notRequest",
  limit: "urn:ietf:params:jmap:error:limit",
} as const;

/**
 * Checks if the given error is a JMAP capability error.
 * @param error The error to check.
 * @returns `true` if the error is a JMAP capability error, `false` otherwise.
 * @since 0.4.0
 */
export function isCapabilityError(error: unknown): boolean {
  return error instanceof JmapApiError &&
    error.jmapErrorType === JMAP_ERROR_TYPES.unknownCapability;
}
