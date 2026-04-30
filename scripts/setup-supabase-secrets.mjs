// Sets every Edge Function secret your project needs in one shot.
// Cross-platform: works in PowerShell, cmd, bash, zsh — anywhere Node runs.
//
// Usage:
//   1. Copy `.env.secrets.example` to `.env.secrets` (gitignored)
//   2. Fill in real values
//   3. Run: npm run sb:secrets
//
// Reads values from your local `.env.secrets` file, never hard-codes them.
// If the file is missing, prints the list of variables you need to set.

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, '..', '.env.secrets');

const REQUIRED = [
  'DODO_API_KEY',
  'DODO_WEBHOOK_SECRET',
  'DODO_ENVIRONMENT',
  'DODO_PRODUCT_MONTHLY',
  'DODO_PRODUCT_QUARTERLY',
  'DODO_PRODUCT_LIFETIME',
  'APP_URL',
];

// Optional — set whenever defined, skipped silently otherwise.
//   DODO_PRICE_*_CENTS / DODO_EXPECTED_CURRENCY: per-plan price guards used
//     by dodo-webhook to validate amounts on incoming events.
//   ADMIN_EMAILS / ENABLE_DEV_MUTATE: gates for the /account dev self-test
//     panel. ENABLE_DEV_MUTATE must be exactly "true" AND DODO_ENVIRONMENT
//     must NOT be "live_mode" — set on test/staging projects only.
const OPTIONAL = [
  'DODO_PRICE_MONTHLY_CENTS',
  'DODO_PRICE_QUARTERLY_CENTS',
  'DODO_PRICE_LIFETIME_CENTS',
  'DODO_EXPECTED_CURRENCY',
  'ADMIN_EMAILS',
  'ENABLE_DEV_MUTATE',
  'APP_URL_EXTRA_ORIGINS',
];

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip optional surrounding quotes.
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fromFile = parseEnvFile(envFile);
const SECRETS = {};
const missing = [];

for (const key of REQUIRED) {
  // Prefer the process env (CI/CD) and fall back to the local file.
  const val = process.env[key] ?? fromFile[key];
  if (!val) missing.push(key);
  else SECRETS[key] = val;
}

// Optionals: include if set, skip silently otherwise.
for (const key of OPTIONAL) {
  const val = process.env[key] ?? fromFile[key];
  if (val) SECRETS[key] = val;
}

if (missing.length) {
  console.error(`\n❌ Missing required secrets: ${missing.join(', ')}\n`);
  console.error(`   Either export them in your shell, or create:`);
  console.error(`     ${envFile}`);
  console.error(`   with one KEY=value per line. See .env.secrets.example for the template.\n`);
  process.exit(1);
}

const args = ['supabase', 'secrets', 'set'];
for (const [k, v] of Object.entries(SECRETS)) args.push(`${k}=${v}`);

console.log(`\nSetting ${Object.keys(SECRETS).length} secrets on Supabase…\n`);

const result = spawnSync('npx', args, { stdio: 'inherit', shell: true });

if (result.status !== 0) {
  console.error('\n❌ supabase secrets set failed.');
  console.error('   Common fixes:');
  console.error('   1. Run `npm run sb:init` first to create supabase/config.toml');
  console.error('   2. Run `npm run sb:link` to link your local repo to the project');
  process.exit(result.status ?? 1);
}

console.log(`
✓ Secrets set on Supabase.

Now deploy the Edge Functions:
  npm run sb:deploy
`);
