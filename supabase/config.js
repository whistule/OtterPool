// Template — copy to config.local.js (browser) and config.secret.js (Node scripts).
// Both are gitignored.
//
// config.local.js  — public keys only, loaded by HTML as a <script>
// config.secret.js — includes service role key, used by Node scripts only

const SUPABASE_URL = "https://your-project-ref.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key-here";
// const SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key-here";  // config.secret.js only
