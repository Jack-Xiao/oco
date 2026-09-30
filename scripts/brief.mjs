#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  scanEvidence,
  collectGitInfo,
  analyzeVersionConsistency,
  generateReportPayload,
  writeReports,
  formatBriefTerminal,
} from "./lib/brief-collector.mjs";
import { runVerification } from "./lib/brief-verifier.mjs";

function findRepoRoot() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export function main(argv = process.argv.slice(2), options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  const exitFn = options.exitFn || process.exit;
  const isVerify = argv.includes("--verify") || argv.includes("verify");
  const isBuild = argv.includes("--build");

  if (isVerify) {
    const verifyResult = runVerification({
      cwd: repoRoot,
      build: isBuild,
      execFn: options.execFn,
      gitInfo: options.gitInfo,
    });

    // Read previous verify record from existing latest.json if available
    const reportsDir = path.join(repoRoot, ".oco-reports");
    const jsonPath = path.join(reportsDir, "latest.json");
    let priorVerify = null;

    if (fs.existsSync(jsonPath)) {
      try {
        const oldData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        priorVerify = oldData.currentVerify || oldData.previousVerify || null;
      } catch {
        priorVerify = null;
      }
    }

    // Always freshly collect Git and scan evidence (never reuse stale payload)
    const git = options.gitInfo || collectGitInfo(repoRoot);
    const runsDir = options.runsDir || path.join(repoRoot, "docs", "evidence", "runs");
    const scanResult = scanEvidence(runsDir);
    const versionAnalysis = analyzeVersionConsistency(scanResult.latestBySuite, git.head, git.dirty);

    const payload = generateReportPayload({
      git,
      scanResult,
      versionAnalysis,
      currentVerify: verifyResult,
      previousVerify: priorVerify,
    });

    writeReports(repoRoot, payload);
    return exitFn(verifyResult.exitCode);
  }

  // Brief Mode (offline summary, no tests executed)
  const reportsDir = path.join(repoRoot, ".oco-reports");
  const jsonPath = path.join(reportsDir, "latest.json");
  let previousVerify = null;
  if (fs.existsSync(jsonPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      previousVerify = existing.currentVerify || existing.previousVerify || null;
    } catch {
      previousVerify = null;
    }
  }

  const git = options.gitInfo || collectGitInfo(repoRoot);
  const runsDir = options.runsDir || path.join(repoRoot, "docs", "evidence", "runs");
  const scanResult = scanEvidence(runsDir);
  const versionAnalysis = analyzeVersionConsistency(scanResult.latestBySuite, git.head, git.dirty);

  const payload = generateReportPayload({
    git,
    scanResult,
    versionAnalysis,
    currentVerify: null,
    previousVerify,
  });

  writeReports(repoRoot, payload);

  const terminalOutput = formatBriefTerminal({
    git,
    scanResult,
    versionAnalysis,
    currentVerify: null,
    previousVerify,
  });

  console.log(terminalOutput);

  // Return non-zero exit code if corrupted JSON evidence is found
  const hasCorrupted = Boolean(scanResult.corrupted && scanResult.corrupted.length > 0);
  return exitFn(hasCorrupted ? 1 : 0);
}

const isDirectRun = Boolean(
  process.argv[1] &&
    (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
      (typeof import.meta.filename === "string" && import.meta.filename === process.argv[1]))
);

if (isDirectRun) {
  main();
}
