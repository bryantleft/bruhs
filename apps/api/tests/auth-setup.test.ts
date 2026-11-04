import { parse } from 'dotenv';
import { expect, it } from 'vitest';
import { authEnvironment } from '../scripts/auth-environment.mjs';

it('the exact setup file round-trips through the CLI dotenv parser as valid JWKS JSON', () => {
  const privatePem = '-----BEGIN PRIVATE KEY----- synthetic -----END PRIVATE KEY-----';
  const publicSet = { keys: [{ use: 'sig', kty: 'RSA', n: 'synthetic', e: 'AQAB' }] };
  const jwks = JSON.stringify(publicSet);
  const parsed = parse(authEnvironment(privatePem, jwks));
  expect(JSON.parse(parsed.JWKS)).toEqual(publicSet);
  expect(parsed.JWT_PRIVATE_KEY).toBe(privatePem);
  // The previous double encoding must continue to fail this contract.
  expect(() => JSON.parse(parse(`JWKS=${JSON.stringify(jwks)}\n`).JWKS)).toThrow();
});
