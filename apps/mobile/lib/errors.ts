/**
 * Pull the message out of a supabase.functions.invoke() failure.
 *
 * The client throws a FunctionsHttpError whose `.message` is a generic
 * "non-2xx status code" — the useful text is the `{ error }` body on the
 * attached Response, which has to be read asynchronously.
 */
export async function readErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error);
  if (
    error &&
    typeof error === 'object' &&
    'context' in error &&
    (error as { context?: unknown }).context instanceof Response
  ) {
    try {
      const body = await (error as { context: Response }).context.clone().json();
      return body?.error ?? body?.message ?? fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
