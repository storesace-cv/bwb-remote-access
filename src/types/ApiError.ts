/**
 * Normalized API Error type for consistent error handling
 */

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "status" in error
  );
}

/**
 * Creates an ApiError from various error sources
 */
export function createApiError(
  source: unknown,
  defaultMessage = "An unexpected error occurred",
  defaultStatus = 500
): ApiError {
  if (isApiError(source)) {
    return source;
  }

  if (source instanceof Error) {
    return {
      code: "client_error",
      message: source.message || defaultMessage,
      status: defaultStatus,
    };
  }

  if (typeof source === "object" && source !== null) {
    const obj = source as Record<string, unknown>;
    return {
      code: String(obj.error ?? obj.code ?? "unknown_error"),
      message: String(obj.message ?? obj.error_description ?? defaultMessage),
      status: typeof obj.status === "number" ? obj.status : defaultStatus,
      details: obj,
    };
  }

  return {
    code: "unknown_error",
    message: String(source) || defaultMessage,
    status: defaultStatus,
  };
}
