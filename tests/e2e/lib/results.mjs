import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const VALID_STATUSES = new Set(["PASS", "FAIL", "NOT RUN", "BLOCKED", "N/A"]);

export function computeMissingRequired(results, required = []) {
  const statusById = new Map((results || []).map((r) => [r.id, r.status]));
  const missing = [];
  for (const reqId of required || []) {
    if (statusById.get(reqId) !== "PASS") {
      missing.push(reqId);
    }
  }
  return missing;
}

/**
 * Record a check as N/A (it does not apply to this run, e.g. it depends on a mock-model token) and drop it from the
 * required list, so the exit code is decided by the checks that do apply. `required` must be the very array that was
 * passed to createRun (it is edited in place). The reason always lands in the result detail.
 */
export function recordNotApplicable(run, required, id, reason, detail = {}) {
  if (Array.isArray(required)) {
    const i = required.indexOf(id);
    if (i >= 0) required.splice(i, 1);
  }
  return run.record(id, "N/A", { reason, ...detail });
}

export function computeExit(results, required = []) {
  if (!results || results.length === 0) {
    return 1;
  }
  if (results.some((r) => r.status === "FAIL")) {
    return 1;
  }
  const missing = computeMissingRequired(results, required);
  if (missing.length > 0) {
    return 1;
  }
  return 0;
}

function findRepoRoot() {
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  if (fs.existsSync(path.join(defaultRoot, "package.json"))) {
    return defaultRoot;
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    try {
      if (fs.existsSync(path.join(dir, "package.json"))) {
        return dir;
      }
    } catch {}
    dir = path.dirname(dir);
  }
  return defaultRoot;
}

function formatUtcTimestamp(d = new Date()) {
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function getOcoCommit(cwd) {
  try {
    const out = execSync("git rev-parse HEAD", {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function getOcoDirty(cwd) {
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
      if (filePath.includes(" -> ")) {
        const parts = filePath.split(" -> ").map((p) => p.trim().replace(/^"|"$/g, ""));
        if (parts.every((p) => p.startsWith("docs/evidence/runs/") || p === "docs/evidence/runs")) {
          return false;
        }
      }
      return true;
    });
    return nonEvidenceLines.length > 0;
  } catch {
    return false;
  }
}

function getUpstreamSha(cwd) {
  try {
    const out = execSync("git -C vendor/opencode rev-parse HEAD", {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function getScriptSha256(scriptPath, cwd) {
  if (!scriptPath) return null;
  try {
    const resolvedScript = path.isAbsolute(scriptPath) ? scriptPath : path.resolve(cwd, scriptPath);
    const content = fs.readFileSync(resolvedScript);
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}

export function installCrashHandlers(run, cleanup) {
  let handling = false;

  const handler = async (err) => {
    if (handling) return;
    handling = true;

    const message = err instanceof Error ? (err.message || String(err)) : String(err ?? "Unknown error");
    const errorSnippet = message.slice(0, 500);

    try {
      run.record("run", "FAIL", { error: errorSnippet, message: errorSnippet });
    } catch {}

    if (typeof cleanup === "function") {
      try {
        await cleanup();
      } catch {
        // swallow cleanup exception
      }
    }

    try {
      run.finish();
    } catch {}

    process.exit(1);
  };

  process.on("uncaughtException", handler);
  process.on("unhandledRejection", handler);

  return () => {
    process.off("uncaughtException", handler);
    process.off("unhandledRejection", handler);
  };
}

export function createRun({ suite, required = [], root, scriptPath }) {
  if (!suite || typeof suite !== "string") {
    throw new Error("createRun requires a string 'suite' parameter");
  }

  const resolvedRoot = root ? path.resolve(root) : findRepoRoot();
  const startedAtDate = new Date();
  const hex = crypto.randomBytes(2).toString("hex");
  const runId = `${formatUtcTimestamp(startedAtDate)}-${suite}-${hex}`;
  const dir = path.join(resolvedRoot, "docs", "evidence", "runs", runId);

  fs.mkdirSync(dir, { recursive: true });

  const meta = {
    runId,
    suite,
    startedAt: startedAtDate.toISOString(),
    ocoCommit: getOcoCommit(resolvedRoot),
    ocoDirty: getOcoDirty(resolvedRoot),
    upstreamSha: getUpstreamSha(resolvedRoot),
    scriptSha256: getScriptSha256(scriptPath, resolvedRoot),
    node: process.version,
    os: `${process.platform} ${os.release()} ${process.arch}`,
  };

  const results = [];

  function setEnv(obj) {
    if (obj && typeof obj === "object") {
      Object.assign(meta, obj);
    }
    return meta;
  }

  function artifact(name) {
    if (typeof name !== "string" || !/^[a-zA-Z0-9._-]+$/.test(name)) {
      throw new Error(`Invalid artifact name: "${name}". Only characters [a-zA-Z0-9._-] are allowed.`);
    }
    return path.join(dir, name);
  }

  function record(id, status, detail = {}) {
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`Invalid status "${status}". Allowed statuses: ${Array.from(VALID_STATUSES).join(", ")}`);
    }

    let finalDetail = detail !== undefined ? detail : {};
    const existingIdx = results.findIndex((r) => r.id === id);

    if (existingIdx >= 0) {
      const existing = results[existingIdx];
      const prevHistory = (existing.detail && Array.isArray(existing.detail.history))
        ? [...existing.detail.history]
        : [];

      let prevDetailWithoutHistory = existing.detail;
      if (prevDetailWithoutHistory && typeof prevDetailWithoutHistory === "object" && "history" in prevDetailWithoutHistory) {
        const { history: _, ...rest } = prevDetailWithoutHistory;
        prevDetailWithoutHistory = rest;
      }

      prevHistory.push({
        status: existing.status,
        detail: prevDetailWithoutHistory,
        at: existing.at,
      });

      if (finalDetail && typeof finalDetail === "object" && !Array.isArray(finalDetail)) {
        finalDetail.history = prevHistory;
      } else {
        finalDetail = { value: finalDetail, history: prevHistory };
      }
    }

    console.log(`[${status}] ${id}: ${JSON.stringify(finalDetail)}`);

    const entry = {
      id,
      status,
      detail: finalDetail,
      at: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      results[existingIdx] = entry;
    } else {
      results.push(entry);
    }

    return entry;
  }

  let finished = false;
  let cachedExitCode = null;

  function finish() {
    if (finished) {
      return cachedExitCode;
    }
    finished = true;

    const finishedAt = new Date().toISOString();
    meta.finishedAt = finishedAt;

    cachedExitCode = computeExit(results, required);
    const missingRequired = computeMissingRequired(results, required);

    const summary = {
      PASS: 0,
      FAIL: 0,
      "NOT RUN": 0,
      BLOCKED: 0,
      "N/A": 0,
    };
    for (const r of results) {
      if (Object.prototype.hasOwnProperty.call(summary, r.status)) {
        summary[r.status]++;
      } else {
        summary[r.status] = 1;
      }
    }

    const payload = {
      ...meta,
      results,
      summary,
      exitCode: cachedExitCode,
      missingRequired,
    };

    const resultsPath = path.join(dir, "results.json");
    fs.writeFileSync(resultsPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
    return cachedExitCode;
  }

  const run = {
    runId,
    dir,
    meta,
    results,
    record,
    artifact,
    setEnv,
    finish,
    installCrashHandlers: (cleanup) => installCrashHandlers(run, cleanup),
  };

  return run;
}
