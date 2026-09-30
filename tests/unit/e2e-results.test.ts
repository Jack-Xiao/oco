import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, spyOn } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createRun,
  computeExit,
  computeMissingRequired,
  VALID_STATUSES,
  installCrashHandlers,
} from "../e2e/lib/results.mjs";
import { DEFAULT_SUITES, EXCLUDED_FILES, getAvailableSuites } from "../e2e/run.mjs";

// record() echoes every status line; silence it so test output stays short.
let logSpy: ReturnType<typeof spyOn>;
beforeAll(() => { logSpy = spyOn(console, "log").mockImplementation(() => {}); });
afterAll(() => logSpy.mockRestore());

describe("computeExit", () => {
  test("全 PASS→0", () => {
    const results = [
      { id: "step1", status: "PASS" },
      { id: "step2", status: "PASS" },
    ];
    expect(computeExit(results, ["step1", "step2"])).toBe(0);
    expect(computeExit(results, ["step1"])).toBe(0);
    expect(computeExit(results, [])).toBe(0);
  });

  test("有 FAIL→1", () => {
    const results = [
      { id: "step1", status: "PASS" },
      { id: "step2", status: "FAIL" },
    ];
    expect(computeExit(results, ["step1"])).toBe(1);
    expect(computeExit(results, [])).toBe(1);
  });

  test("required 缺失→1", () => {
    const results = [{ id: "step1", status: "PASS" }];
    expect(computeExit(results, ["step1", "step2"])).toBe(1);
    const missing = computeMissingRequired(results, ["step1", "step2"]);
    expect(missing).toEqual(["step2"]);
  });

  test("required 为 NOT RUN→1", () => {
    const results = [
      { id: "step1", status: "PASS" },
      { id: "step2", status: "NOT RUN" },
    ];
    expect(computeExit(results, ["step1", "step2"])).toBe(1);
    const missing = computeMissingRequired(results, ["step1", "step2"]);
    expect(missing).toEqual(["step2"]);
  });

  test("required 为 BLOCKED 或 N/A 亦未满足→1", () => {
    const resultsBlocked = [{ id: "step1", status: "BLOCKED" }];
    expect(computeExit(resultsBlocked, ["step1"])).toBe(1);

    const resultsNA = [{ id: "step1", status: "N/A" }];
    expect(computeExit(resultsNA, ["step1"])).toBe(1);
  });

  test("空结果→1", () => {
    expect(computeExit([], [])).toBe(1);
    expect(computeExit([], ["req1"])).toBe(1);
    expect(computeExit(null as any, [])).toBe(1);
  });

  test("非 required 状态允许为 NOT RUN/BLOCKED/N/A 只要无 FAIL 且 required 全 PASS→0", () => {
    const results = [
      { id: "req1", status: "PASS" },
      { id: "opt1", status: "NOT RUN" },
      { id: "opt2", status: "N/A" },
    ];
    expect(computeExit(results, ["req1"])).toBe(0);
  });
});

describe("record & VALID_STATUSES", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oco-results-unit-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("record 非法状态抛错", () => {
    const run = createRun({ suite: "test-illegal", root: tmpRoot });

    expect(() => run.record("step", "INVALID" as any)).toThrow();
    expect(() => run.record("step", "pass" as any)).toThrow();
    expect(() => run.record("step", "ERROR" as any)).toThrow();
    expect(() => run.record("step", "" as any)).toThrow();
  });

  test("record 合法状态成功", () => {
    const run = createRun({ suite: "test-legal", root: tmpRoot });
    for (const status of Array.from(VALID_STATUSES)) {
      expect(() => run.record(`id-${status}`, status, { ok: true })).not.toThrow();
    }
    expect(run.results.length).toBe(VALID_STATUSES.size);
  });

  test("同 id 重复记录时保留最后一次并在 detail.history 记录之前的状态", () => {
    const run = createRun({ suite: "test-dedup", root: tmpRoot });

    run.record("step1", "BLOCKED", { reason: "waiting server" });
    expect(run.results.length).toBe(1);
    expect(run.results[0].status).toBe("BLOCKED");

    run.record("step1", "PASS", { duration: 150 });
    expect(run.results.length).toBe(1);
    expect(run.results[0].status).toBe("PASS");
    expect(run.results[0].detail.duration).toBe(150);
    expect(Array.isArray(run.results[0].detail.history)).toBe(true);
    expect(run.results[0].detail.history.length).toBe(1);
    expect(run.results[0].detail.history[0].status).toBe("BLOCKED");
    expect(run.results[0].detail.history[0].detail.reason).toBe("waiting server");

    run.record("step1", "FAIL", { error: "unexpected timeout" });
    expect(run.results.length).toBe(1);
    expect(run.results[0].status).toBe("FAIL");
    expect(run.results[0].detail.history.length).toBe(2);
    expect(run.results[0].detail.history[0].status).toBe("BLOCKED");
    expect(run.results[0].detail.history[1].status).toBe("PASS");
    expect(run.results[0].detail.history[1].detail.duration).toBe(150);
  });
});

describe("artifact", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oco-results-unit-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("artifact 合法名称返回对应路径", () => {
    const run = createRun({ suite: "test-artifact", root: tmpRoot });
    const p1 = run.artifact("screenshot.png");
    expect(p1).toBe(path.join(run.dir, "screenshot.png"));

    const p2 = run.artifact("data_dump-01.json");
    expect(p2).toBe(path.join(run.dir, "data_dump-01.json"));
  });

  test("artifact 非法名称抛错", () => {
    const run = createRun({ suite: "test-artifact", root: tmpRoot });
    expect(() => run.artifact("../escape.png")).toThrow();
    expect(() => run.artifact("nested/file.txt")).toThrow();
    expect(() => run.artifact("has space.png")).toThrow();
    expect(() => run.artifact("invalid*char.png")).toThrow();
    expect(() => run.artifact("")).toThrow();
  });
});

describe("meta & setEnv & scriptPath", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oco-results-unit-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("meta 包含所有基础字段且 runId 格式正确", () => {
    const testScript = path.join(tmpRoot, "dummy.mjs");
    fs.writeFileSync(testScript, 'console.log("hello");\n');

    const run = createRun({
      suite: "unit-test",
      root: tmpRoot,
      scriptPath: testScript,
    });

    expect(run.meta.suite).toBe("unit-test");
    expect(typeof run.meta.runId).toBe("string");
    // Format: YYYYMMDD-HHMMSS-suite-4位hex
    const runIdRegex = /^\d{8}-\d{6}-unit-test-[0-9a-fA-F]{4}$/;
    expect(runIdRegex.test(run.meta.runId)).toBe(true);

    expect(typeof run.meta.startedAt).toBe("string");
    expect(typeof run.meta.node).toBe("string");
    expect(typeof run.meta.os).toBe("string");
    expect(typeof run.meta.ocoDirty).toBe("boolean");
    expect(typeof run.meta.scriptSha256).toBe("string");
    expect(run.meta.scriptSha256?.length).toBe(64);
  });

  test("setEnv 合并额外环境字段", () => {
    const run = createRun({ suite: "unit-test", root: tmpRoot });
    run.setEnv({ vscodeVersion: "1.95.0", serverVersion: "0.2.1" });

    expect((run.meta as any).vscodeVersion).toBe("1.95.0");
    expect((run.meta as any).serverVersion).toBe("0.2.1");
  });
});

describe("finish 写出的 results.json 字段完整且幂等", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oco-results-unit-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("finish 写出的 results.json 字段完整且幂等", () => {
    const run = createRun({
      suite: "finish-test",
      required: ["req-step"],
      root: tmpRoot,
    });

    run.setEnv({ vscodeVersion: "1.95.0" });
    run.record("req-step", "PASS", { duration: 100 });
    run.record("opt-step", "PASS", { duration: 50 });

    const firstExitCode = run.finish();
    expect(firstExitCode).toBe(0);

    const resultsFile = path.join(run.dir, "results.json");
    expect(fs.existsSync(resultsFile)).toBe(true);

    const content1 = fs.readFileSync(resultsFile, "utf8");
    const json = JSON.parse(content1);

    // 字段完整性校验
    expect(json.runId).toBe(run.runId);
    expect(json.suite).toBe("finish-test");
    expect(json.startedAt).toBeDefined();
    expect(json.finishedAt).toBeDefined();
    expect(json.node).toBe(process.version);
    expect(json.os).toBeDefined();
    expect(typeof json.ocoDirty).toBe("boolean");
    expect(json.vscodeVersion).toBe("1.95.0");

    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results.length).toBe(2);
    expect(json.results[0].id).toBe("req-step");
    expect(json.results[0].status).toBe("PASS");
    expect(json.results[0].at).toBeDefined();

    expect(json.summary).toBeDefined();
    expect(json.summary.PASS).toBe(2);
    expect(json.summary.FAIL).toBe(0);
    expect(json.summary["NOT RUN"]).toBe(0);
    expect(json.summary.BLOCKED).toBe(0);
    expect(json.summary["N/A"]).toBe(0);

    expect(json.exitCode).toBe(0);
    expect(Array.isArray(json.missingRequired)).toBe(true);
    expect(json.missingRequired.length).toBe(0);

    // 幂等性测试：再次调用 finish 返回同一 exitCode，并且不重新写文件
    const statBefore = fs.statSync(resultsFile);
    const secondExitCode = run.finish();
    expect(secondExitCode).toBe(firstExitCode);

    const statAfter = fs.statSync(resultsFile);
    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);

    const content2 = fs.readFileSync(resultsFile, "utf8");
    expect(content2).toBe(content1);
  });

  test("finish 记录 FAIL 时 exitCode 为 1 并正确列出 missingRequired", () => {
    const run = createRun({
      suite: "finish-fail",
      required: ["req1", "req2"],
      root: tmpRoot,
    });

    run.record("req1", "PASS");
    run.record("req2", "FAIL");

    const exitCode = run.finish();
    expect(exitCode).toBe(1);

    const json = JSON.parse(fs.readFileSync(path.join(run.dir, "results.json"), "utf8"));
    expect(json.exitCode).toBe(1);
    expect(json.summary.FAIL).toBe(1);
    expect(json.summary.PASS).toBe(1);
    expect(json.missingRequired).toEqual(["req2"]);
  });
});

describe("installCrashHandlers", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oco-results-unit-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("installCrashHandlers 注册监听并在 uninstall 时注销", () => {
    const run = createRun({ suite: "crash-test", root: tmpRoot });
    const beforeCount = process.listenerCount("uncaughtException");
    const uninstall = installCrashHandlers(run);
    expect(process.listenerCount("uncaughtException")).toBe(beforeCount + 1);
    uninstall();
    expect(process.listenerCount("uncaughtException")).toBe(beforeCount);
  });
});

describe("run.mjs 套件管理", () => {
  test("DEFAULT_SUITES 为 P1a + P1b 套件", () => {
    expect(DEFAULT_SUITES).toEqual(["p1a-chat", "p1a-identity", "p1b-sidebar", "p1b-narrow", "p1b-theme-load", "p1b-ime", "p1b-reconnect", "p1b-pending-send", "p1b-switch-pending", "c1-open-file"]);
  });

  test("EXCLUDED_FILES 排除内部工具脚本", () => {
    expect(EXCLUDED_FILES.has("vscode.mjs")).toBe(true);
    expect(EXCLUDED_FILES.has("server.mjs")).toBe(true);
    expect(EXCLUDED_FILES.has("run.mjs")).toBe(true);
    expect(EXCLUDED_FILES.has("perf.mjs")).toBe(true);
  });

  test("getAvailableSuites 正确发现并排除特定脚本", () => {
    const suites = getAvailableSuites();
    expect(suites.includes("t004")).toBe(true);
    expect(suites.includes("t005")).toBe(true);
    expect(suites.includes("vscode")).toBe(false);
    expect(suites.includes("run")).toBe(false);
    expect(suites.includes("server")).toBe(false);
    expect(suites.includes("perf")).toBe(false);
  });
});
