/**
 * Centralized API client for consistent request handling
 * Handles headers, authentication, and error normalization
 */

import { ApiError, createApiError } from "@/types/ApiError";

const supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  error: ApiError | null;
  status: number;
}

/**
 * Gets the JWT token from localStorage
 */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("rustdesk_jwt");
}

/**
 * Stores the JWT token in localStorage
 */
export function storeToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("rustdesk_jwt", token);
}

/**
 * Clears the stored JWT token
 */
export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("rustdesk_jwt");
}

/**
 * Decodes a JWT and extracts the subject (user ID)
 */
export function decodeJwtSubject(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
      const payload = JSON.parse(payloadJson) as { sub?: string };
      return payload.sub ?? null;
    }
  } catch {
    // Invalid JWT format
  }
  return null;
}

/**
 * Builds the full URL for Supabase Edge Functions
 */
function buildEdgeFunctionUrl(functionName: string): string {
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

/**
 * Builds the full URL for Supabase REST API
 */
function buildRestUrl(path: string): string {
  return `${supabaseUrl}/rest/v1/${path}`;
}

/**
 * Creates standard headers for API requests
 */
function createHeaders(token: string | null, extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: anonKey,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
  }

  return headers;
}

/**
 * Parses the response body, handling both JSON and non-JSON responses
 */
async function parseResponseBody<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type");
  
  if (contentType?.includes("application/json")) {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }
  
  // For blob responses (like QR images)
  if (contentType?.includes("image/")) {
    return (await response.blob()) as unknown as T;
  }

  // For text responses
  try {
    const text = await response.text();
    return text as unknown as T;
  } catch {
    return null;
  }
}

/**
 * Extracts error information from a failed response
 */
async function extractErrorFromResponse(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    return createApiError(body, "Request failed", response.status);
  } catch {
    return {
      code: "request_failed",
      message: `Request failed with status ${response.status}`,
      status: response.status,
    };
  }
}

/**
 * Generic request handler for Edge Functions
 */
export async function callEdgeFunction<T>(
  functionName: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  const token = getStoredToken();
  const { method = "GET", body, headers: extraHeaders, timeout = 30000 } = options;

  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      data: null,
      error: {
        code: "config_error",
        message: "Supabase configuration missing. Contact administrator.",
        status: 500,
      },
      status: 500,
    };
  }

  const url = buildEdgeFunctionUrl(functionName);
  const headers = createHeaders(token, extraHeaders);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await extractErrorFromResponse(response);
      return {
        ok: false,
        data: null,
        error,
        status: response.status,
      };
    }

    const data = await parseResponseBody<T>(response);
    return {
      ok: true,
      data,
      error: null,
      status: response.status,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        data: null,
        error: {
          code: "timeout",
          message: "Request timed out",
          status: 408,
        },
        status: 408,
      };
    }

    if (err instanceof TypeError && err.message === "Failed to fetch") {
      return {
        ok: false,
        data: null,
        error: {
          code: "network_error",
          message: "Failed to connect to server. Check your network connection.",
          status: 0,
        },
        status: 0,
      };
    }

    return {
      ok: false,
      data: null,
      error: createApiError(err),
      status: 500,
    };
  }
}

/**
 * Generic request handler for REST API queries
 */
export async function callRestApi<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  const token = getStoredToken();
  const { method = "GET", body, headers: extraHeaders, timeout = 30000 } = options;

  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      data: null,
      error: {
        code: "config_error",
        message: "Supabase configuration missing. Contact administrator.",
        status: 500,
      },
      status: 500,
    };
  }

  const url = buildRestUrl(path);
  const headers = createHeaders(token, extraHeaders);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await extractErrorFromResponse(response);
      return {
        ok: false,
        data: null,
        error,
        status: response.status,
      };
    }

    const data = await parseResponseBody<T>(response);
    return {
      ok: true,
      data,
      error: null,
      status: response.status,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        data: null,
        error: {
          code: "timeout",
          message: "Request timed out",
          status: 408,
        },
        status: 408,
      };
    }

    return {
      ok: false,
      data: null,
      error: createApiError(err),
      status: 500,
    };
  }
}

/**
 * Fetch QR image (returns blob URL)
 */
export async function fetchQrImage(): Promise<ApiResponse<string>> {
  const token = getStoredToken();

  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      data: null,
      error: {
        code: "config_error",
        message: "Supabase configuration missing.",
        status: 500,
      },
      status: 500,
    };
  }

  try {
    const url = buildEdgeFunctionUrl("generate-qr-image");
    const headers = createHeaders(token);

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const error = await extractErrorFromResponse(response);
      return { ok: false, data: null, error, status: response.status };
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    return { ok: true, data: blobUrl, error: null, status: 200 };
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: createApiError(err),
      status: 500,
    };
  }
}

/**
 * Call local Next.js API route
 */
export async function callLocalApi<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  const token = getStoredToken();
  const { method = "GET", body, headers: extraHeaders, timeout = 30000 } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await extractErrorFromResponse(response);
      return { ok: false, data: null, error, status: response.status };
    }

    const data = await parseResponseBody<T>(response);
    return { ok: true, data, error: null, status: response.status };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      data: null,
      error: createApiError(err),
      status: 500,
    };
  }
}

// Export configuration for components that need direct access
export { supabaseUrl, anonKey };
