import { parse } from 'dotenv';

/** @param {string} privatePem @param {string} jwks @returns {string} */
export function authEnvironment(privatePem, jwks) {
  const content = `JWT_PRIVATE_KEY="${privatePem}"\nJWKS='${jwks}'\n`;
  const parsed = parse(content);
  if (parsed.JWT_PRIVATE_KEY !== privatePem || parsed.JWKS !== jwks)
    throw new Error('Convex Auth key-file encoding did not round-trip. No values were written.');
  JSON.parse(parsed.JWKS);
  return content;
}
