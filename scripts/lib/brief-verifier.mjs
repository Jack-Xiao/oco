import { spawnSync } from "node:child_process";
import { collectGitInfo } from "./brief-collector.mjs";

function getEnhancedEnv() {
  const home = process.env.HOME || "";
  const bunPath = process.env.BUN_BIN || `${home}/.bun/bin`;
  const pathParts = [bunPath, "/opt/homebrew/bin", "/usr/local/bin", process.env.PATH || ""].filter(Boolean);
  return {
    ...process.env,
    PATH: pathParts.join(":"),
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
}

export function defaultExec(check, { cwd }) {
  const env = getEnhancedEnv();
  const res = spawnSync("bun", check.args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env,
    shell: false,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const stdout = res.stdout || "";
  const stderr = res.stderr || "";
  const exitCode = typeof res.status === "number" ? res.status : 1;

  let shortCount = "";
  if (check.name === "unit") {
    const combined = stdout + "\n" + stderr;
    const passMatch = combined.match(/(\d+)\s+pass/i);
    const failMatch = combined.match(/(\d+)\s+fail/i);
    if (passMatch || failMatch) {
      const p = passMatch ? passMatch[1] : "0";
      const f = failMatch ? failMatch[1] : "0";
      shortCount = `${p} pass / ${f} fail`;
    }
  } else if (check.name === "typecheck") {
    if (exitCode === 0) {
      shortCount = "0 errors";
    } else {
      const combined = stdout + "\n" + stderr;
      const countMatch = combined.match(/Found\s+(\d+)\s+errors?/i);
      if (countMatch) {
        shortCount = `${countMatch[1]} errors`;
      } else {
        const errLines = combined.split("\n").filter((l) => l.includes("error TS")).length;
        shortCount = errLines > 0 ? `${errLines} errors` : "errors found";
      }
    }
  } else if (check.name === "build") {
    shortCount = exitCode === 0 ? "built successfully" : "build failed";
  }

  // Never return or persist raw stdout/stderr to avoid leaking raw logs/secrets
  return {
    exitCode,
    shortCount,
    error: res.error ? "Process execution error" : null,
  };
}

export function runVerification({ cwd = process.cwd(), build = false, execFn = null, gitInfo = null }) {
  const runner = execFn || defaultExec;
  const git = gitInfo || collectGitInfo(cwd);

  const checks = [
    {
      name: "typecheck",
      cmd: "bun run typecheck",
      args: ["run", "typecheck"],
    },
    {
      name: "unit",
      cmd: "bun test tests/unit",
      args: ["test", "tests/unit"],
    },
  ];

  if (build) {
    checks.push({
      name: "build",
      cmd: "bun run build",
      args: ["run", "build"],
    });
  }

  const dirtyStr = git.dirty === null ? "unknown" : String(git.dirty);
  console.log("=== OCO Verification Brief (Offline) ===");
  console.log(`Git HEAD: ${git.shortHead || "unknown"} (dirty: ${dirtyStr})`);
  console.log(`Mode: offline checks (${checks.map((c) => c.name).join(", ")})`);
  console.log("");

  const results = [];
  let allPassed = true;

  for (const check of checks) {
    const t0 = Date.now();
    let exitCode = 1;
    let error = null;
    let shortCount = "";

    try {
      const outcome = runner(check, { cwd });
      exitCode = typeof outcome?.exitCode === "number" ? outcome.exitCode : 1;
      shortCount = outcome?.shortCount || "";
      error = outcome?.error || null;
    } catch (err) {
      exitCode = typeof err?.status === "number" ? err.status : 1;
      error = "Execution error";
    }

    const durationMs = Date.now() - t0;
    const passed = exitCode === 0;
    if (!passed) {
      allPassed = false;
    }

    const countPart = shortCount ? ` - ${shortCount}` : "";
    console.log(`[${passed ? "PASS" : "FAIL"}] ${check.name} (exit: ${exitCode}, ${(durationMs / 1000).toFixed(2)}s)${countPart}`);
    if (!passed) {
      console.log(`       Tip: Run '${check.cmd}' directly to inspect full failure logs.`);
    }

    results.push({
      name: check.name,
      command: check.cmd,
      exitCode,
      durationMs,
      passed,
      status: passed ? "PASS" : "FAIL",
      shortCount,
      error,
    });
  }

  console.log("");
  console.log("=== Verification Summary ===");
  for (const r of results) {
    const countPart = r.shortCount ? ` (${r.shortCount})` : "";
    console.log(
      `${r.name.padEnd(12)} : ${r.status.padEnd(6)} (exit: ${String(r.exitCode).padStart(2)}, ${(r.durationMs / 1000).toFixed(2)}s)${countPart}`
    );
  }
  console.log(`E2E          : NOT RUN (historical acceptance only; see bun run brief)`);
  console.log(`Overall      : ${allPassed ? "PASS" : "FAIL"} (exit code: ${allPassed ? 0 : 1})`);

  return {
    recordedAt: new Date().toISOString(),
    recordedRevision: git.shortHead,
    recordedDirty: git.dirty,
    allPassed,
    exitCode: allPassed ? 0 : 1,
    checks: results.map(({ name, command, exitCode, durationMs, passed, status, shortCount }) => ({
      name,
      command,
      exitCode,
      durationMs,
      passed,
      status,
      shortCount,
    })),
    e2e: "NOT RUN (historical acceptance only; see bun run brief)",
  };
}
