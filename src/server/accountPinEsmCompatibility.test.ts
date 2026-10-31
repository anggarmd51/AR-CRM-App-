import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const jwksSourceDir = fileURLToPath(new URL('../../node_modules/jwks-rsa/src/', import.meta.url));

test('jwks-rsa ESM compatibility patch is restricted to the exact locked release', async () => {
  const [lockText, patchSource] = await Promise.all([
    readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/patch-jwks-rsa-esm.cjs', import.meta.url), 'utf8'),
  ]);
  const packageLock = JSON.parse(lockText) as { packages?: Record<string, { version?: string }> };

  assert.equal(packageLock.packages?.['node_modules/jwks-rsa']?.version, '4.1.0');
  assert.match(patchSource, /packageInfo\.version !== '4\.1\.0'/);
});

test('jwks-rsa CJS entry points lazily import jose without require(ESM)', async () => {
  const [utilsSource, passportSource, joseSource] = await Promise.all([
    readFile(new URL('utils.js', `file://${jwksSourceDir}`), 'utf8'),
    readFile(new URL('integrations/passport.js', `file://${jwksSourceDir}`), 'utf8'),
    readFile(new URL('jose.js', `file://${jwksSourceDir}`), 'utf8'),
  ]);

  assert.doesNotMatch(utilsSource, /require\(['"]jose['"]\)/);
  assert.doesNotMatch(passportSource, /require\(['"]jose['"]\)/);
  assert.match(utilsSource, /await getJose\(\)/);
  assert.match(passportSource, /getJose\(\)/);
  assert.match(joseSource, /new Function\(['"]specifier['"], ['"]return import\(specifier\)['"]\)/);

  const bundled = await transform(joseSource, { format: 'cjs', target: 'node22' });
  assert.match(bundled.code, /return import\(specifier\)/);
  assert.doesNotMatch(bundled.code, /require\(["']jose["']\)/);
});

test('Firebase Admin Auth and jose load when Node require(ESM) support is disabled', () => {
  const runtimeProbe = [
    "require('firebase-admin/auth');",
    "const { getJose } = require('jwks-rsa/src/jose');",
    "getJose().then((jose) => { if (typeof jose.importJWK !== 'function') process.exitCode = 1; });",
  ].join(' ');
  const result = spawnSync(
    process.execPath,
    ['--no-experimental-require-module', '-e', runtimeProbe],
    { cwd: projectRoot, encoding: 'utf8' },
  );

  assert.equal(
    result.status,
    0,
    `Firebase Admin Auth failed to initialize without require(ESM):\n${result.stderr || result.stdout}`,
  );
});
