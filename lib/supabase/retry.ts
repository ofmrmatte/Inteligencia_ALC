export type SupabaseErrorLike = {
  message?: string;
  code?: string;
  status?: number;
} | null | undefined;

export function isTransientSupabaseError(error: SupabaseErrorLike) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  const code = String(error.code ?? "").toLowerCase();
  const status = Number(error.status ?? 0);

  return status >= 500
    || ["502", "503", "504"].includes(code)
    || [
      "timeout",
      "timed out",
      "connection",
      "connection reset",
      "connection terminated",
      "server closed",
      "fetch failed",
      "failed to fetch",
      "network",
      "temporarily unavailable",
      "database error",
      "too many connections",
    ].some((fragment) => message.includes(fragment));
}

export async function retrySupabaseResult<T extends { error: SupabaseErrorLike }>(
  operation: () => PromiseLike<T>,
  delaysMs: readonly number[] = [250, 750],
) {
  let result = await operation();
  for (const delayMs of delaysMs) {
    if (!isTransientSupabaseError(result.error)) break;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    result = await operation();
  }
  return result;
}
