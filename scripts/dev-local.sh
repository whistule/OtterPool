#!/usr/bin/env bash
# Run the web app against a throwaway local Supabase stack (`supabase start`,
# needs Docker), seeded with the e2e users and trips. This is what the launch
# button runs. Keys come from `supabase status`, so nothing here is a secret.
set -euo pipefail
cd "$(dirname "$0")/.."

supabase start
eval "$(supabase status -o env)"

# The browser may be on another machine (http://<host>:8081), so the app needs
# the stack's URL by hostname, not 127.0.0.1. The seed script runs here and
# keeps 127.0.0.1, which is what assert-dev-project.js accepts as local.
# Existing files are left alone, delete them to regenerate.
if [ ! -f apps/mobile/.env.local ]; then
  cat >apps/mobile/.env.local <<EOF
EXPO_PUBLIC_SUPABASE_URL=${API_URL/127.0.0.1/$(hostname)}
EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
EOF
fi
if [ ! -f supabase/config.secret.js ]; then
  cat >supabase/config.secret.js <<EOF
export const SUPABASE_URL = '$API_URL';
export const SUPABASE_SERVICE_ROLE_KEY = '$SERVICE_ROLE_KEY';
EOF
fi

npm --prefix supabase install
npm --prefix supabase run seed:e2e

cd apps/mobile
BROWSER=none exec npx expo start --web --clear
