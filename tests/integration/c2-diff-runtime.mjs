import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const upstream = path.join(root, 'vendor/opencode/packages/opencode');
// Suites to run; pass names (runtime, http) to pick a subset.
const all = { runtime: 'c2-diff-runtime.test.ts', http: 'c2-diff-http.test.ts' };
const picked = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(all);
// Unique disposable folder preserves all existing upstream tests and relative imports.
const dir = mkdtempSync(path.join(upstream, 'test/oco-c2-'));
try {
  const files = picked.map((name) => {
    if (!all[name]) throw new Error(`unknown suite ${name}; known: ${Object.keys(all).join(', ')}`);
    const file = path.join(dir, `${name}.test.ts`);
    copyFileSync(new URL(`./${all[name]}`, import.meta.url), file);
    return file;
  });
  const result = spawnSync('bun', ['test', ...files, '--timeout', '30000'], { cwd: upstream, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
