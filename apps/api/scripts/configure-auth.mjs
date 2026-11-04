import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authEnvironment } from './auth-environment.mjs';

const args = process.argv.slice(2);
if (args.some((value) => value !== '--prod')) throw new Error('Only --prod is supported.');
const run = (command) => spawnSync('pnpm', ['exec', 'convex', ...command, ...args], { encoding: 'utf8' });
const existing = ['JWT_PRIVATE_KEY', 'JWKS'].map((name) => run(['env', 'get', name]));
if (existing.every((result) => result.status === 0 && result.stdout.trim())) {
  try {
    const jwks = JSON.parse(existing[1].stdout.trim());
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) throw new Error('Empty key set');
  } catch {
    throw new Error(
      'Existing Convex Auth JWKS is invalid JSON. Restore the matching public key set; signing keys were not changed.',
    );
  }
  console.log('Convex Auth keys already exist; no values were changed.');
} else {
  if (existing.some((result) => result.status === 0 && result.stdout.trim()))
    throw new Error('Only one Convex Auth key exists. Restore the matching pair before continuing.');
  // RS256 requires an RSA key of at least 2048 bits (RFC 7518, section 3.3).
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).trim().replace(/\n/g, ' ');
  const jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicKey.export({ format: 'jwk' }) }] });
  const directory = mkdtempSync(join(tmpdir(), 'bruhs-convex-auth-'));
  try {
    const file = join(directory, '.env.keys');
    writeFileSync(file, authEnvironment(privatePem, jwks), { mode: 0o600 });
    const result = run(['env', 'set', '--from-file', file]);
    if (result.status !== 0)
      throw new Error(
        'Could not configure Convex Auth. Check the selected deployment and CLI login. No key values were printed.',
      );
    console.log('Configured Convex Auth signing keys on the selected deployment.');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
