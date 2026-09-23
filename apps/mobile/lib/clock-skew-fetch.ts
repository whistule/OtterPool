/**
 * Re-send a request that PostgREST rejected with PGRST303 "JWT issued at future".
 *
 * PGRST303 means PostgREST's clock is a second or two behind Auth's, so a token
 * minted moments ago looks like it was issued in the future. Only a *just
 * refreshed* token is young enough to trip it — which is exactly what a browser
 * tab mints when it wakes from a long sleep and auto-refreshes the session.
 * The token itself is fine, so re-sending the same request with the same token
 * works once PostgREST's clock catches up.
 *
 * Retrying is safe even for a write: PGRST303 is raised at the JWT gate, before
 * the statement reaches Postgres, so nothing was applied.
 *
 * ponytail: client-side cover for a server bug, fixed upstream in PostgREST
 * 14.18 / 16.3 — delete this once prod's infra is past that.
 */
export function clockSkewRetryingFetch(
  delaysMs: number[] = [1000, 2500],
  inner: typeof fetch = (input, init) => fetch(input, init),
): typeof fetch {
  return async (input, init) => {
    for (const delay of delaysMs) {
      const res = await inner(input, init);
      if (!(await isClockSkewRejection(res))) {
        return res;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return inner(input, init);
  };
}

async function isClockSkewRejection(res: Response): Promise<boolean> {
  if (res.status !== 401) {
    return false;
  }
  try {
    return (await res.clone().text()).includes('PGRST303');
  } catch {
    return false;
  }
}
