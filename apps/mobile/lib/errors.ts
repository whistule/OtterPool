/**
 * Pull the message out of a supabase.functions.invoke() failure.
 *
 * The client throws a FunctionsHttpError whose `.message` is a generic
 * "non-2xx status code" — the useful text is the `{ error }` body on the
 * attached Response, which has to be read asynchronously.
 */
/**
 * Turn a write that changed nothing into the failure it actually is.
 *
 * PostgREST reports an UPDATE or DELETE that RLS filtered down to zero rows as
 * a success: no error, no data. Callers that treat "no error" as "it saved"
 * then confirm a write that never happened — the screen shows the new value
 * from local state while the database still holds the old one.
 *
 * Pair with `.select()` on the mutation and pass the rows it returned.
 */
export function writeFailure(
  error: { message: string } | null,
  rows: unknown[] | null,
): string | null {
  if (error) {
    return error.message;
  }
  if (!rows || rows.length === 0) {
    return "That change didn't save — you may not have permission.";
  }
  return null;
}

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
