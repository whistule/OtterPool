// Guard for the service-role scripts (seed-e2e.js, setup-test-users.js).
//
// Those scripts create test users and delete fixture events using the service
// role key, which bypasses RLS entirely. Nothing structural stopped them being
// pointed at production — the only protection was that config.secret.js happens
// to hold the dev project's values. Since production now holds real member and
// payment data, make that assumption explicit and fail loudly instead.
//
// Dev is the Ireland project; production is cunkkdbfylimkktwgfle (London).
// A local `supabase start` stack is also fine, it's throwaway.
const DEV_PROJECT_REF = 'fguutbhbzradrdyrxixg';
const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

function isLocal(url) {
  try {
    return LOCAL_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function assertDevProject(url) {
  if (typeof url !== 'string' || !(url.includes(DEV_PROJECT_REF) || isLocal(url))) {
    throw new Error(
      `Refusing to run: expected the dev project (${DEV_PROJECT_REF}) or a local stack but config.secret.js ` +
        `points at "${url}".\n` +
        'These scripts create test users and delete fixture events with the service role key. ' +
        'Never point them at production.',
    );
  }
}
