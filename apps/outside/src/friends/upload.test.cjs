const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { ConvexHttpClient } = require('convex/browser');
const { api } = require('bruhs-api/api');
const { PartyAuthError } = require('./session.ts');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'upload.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', source)(
  (name) => {
    if (name === 'bruhs-api/api') return { api };
    if (name === 'convex/browser') return { ConvexHttpClient };
    if (name === './session') return { PartyAuthError };
    throw Error(`Unexpected import ${name}`);
  },
  loaded,
  loaded.exports,
);
const { createStepUpload } = loaded.exports;

test('the installed SDK sends one abortable HTTP upload, with no replay after cancellation', async () => {
  const previous = global.fetch;
  const calls = [];
  let started;
  const firstStarted = new Promise((resolve) => {
    started = resolve;
  });
  try {
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      started();
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(new Error('Upload aborted.')), { once: true }),
      );
    };
    let jwt = 'synthetic-first-token';
    const upload = createStepUpload('http://127.0.0.1:3210', () => jwt);
    const controller = new AbortController();
    const pending = upload('synthetic-user', [{ date: '2026-10-26', steps: 123 }], controller.signal);
    await firstStarted;
    assert.equal(calls[0].options.signal, controller.signal);
    assert.equal(new Headers(calls[0].options.headers).get('Authorization'), 'Bearer synthetic-first-token');
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.path, 'outside:submit');
    assert.equal(payload.args[0].expectedUserId, 'synthetic-user');
    assert.deepEqual(payload.args[0].days, [{ date: '2026-10-26', steps: 123 }]);
    controller.abort();
    await assert.rejects(pending, /aborted/);
    await new Promise(setImmediate);
    assert.equal(calls.length, 1);
    jwt = 'synthetic-next-token';
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ status: 'success', value: true, logLines: [] }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    assert.equal(
      await upload('next-user', [{ date: '2026-10-26', steps: 0 }], new AbortController().signal),
      true,
    );
    assert.equal(calls.length, 2);
    assert.equal(new Headers(calls[1].options.headers).get('Authorization'), 'Bearer synthetic-next-token');
  } finally {
    global.fetch = previous;
  }
});

test('already canceled or unauthenticated uploads never reach fetch', async () => {
  const previous = global.fetch;
  try {
    global.fetch = async () => {
      throw Error('must not send');
    };
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      createStepUpload('http://127.0.0.1:3210', () => 'synthetic')('user', [], controller.signal),
      /canceled/,
    );
    await assert.rejects(
      createStepUpload('http://127.0.0.1:3210', () => null)('user', [], new AbortController().signal),
      PartyAuthError,
    );
  } finally {
    global.fetch = previous;
  }
});
