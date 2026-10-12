#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The full acceptance set (docs/TEST-SCOPE.md). t004/t005 are the historical P0 suites.
export const DEFAULT_SUITES = ["p1a-chat", "p1a-identity", "p1b-sidebar", "p1b-narrow", "p1b-theme-load", "p1b-ime", "p1b-reconnect", "p1b-pending-send", "p1b-switch-pending", "c1-open-file", "c1-focus", "c2-diff-unavailable", "t010-recover", "t014-connection", "p1b-main-panel", "c3-fork", "t007-managed", "t007-multiroot", "t015-diagnostics", "c4-trajectory", "c5-runtime", "c6-inbox", "c7-result-card", "c12-new-session-draft"];
export const EXCLUDED_FILES = new Set(["vscode.mjs", "server.mjs", "run.mjs", "perf.mjs", "smoke.mjs"]);

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../..");

export function getAvailableSuites(e2eDir = currentDir) {
  if (!fs.existsSync(e2eDir)) return [];
  const entries = fs.readdirSync(e2eDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs") && !EXCLUDED_FILES.has(entry.name))
    .map((entry) => entry.name.slice(0, -4))
    .sort();
}

export function runSuites(suites, { e2eDir = currentDir, root = repoRoot } = {}) {
  const summary = [];

  for (const suite of suites) {
    const scriptPath = path.join(e2eDir, `${suite}.mjs`);
    if (!fs.existsSync(scriptPath)) {
      console.error(`[ERROR] Suite script not found: ${scriptPath}`);
      summary.push({
        suite,
        exitCode: 1,
        durationMs: 0,
      });
      continue;
    }

    console.log(`\n>>> Running E2E suite: ${suite} (${scriptPath})...\n`);
    const t0 = Date.now();
    const res = spawnSync(process.execPath, [scriptPath], {
      stdio: "inherit",
      cwd: root,
      env: process.env,
    });
    const durationMs = Date.now() - t0;
    const exitCode = res.status !== null ? res.status : 1;

    summary.push({
      suite,
      exitCode,
      durationMs,
    });
  }

  return summary;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes("--list")) {
    const available = getAvailableSuites();
    for (const suite of available) {
      console.log(suite);
    }
    process.exit(0);
  }

  const requestedSuites = argv.filter((arg) => !arg.startsWith("--"));
  const suitesToRun = requestedSuites.length > 0 ? requestedSuites : DEFAULT_SUITES;

  const results = runSuites(suitesToRun);

  console.log("\n=================== E2E Summary ===================");
  console.table(
    results.map((r) => ({
      suite: r.suite,
      "exit code": r.exitCode,
      "耗时": `${(r.durationMs / 1000).toFixed(2)}s`,
    }))
  );

  const anyFailed = results.some((r) => r.exitCode !== 0);
  process.exit(anyFailed ? 1 : 0);
}

const isDirectRun = Boolean(
  process.argv[1] && (
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    (typeof import.meta.filename === "string" && import.meta.filename === process.argv[1])
  )
);

if (isDirectRun) {
  main();
}
