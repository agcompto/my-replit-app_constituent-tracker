import { ApiError } from "@workspace/api-client-react";

/** Extract a user-facing message from a generated API client error. */
export function apiErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (error instanceof ApiError) {
    const data = error.data as { error?: string; message?: string } | null;
    return data?.error ?? data?.message ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
