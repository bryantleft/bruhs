const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const app = path.resolve(__dirname, '../..');
const compiled = ts.transpileModule(fs.readFileSync(path.join(app, 'app.config.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function evaluate(environment) {
  const module = { exports: {} };
  new Function('module', 'exports', 'process', compiled)(module, module.exports, { env: environment });
  const config = JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')).expo;
  const original = structuredClone(config);
  assert.equal(module.exports.default({ config }), config);
  assert.deepEqual(config, original);
}

for (const profile of [undefined, 'development', 'preview']) {
  test(`local configuration stays usable with ${profile ?? 'no'} EAS profile`, () => {
    evaluate({ EAS_BUILD_PROFILE: profile });
    evaluate({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_CONVEX_URL: 'http://127.0.0.1:3210' });
  });
}
for (const trigger of ['BRUHS_BUILD_ENV', 'EAS_BUILD_PROFILE']) {
  test(`${trigger} requires a hosted Convex URL and leaves native configuration intact`, () => {
    const env = { [trigger]: 'production' };
    assert.throws(() => evaluate(env), /Set EXPO_PUBLIC_CONVEX_URL/);
    evaluate({ ...env, EXPO_PUBLIC_CONVEX_URL: 'https://synthetic-release.convex.cloud' });
    for (const endpoint of [
      '',
      'not-a-url',
      'http://synthetic-release.convex.cloud',
      'https://localhost',
      'https://127.0.0.1',
      'https://0.0.0.0',
      'https://[::1]',
      'https://[::]',
      'https://[::ffff:0.0.0.0]',
      'https://[::ffff:127.0.0.1]',
      'https://synthetic-release.convex.site',
      'https://convex.cloud',
      'https://synthetic-release.convex.cloud.evil.invalid',
      'https://user:synthetic-password@synthetic-release.convex.cloud',
      'https://synthetic-release.convex.cloud/path',
      'https://synthetic-release.convex.cloud?key=synthetic-query',
      'https://synthetic-release.convex.cloud#fragment',
      ' https://synthetic-release.convex.cloud',
    ]) {
      assert.throws(
        () => evaluate({ ...env, EXPO_PUBLIC_CONVEX_URL: endpoint }),
        (error) =>
          /Set EXPO_PUBLIC_CONVEX_URL/.test(error.message) &&
          !error.message.includes('synthetic-password') &&
          !error.message.includes('synthetic-query'),
      );
    }
  });
}
