import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const upstream = path.join(root, 'vendor/opencode/packages/opencode');
// Unique disposable folder preserves all existing upstream tests and relative imports.
const dir = mkdtempSync(path.join(upstream, 'test/oco-c2-'));
try {
  const file = path.join(dir, 'runtime.test.ts');
  copyFileSync(new URL('./c2-diff-runtime.test.ts', import.meta.url), file);
  const result = spawnSync('bun', ['test', file, '--timeout', '30000'], { cwd: upstream, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
