import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export const DEFAULT_SUITES = [
  "p1a-chat",
  "p1a-identity",
  "p1b-sidebar",
  "p1b-narrow",
  "p1b-theme-load",
  "p1b-ime",
];

export const EXCLUDED_SUITES = new Set([
  "perf",
  "smoke",
  "vscode",
  "server",
  "run",
]);

export function sanitizeReason(reason, maxLength = 80) {
  if (typeof reason !== "string") {
    return typeof reason === "boolean" ? String(reason) : "explicit flag";
  }
  const clean = reason.replace(/[\r\n\t]+/g, " ").trim();
  if (clean.length > maxLength) {
    return clean.slice(0, maxLength - 3) + "...";
  }
  return clean;
}

/**
 * Checks if a run is a special run (negative control, mutation, debug, perf)
 * which must NOT be treated as a standard acceptance run.
 * Relies on explicit metadata markers or controlled known purposes, never guessing by name.
 */
export function isSpecialRun(meta = {}, results = [], suite = "", runId = "") {
  // 1. Explicit metadata markers (boolean or descriptive reason)
  if (meta?.negativeControl) {
    return { isSpecial: true, type: "negative-control", reason: sanitizeReason(meta.negativeControl) };
  }
  if (meta?.mutation) {
    return { isSpecial: true, type: "mutation", reason: sanitizeReason(meta.mutation) };
  }
  if (meta?.debug) {
    return { isSpecial: true, type: "debug", reason: sanitizeReason(meta.debug) };
  }
  // Runs against the scripted local model are fast regression checks, never real-model acceptance.
  if (meta?.modelMode === "mock") {
    return { isSpecial: true, type: "mock-model", reason: "scripted mock model (OCO_E2E_MODEL=mock)" };
  }

  // 2. Controlled known purpose / category
  const purpose = String(meta?.purpose || meta?.category || meta?.specialType || "").toLowerCase();
  if (purpose === "negative-control" || purpose === "negative_control" || purpose === "negative") {
    return { isSpecial: true, type: "negative-control", reason: sanitizeReason(meta?.purposeReason || "explicit purpose: negative-control") };
  }
  if (purpose === "mutation") {
    return { isSpecial: true, type: "mutation", reason: sanitizeReason(meta?.purposeReason || "explicit purpose: mutation") };
  }
  if (purpose === "debug") {
    return { isSpecial: true, type: "debug", reason: sanitizeReason(meta?.purposeReason || "explicit purpose: debug") };
  }
  if (purpose === "perf" || purpose === "benchmark") {
    return { isSpecial: true, type: "perf", reason: sanitizeReason(meta?.purposeReason || "explicit purpose: perf") };
  }

  // 3. Controlled known suite names (e.g. perf benchmark suite)
  const suiteExact = String(suite || meta?.suite || "").toLowerCase();
  if (suiteExact === "perf") {
    return { isSpecial: true, type: "perf", reason: "controlled suite: perf benchmark" };
  }

  // 4. Step-level explicit metadata flags
  for (const r of results || []) {
    if (r?.detail?.negativeControl) {
      return { isSpecial: true, type: "negative-control", reason: "step marked as negative control" };
    }
    if (r?.detail?.mutation) {
      return { isSpecial: true, type: "mutation", reason: "step marked as mutation" };
    }
    if (r?.detail?.debug) {
      return { isSpecial: true, type: "debug", reason: "step marked as debug" };
    }
  }

  // DO NOT guess special run by substrings in suite name or runId. Unclassified FAILs are preserved.
  return { isSpecial: false };
}

/**
 * Scans the evidence runs directory and collects suites, special runs, corrupted runs, and empty runs.
 */
export function scanEvidence(runsDir, options = {}) {
  const targetSuites = options.targetSuites || DEFAULT_SUITES;
  const result = {
    runs: [],
    latestBySuite: {},
    specialRuns: [],
    corrupted: [],
    empty: [],
    missingSuites: [],
  };

  if (!fs.existsSync(runsDir)) {
    result.empty.push({ runId: "N/A", path: runsDir, reason: "Evidence runs directory does not exist" });
    result.missingSuites = [...targetSuites];
    return result;
  }

  let entries = [];
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch (err) {
    result.corrupted.push({ runId: "N/A", path: runsDir, error: `Directory read error: ${err.message}` });
    result.missingSuites = [...targetSuites];
    return result;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runId = entry.name;
    const resultsPath = path.join(runsDir, runId, "results.json");

    if (!fs.existsSync(resultsPath)) {
      result.empty.push({ runId, path: resultsPath, reason: "Missing results.json" });
      continue;
    }

    let raw;
    try {
      raw = fs.readFileSync(resultsPath, "utf8");
    } catch {
      result.corrupted.push({ runId, path: resultsPath, error: "File read error" });
      continue;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      // Do not leak raw input snippets from JSON.parse errors
      const posMatch = err?.message ? err.message.match(/at position \d+/i) || err.message.match(/line \d+ column \d+/i) : null;
      const pos = posMatch ? ` (${posMatch[0]})` : "";
      result.corrupted.push({ runId, path: resultsPath, error: `Invalid JSON syntax${pos}` });
      continue;
    }

    if (!data || typeof data !== "object") {
      result.corrupted.push({ runId, path: resultsPath, error: "Root is not a valid JSON object" });
      continue;
    }

    const isInProgress = data.status === "in_progress" || data.status === "running" || data.inProgress === true;
    const resultsArr = Array.isArray(data.results) ? data.results : null;

    if (!resultsArr || resultsArr.length === 0 || isInProgress) {
      const reason = isInProgress
        ? "Run in-progress or incomplete"
        : "Results array is empty or missing";
      result.empty.push({
        runId,
        path: resultsPath,
        reason,
        inProgress: Boolean(isInProgress),
      });
      continue;
    }

    let dirty = null;
    if (typeof data.ocoDirty === "boolean") {
      dirty = data.ocoDirty;
    } else {
      // Non-boolean dirty (string, number, missing) is unknown, never coerced to false/true.
      dirty = null;
    }

    const suite = data.suite || runId.split("-").slice(2, -1).join("-") || "unknown";
    const special = isSpecialRun(data, resultsArr, suite, runId);

    if (special.isSpecial) {
      result.specialRuns.push({
        runId,
        suite,
        type: special.type,
        reason: special.reason,
        commit: data.ocoCommit || null,
        shortCommit: data.ocoCommit ? data.ocoCommit.slice(0, 7) : "unknown",
        dirty,
        exitCode: typeof data.exitCode === "number" ? data.exitCode : null,
        startedAt: data.startedAt || null,
      });
      continue;
    }

    // Regular acceptance run candidate
    const summary = {
      PASS: 0,
      FAIL: 0,
      "NOT RUN": 0,
      BLOCKED: 0,
      "N/A": 0,
    };
    for (const r of resultsArr) {
      const st = r && typeof r.status === "string" ? r.status : "UNKNOWN";
      if (summary[st] !== undefined) {
        summary[st]++;
      } else {
        summary[st] = (summary[st] || 0) + 1;
      }
    }

    const missingRequired = Array.isArray(data.missingRequired)
      ? data.missingRequired
      : (Array.isArray(data.required) ? data.required.filter((reqId) => {
          const matched = resultsArr.find((r) => r.id === reqId);
          return !matched || matched.status !== "PASS";
        }) : []);

    // Stored summary is trusted only when it matches counted results.
    // A stored PASS count that disagrees with results cannot forge a pass.
    const stored = data.summary;
    const summaryMatches = stored && typeof stored === "object" && !Array.isArray(stored)
      && ["PASS", "FAIL", "NOT RUN", "BLOCKED", "N/A"].every((key) => {
        const storedCount = stored[key];
        const counted = summary[key] || 0;
        if (storedCount === undefined) return counted === 0;
        return storedCount === counted;
      });
    const trustedSummary = summaryMatches ? stored : summary;

    let exitCode = null;
    if (typeof data.exitCode === "number") {
      exitCode = data.exitCode;
    } else {
      // Unknown / non-numeric exitCode is never treated as 0.
      if (
        trustedSummary.FAIL > 0 ||
        missingRequired.length > 0 ||
        trustedSummary["NOT RUN"] > 0 ||
        trustedSummary.BLOCKED > 0 ||
        !summaryMatches
      ) {
        exitCode = 1;
      } else {
        exitCode = null;
      }
    }

    const runRecord = {
      runId,
      suite,
      commit: data.ocoCommit || null,
      shortCommit: data.ocoCommit ? data.ocoCommit.slice(0, 7) : "unknown",
      dirty,
      startedAt: data.startedAt || null,
      finishedAt: data.finishedAt || null,
      exitCode,
      summary: trustedSummary,
      summaryTrusted: summaryMatches,
      missingRequired,
      tests: resultsArr.map((t) => ({ id: t.id, status: t.status })),
    };

    result.runs.push(runRecord);
  }

  // Sort candidate runs by startedAt descending (or runId timestamp descending)
  result.runs.sort((a, b) => {
    const timeA = a.startedAt || a.runId;
    const timeB = b.startedAt || b.runId;
    return timeB.localeCompare(timeA);
  });

  // Pick latest for each suite
  for (const r of result.runs) {
    if (!result.latestBySuite[r.suite]) {
      result.latestBySuite[r.suite] = r;
    }
  }

  // Check missing target suites
  for (const suite of targetSuites) {
    if (!result.latestBySuite[suite]) {
      result.missingSuites.push(suite);
    }
  }

  return result;
}

/**
 * Collects Git HEAD commit and dirty status safely without reading user gitconfig.
 */
export function collectGitInfo(cwd = process.cwd()) {
  let head = null;
  let shortHead = null;
  let dirty = null;

  try {
    const out = execSync("git rev-parse HEAD", {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    head = out.trim() || null;
    shortHead = head ? head.slice(0, 7) : null;
  } catch {
    head = "unknown";
    shortHead = "unknown";
  }

  try {
    const out = execSync("git status --porcelain", {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    const lines = out.split("\n").map((l) => l.trimEnd()).filter(Boolean);
    const nonEvidenceLines = lines.filter((line) => {
      let filePath = line.slice(3).trim();
      if (filePath.startsWith('"') && filePath.endsWith('"')) {
        filePath = filePath.slice(1, -1);
      }
      if (filePath.startsWith("docs/evidence/runs/")) return false;
      if (filePath === "docs/evidence/runs") return false;
      if (filePath.startsWith(".oco-reports/")) return false;
      if (filePath === ".oco-reports") return false;
      if (filePath.includes(" -> ")) {
        const parts = filePath.split(" -> ").map((p) => p.trim().replace(/^"|"$/g, ""));
        if (parts.every((p) => p.startsWith("docs/evidence/runs/") || p === "docs/evidence/runs" || p.startsWith(".oco-reports/"))) {
          return false;
        }
      }
      return true;
    });
    dirty = nonEvidenceLines.length > 0;
  } catch {
    dirty = null;
  }

  return { head, shortHead, dirty };
}

/**
 * Analyzes whether suites share identical code revision and match Git HEAD.
 * Strictly prevents stitching together cross-version PASS.
 */
export function analyzeVersionConsistency(latestBySuite, gitHead, gitDirty) {
  const suites = Object.keys(latestBySuite);
  if (suites.length === 0) {
    return {
      allSameRevision: false,
      matchesCurrentHead: false,
      revisions: [],
      hasDirty: false,
      status: "NO_EVIDENCE",
      message: "No acceptance suites recorded.",
    };
  }

  const revisions = Array.from(new Set(suites.map((s) => latestBySuite[s].shortCommit)));
  const anyDirty = suites.some((s) => latestBySuite[s].dirty === true);
  const anyUnknownDirty = suites.some((s) => latestBySuite[s].dirty === null || latestBySuite[s].dirty === undefined) || gitDirty === null;
  const allSameRevision = revisions.length === 1 && revisions[0] !== "unknown";

  const headShort = gitHead ? gitHead.slice(0, 7) : null;
  const matchesCurrentHead = Boolean(allSameRevision && headShort && revisions[0] === headShort);

  let status = "OK";
  let message = "All suites recorded on identical revision matching current HEAD.";

  if (!allSameRevision) {
    status = "MIXED_REVISIONS";
    message = `Suites recorded on multiple revisions (${revisions.join(", ")}). Prohibited from stitching cross-version PASS.`;
  } else if (!matchesCurrentHead) {
    status = "REVISION_MISMATCH";
    message = `Suites recorded on ${revisions[0]}, but current Git HEAD is ${headShort || "unknown"}.`;
  } else if (anyDirty || gitDirty === true) {
    status = "DIRTY_WORKSPACE";
    message = "Recorded run or current workspace has uncommitted changes (dirty).";
  } else if (anyUnknownDirty) {
    status = "UNKNOWN_DIRTY";
    message = "Workspace or recorded run dirty status could not be determined.";
  }

  return {
    allSameRevision,
    matchesCurrentHead,
    revisions,
    hasDirty: anyDirty,
    status,
    message,
  };
}

/**
 * Generates sanitized whitelisted report payload without logs, prompts, tokens, or URLs.
 */
export function generateReportPayload({
  git,
  scanResult,
  versionAnalysis,
  currentVerify = null,
  previousVerify = null,
}) {
  const suitesList = Object.values(scanResult.latestBySuite || {}).map((s) => ({
    suite: s.suite,
    runId: s.runId,
    recordedRevision: s.commit,
    recordedShortRevision: s.shortCommit,
    recordedDirty: s.dirty,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    exitCode: s.exitCode,
    summary: s.summary,
    missingRequired: s.missingRequired,
    tests: s.tests || [],
  }));

  return {
    generatedAt: new Date().toISOString(),
    tool: "oco-brief",
    metadata: {
      provider: "unknown",
      model: "unknown",
    },
    git: {
      head: git.head,
      shortHead: git.shortHead,
      dirty: git.dirty,
    },
    versionConsistency: versionAnalysis,
    suites: suitesList,
    specialRuns: scanResult.specialRuns || [],
    integrity: {
      corrupted: scanResult.corrupted || [],
      empty: scanResult.empty || [],
      missingSuites: scanResult.missingSuites || [],
    },
    currentVerify: currentVerify || null,
    previousVerify: previousVerify || null,
  };
}

/**
 * Generates clean Markdown report content.
 */
export function generateMarkdownReport(payload) {
  const lines = [];
  lines.push("# OCO Acceptance & Verification Brief");
  lines.push("");
  lines.push(`- **Generated At**: ${payload.generatedAt}`);
  const dirtyStr = payload.git.dirty === null ? "unknown" : String(payload.git.dirty);
  lines.push(`- **Git HEAD**: \`${payload.git.shortHead || "unknown"}\` (dirty: ${dirtyStr})`);
  lines.push(`- **Provider / Model**: \`${payload.metadata.provider}\` / \`${payload.metadata.model}\``);
  lines.push("");

  lines.push("## Latest E2E Acceptance by Suite");
  lines.push("");
  if (payload.suites.length === 0) {
    lines.push("_No E2E acceptance runs recorded._");
  } else {
    lines.push("| Suite | Run ID | Recorded Rev | Dirty | PASS | FAIL | NOT RUN | BLOCKED | Exit |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const s of payload.suites) {
      const dStr = s.recordedDirty === null ? "unknown" : String(s.recordedDirty);
      const exitStr = s.exitCode === null ? "-" : String(s.exitCode);
      lines.push(
        `| ${s.suite} | \`${s.runId}\` | \`${s.recordedShortRevision}\` | ${dStr} | ${s.summary.PASS ?? 0} | ${s.summary.FAIL ?? 0} | ${s.summary["NOT RUN"] ?? 0} | ${s.summary.BLOCKED ?? 0} | ${exitStr} |`
      );
    }
  }
  lines.push("");

  lines.push("## Version Consistency");
  lines.push("");
  const vc = payload.versionConsistency;
  if (vc.status === "OK") {
    lines.push(`> [!NOTE]\n> All suites recorded on revision \`${vc.revisions[0]}\` matching current HEAD.`);
  } else if (vc.status === "MIXED_REVISIONS") {
    lines.push(`> [!WARNING]\n> **Mixed Revisions Detected**: Suites recorded on [${vc.revisions.join(", ")}]. Cross-version PASS stitching is prohibited.`);
  } else {
    lines.push(`> [!IMPORTANT]\n> ${vc.message}`);
  }
  lines.push("");

  if (payload.specialRuns.length > 0) {
    lines.push("## Special Runs (Excluded from Acceptance)");
    lines.push("");
    lines.push("| Run ID | Suite | Type | Reason | Recorded Rev | Exit |");
    lines.push("|---|---|---|---|---|---|");
    for (const sr of payload.specialRuns) {
      lines.push(`| \`${sr.runId}\` | ${sr.suite} | ${sr.type} | ${sr.reason} | \`${sr.shortCommit}\` | ${sr.exitCode ?? "-"} |`);
    }
    lines.push("");
  }

  lines.push("## Evidence Integrity");
  lines.push("");
  lines.push(`- **Corrupted runs**: ${payload.integrity.corrupted.length}`);
  for (const c of payload.integrity.corrupted) {
    lines.push(`  - \`${c.runId}\`: ${c.error}`);
  }
  lines.push(`- **Empty evidence runs**: ${payload.integrity.empty.length}`);
  for (const e of payload.integrity.empty) {
    lines.push(`  - \`${e.runId}\`: ${e.reason}`);
  }
  lines.push(`- **Missing suite evidence**: ${payload.integrity.missingSuites.join(", ") || "None"}`);
  lines.push("");

  if (payload.currentVerify) {
    const cv = payload.currentVerify;
    lines.push("## Current Verification (This Round)");
    lines.push("");
    lines.push(`- **Recorded At**: ${cv.recordedAt || cv.timestamp}`);
    lines.push(`- **Revision**: \`${cv.recordedRevision || cv.gitHead || "unknown"}\` (dirty: ${cv.recordedDirty === null ? "unknown" : cv.recordedDirty})`);
    lines.push(`- **Result**: ${cv.allPassed ? "PASS" : "FAIL"} (exit code: ${cv.exitCode})`);
    lines.push(`- **E2E Status**: ${cv.e2e || "NOT RUN"}`);
    lines.push("");
  }

  if (payload.previousVerify) {
    const pv = payload.previousVerify;
    lines.push("## Previous Verification Record");
    lines.push("");
    lines.push(`- **Recorded At**: ${pv.recordedAt || pv.timestamp}`);
    lines.push(`- **Revision**: \`${pv.recordedRevision || pv.gitHead || "unknown"}\` (dirty: ${pv.recordedDirty === null ? "unknown" : pv.recordedDirty})`);
    lines.push(`- **Result**: ${pv.allPassed ? "PASS" : "FAIL"} (exit code: ${pv.exitCode})`);
    lines.push(`- **E2E Status**: ${pv.e2e || "NOT RUN"}`);
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

/**
 * Writes reports to .oco-reports/latest.json and .oco-reports/latest.md.
 */
export function writeReports(repoRoot, payload) {
  const reportDir = path.join(repoRoot, ".oco-reports");
  fs.mkdirSync(reportDir, { recursive: true });

  const jsonPath = path.join(reportDir, "latest.json");
  const mdPath = path.join(reportDir, "latest.md");

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  fs.writeFileSync(mdPath, generateMarkdownReport(payload), "utf8");

  return { jsonPath, mdPath };
}

/**
 * Formats brief output for the terminal.
 * STRICT REQUIREMENT: Total lines must be <= 40 lines.
 */
export function formatBriefTerminal({
  git,
  scanResult,
  versionAnalysis,
  currentVerify = null,
  previousVerify = null,
}) {
  const lines = [];
  lines.push("=== OCO Acceptance Brief ===");
  const dirtyStr = git.dirty === null ? "unknown" : String(git.dirty);
  lines.push(`Git HEAD: ${git.shortHead || "unknown"} (dirty: ${dirtyStr})`);
  lines.push("Report: .oco-reports/latest.json (.md)");
  lines.push("");

  lines.push("--- Latest E2E Acceptance by Suite ---");
  lines.push(
    "Suite".padEnd(16) +
    "RunId".padEnd(33) +
    "Rev".padEnd(9) +
    "Dirty".padEnd(8) +
    "PASS".padStart(5) +
    "FAIL".padStart(5) +
    "NOT_RUN".padStart(8) +
    "BLOCKED".padStart(8)
  );
  const suites = Object.keys(scanResult.latestBySuite || {}).sort();
  for (const s of suites) {
    const r = scanResult.latestBySuite[s] || {};
    const runId = r.runId || "-";
    const runShort = runId.length > 31 ? runId.slice(0, 28) + "..." : runId;
    const summary = r.summary || {};
    const dStr = r.dirty === null || r.dirty === undefined ? "unknown" : String(r.dirty);
    lines.push(
      s.padEnd(16) +
      runShort.padEnd(33) +
      (r.shortCommit || "-").padEnd(9) +
      dStr.padEnd(8) +
      String(summary.PASS ?? 0).padStart(5) +
      String(summary.FAIL ?? 0).padStart(5) +
      String(summary["NOT RUN"] ?? 0).padStart(8) +
      String(summary.BLOCKED ?? 0).padStart(8)
    );
  }

  if (suites.length === 0) {
    lines.push("(No acceptance runs found)");
  }

  lines.push("");
  lines.push(`Version Status: ${versionAnalysis.status} - ${versionAnalysis.message}`);

  // Special runs summary (limit to top 2 to preserve line count)
  lines.push("");
  lines.push("--- Special Runs (Excluded from Acceptance) ---");
  const special = scanResult.specialRuns || [];
  if (special.length === 0) {
    lines.push("None");
  } else {
    for (const sr of special.slice(0, 2)) {
      lines.push(`${sr.suite}: ${sr.runId} (${sr.type}: ${sr.reason})`);
    }
    if (special.length > 2) {
      lines.push(`... and ${special.length - 2} more special runs (see report)`);
    }
  }

  // Integrity summary
  lines.push("");
  lines.push("--- Evidence Integrity ---");
  const corruptCount = scanResult.corrupted?.length || 0;
  const emptyCount = scanResult.empty?.length || 0;
  const missingCount = scanResult.missingSuites?.length || 0;
  lines.push(
    `Corrupted: ${corruptCount} | Empty: ${emptyCount} | Missing: ${missingCount}` +
    (missingCount > 0 ? ` (${scanResult.missingSuites.join(", ")})` : "")
  );

  // Current or previous verification status
  if (currentVerify) {
    const cvRev = currentVerify.recordedRevision || currentVerify.gitHead || "unknown";
    const cvDirty = currentVerify.recordedDirty === null ? "unknown" : String(currentVerify.recordedDirty);
    lines.push("");
    lines.push(`Current Verify: ${currentVerify.allPassed ? "PASS" : "FAIL"} (exit: ${currentVerify.exitCode}) on rev ${cvRev} (dirty: ${cvDirty})`);
  }

  if (previousVerify) {
    const prevRev = previousVerify.recordedRevision || previousVerify.gitHead || "unknown";
    const prevDirty = previousVerify.recordedDirty === null ? "unknown" : String(previousVerify.recordedDirty);
    const same = prevRev === git.shortHead && (git.dirty === null ? false : prevDirty === String(git.dirty));
    lines.push("");
    lines.push(
      `Last Verify: ${previousVerify.recordedAt?.slice(0, 19) || "unknown"} on rev ${prevRev} (dirty: ${prevDirty})` +
      (same ? " [matches HEAD]" : " [NOT current round - rev mismatch]")
    );
  }

  // Strictly enforce <= 40 lines
  if (lines.length > 40) {
    const trimmed = lines.slice(0, 39);
    trimmed.push("[... truncated to satisfy <= 40 lines limit]");
    return trimmed.join("\n");
  }

  return lines.join("\n");
}
