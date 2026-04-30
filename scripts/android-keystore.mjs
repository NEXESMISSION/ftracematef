// Guided generator for the TraceMate Android release-signing keystore.
//
// Why this matters: Google Play locks an app to its signing key forever.
// If you lose the keystore (or its password) after publishing, you cannot
// update the app on Play Store — ever. Back up the .jks file AND the
// passwords to a password manager the moment this script finishes.
//
// Run with `npm run android:keystore` from the app/ directory.

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const androidDir = resolve(root, 'android');
const jksPath = resolve(androidDir, 'tracemate-release.jks');
const propsPath = resolve(androidDir, 'keystore.properties');

const KEYTOOL = process.platform === 'win32'
  ? 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe'
  : 'keytool';

if (!existsSync(KEYTOOL) && process.platform === 'win32') {
  console.error(`keytool not found at ${KEYTOOL}.`);
  console.error('Install Android Studio (it ships JDK 21 + keytool) and re-run.');
  process.exit(1);
}

if (existsSync(jksPath)) {
  console.error(`Refusing to overwrite existing keystore at ${jksPath}`);
  console.error('Delete it manually if you really want to regenerate (this WILL break Play Store updates if the app is published).');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

console.log('');
console.log('============================================================');
console.log('  TraceMate Android release-signing keystore — setup');
console.log('============================================================');
console.log('');
console.log('This creates a .jks file that signs every Play Store release.');
console.log('You will use the same key forever for this app.');
console.log('');
console.log('IMPORTANT — back up these AFTER:');
console.log('  1. android/tracemate-release.jks');
console.log('  2. The two passwords you enter below');
console.log('Losing them = losing the ability to update your app on Play.');
console.log('');

const password = await ask('Choose a strong password (min 6 chars, you will need it forever): ');
if (!password || password.length < 6) {
  console.error('Password too short. Aborting.');
  rl.close();
  process.exit(1);
}
const confirm = await ask('Confirm password: ');
if (confirm !== password) {
  console.error('Passwords do not match. Aborting.');
  rl.close();
  process.exit(1);
}

const cn = (await ask('Your full name (CN, e.g. "Med Saief Allah"): ')).trim() || 'TraceMate';
const org = (await ask('Organization name (O, e.g. "TraceMate"): ')).trim() || 'TraceMate';
const country = ((await ask('Country code (C, 2 letters, e.g. "US"): ')).trim() || 'US').toUpperCase();

rl.close();

const dname = `CN=${cn}, O=${org}, C=${country}`;
console.log('');
console.log('Generating keystore... (this takes a few seconds)');

const result = spawnSync(KEYTOOL, [
  '-genkeypair',
  '-v',
  '-keystore', jksPath,
  '-alias', 'tracemate',
  '-keyalg', 'RSA',
  '-keysize', '2048',
  '-validity', '10000',
  '-storepass', password,
  '-keypass', password,
  '-dname', dname,
], { stdio: ['inherit', 'inherit', 'inherit'] });

if (result.status !== 0) {
  console.error('keytool failed.');
  process.exit(result.status ?? 1);
}

writeFileSync(propsPath,
  `storeFile=tracemate-release.jks\n` +
  `storePassword=${password}\n` +
  `keyAlias=tracemate\n` +
  `keyPassword=${password}\n`
);

console.log('');
console.log('Done.');
console.log(`  Keystore: ${jksPath}`);
console.log(`  Properties: ${propsPath}`);
console.log('');
console.log('Both files are gitignored. Back them up to a password manager NOW.');
console.log('Then run `npm run android:bundle` to produce a Play-Store-ready .aab.');
