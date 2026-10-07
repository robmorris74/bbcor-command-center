const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['index.html', 'properties.html', 'expenses.html', 'buyers.html', 'rentals.html'];
const retired = ['sw.js', 'app.js', 'app-v3.js'];

test('retired worker and bundles are absent; runtime never registers a worker', () => {
  for (const file of retired) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  for (const file of fs.readdirSync(root).filter(f => /\.(html|js)$/.test(f))) {
    assert.doesNotMatch(read(file), /serviceWorker\s*(?:\.\s*register|\[\s*['"]register['"]\s*\])/);
  }
});

for (const page of pages) {
  test(`${page} loads only the current app and resolves local assets`, () => {
    const html = read(page);
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(m => m[1]);
    assert.deepEqual(scripts.filter(s => /(?:^|\/)app(?:-v\d+)?\.js(?:[?#]|$)/.test(s)), ['app-v4.js']);
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]);
    for (const asset of assets.filter(a => !/^(?:https?:|#)/.test(a))) {
      assert.ok(fs.existsSync(path.join(root, asset.split(/[?#]/)[0])), `${page}: ${asset}`);
    }
    assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
  });

  test(`${page} still retires installed workers and cached shells`, async () => {
    const html = read(page);
    const cleanup = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map(m => m[1]).find(s => s.includes('serviceWorker'));
    assert.ok(cleanup, 'returning-browser migration is required');
    const unregistered = [], deleted = [];
    const caches = { keys: async () => ['bbcor-command-center-cloud-v1'], delete: async key => deleted.push(key) };
    vm.runInNewContext(cleanup, {
      navigator: { serviceWorker: { getRegistrations: async () => [
        { unregister: async () => unregistered.push('legacy') }
      ] } }, window: { caches }, caches
    });
    await new Promise(setImmediate);
    assert.deepEqual(unregistered, ['legacy']);
    assert.deepEqual(deleted, ['bbcor-command-center-cloud-v1']);
    // Unsupported APIs and rejected browser cleanup must not break loading.
    vm.runInNewContext(cleanup, { navigator: {}, window: {} });
    vm.runInNewContext(cleanup, {
      navigator: { serviceWorker: { getRegistrations: async () => { throw Error('unavailable'); } } },
      window: { caches }, caches: { keys: async () => { throw Error('unavailable'); } }
    });
    await new Promise(setImmediate);
  });
}

test('deployment instructions name the active app and required workspaces', () => {
  for (const doc of ['README.txt', 'DEPLOYMENT_GUIDE.txt']) {
    const text = read(doc);
    assert.match(text, /app-v4\.js/);
    assert.doesNotMatch(text, /^-\s+(?:sw\.js|app\.js|app-v3\.js)\s*$/m);
    for (const file of [...pages, 'buyer-core.js', 'rental-core.js', 'manifest.webmanifest']) {
      assert.ok(text.includes(file), `${doc}: ${file}`);
    }
  }
});
