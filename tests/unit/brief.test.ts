import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  scanEvidence,
  isSpecialRun,
  analyzeVersionConsistency,
  generateReportPayload,
  generateMarkdownReport,
  formatBriefTerminal,
} from "../../scripts/lib/brief-collector.mjs";
import { runVerification } from "../../scripts/lib/brief-verifier.mjs";
import { main } from "../../scripts/brief.mjs";

describe("Brief & Verification Unit Tests", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oco-brief-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("1. 空证据: 缺失 results.json 或空结果数组能被正确识别并不当验收", () => {
    const runsDir = path.join(tmpDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    // Scenario A: Directory without results.json
    fs.mkdirSync(path.join(runsDir, "20260930-100000-p1a-chat-nojson"), { recursive: true });

    // Scenario B: results.json with empty results array
    const emptyRunDir = path.join(runsDir, "20260930-100100-p1a-chat-empty");
    fs.mkdirSync(emptyRunDir, { recursive: true });
    fs.writeFileSync(
      path.join(emptyRunDir, "results.json"),
      JSON.stringify({
        suite: "p1a-chat",
        runId: "20260930-100100-p1a-chat-empty",
        results: [],
      })
    );

    const result = scanEvidence(runsDir, { targetSuites: ["p1a-chat"] });

    expect(result.empty.length).toBe(2);
    expect(result.empty.some((e) => e.reason.includes("Missing results.json"))).toBe(true);
    expect(result.empty.some((e) => e.reason.includes("empty or missing"))).toBe(true);
    expect(result.latestBySuite["p1a-chat"]).toBeUndefined();
    expect(result.missingSuites).toContain("p1a-chat");
  });

  test("2. 损坏JSON: 语法错误能被捕获且不崩溃整个扫描", () => {
    const runsDir = path.join(tmpDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    const corruptDir = path.join(runsDir, "20260930-100200-p1a-chat-corrupt");
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(path.join(corruptDir, "results.json"), "{ invalid JSON content !!!");

    // Add a second valid run to ensure scanning continues
    const validDir = path.join(runsDir, "20260930-100300-p1a-identity-good");
    fs.mkdirSync(validDir, { recursive: true });
    fs.writeFileSync(
      path.join(validDir, "results.json"),
      JSON.stringify({
        suite: "p1a-identity",
        runId: "20260930-100300-p1a-identity-good",
        ocoCommit: "commit123",
        results: [{ id: "test-1", status: "PASS" }],
      })
    );

    const result = scanEvidence(runsDir, { targetSuites: ["p1a-chat", "p1a-identity"] });

    expect(result.corrupted.length).toBe(1);
    expect(result.corrupted[0].runId).toBe("20260930-100200-p1a-chat-corrupt");
    expect(result.corrupted[0].error).toContain("Invalid JSON syntax");
    expect(result.latestBySuite["p1a-identity"]).toBeDefined();
    expect(result.latestBySuite["p1a-identity"].runId).toBe("20260930-100300-p1a-identity-good");
  });

  test("3. 混合版本: 跨版本记录禁止拼接全套PASS", () => {
    const latestBySuite: Record<string, any> = {
      "p1a-chat": {
        suite: "p1a-chat",
        shortCommit: "commitA",
        dirty: false,
        summary: { PASS: 5, FAIL: 0, "NOT RUN": 0, BLOCKED: 0 },
      },
      "p1a-identity": {
        suite: "p1a-identity",
        shortCommit: "commitB",
        dirty: false,
        summary: { PASS: 5, FAIL: 0, "NOT RUN": 0, BLOCKED: 0 },
      },
    };

    const analysis = analyzeVersionConsistency(latestBySuite, "commitA12345", false);

    expect(analysis.allSameRevision).toBe(false);
    expect(analysis.status).toBe("MIXED_REVISIONS");
    expect(analysis.message).toContain("Prohibited from stitching cross-version PASS");

    const terminal = formatBriefTerminal({
      git: { shortHead: "commitA", dirty: false },
      scanResult: { latestBySuite, specialRuns: [], corrupted: [], empty: [], missingSuites: [] },
      versionAnalysis: analysis,
    });

    expect(terminal).toContain("MIXED_REVISIONS");
    expect(terminal).toContain("Prohibited from stitching cross-version PASS");
    expect(terminal).not.toContain("ALL PASS");
  });

  test("4. 预期负向: negative-control / mutation / debug / perf 显式排除不得当常规验收", () => {
    const runsDir = path.join(tmpDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    // 1. Negative control run
    const negDir = path.join(runsDir, "20260930-100400-p1a-chat-neg");
    fs.mkdirSync(negDir, { recursive: true });
    fs.writeFileSync(
      path.join(negDir, "results.json"),
      JSON.stringify({
        suite: "p1a-chat",
        runId: "20260930-100400-p1a-chat-neg",
        startedAt: "2026-09-30T10:04:00.000Z",
        negativeControl: "question: clicks red, expects blue",
        results: [{ id: "q-1", status: "FAIL", detail: { negativeControl: true } }],
      })
    );

    // 2. Perf benchmark run
    const perfDir = path.join(runsDir, "20260930-100500-perf-xyz");
    fs.mkdirSync(perfDir, { recursive: true });
    fs.writeFileSync(
      path.join(perfDir, "results.json"),
      JSON.stringify({
        suite: "perf",
        runId: "20260930-100500-perf-xyz",
        startedAt: "2026-09-30T10:05:00.000Z",
        results: [{ id: "rss-check", status: "PASS" }],
      })
    );

    // 3. Normal acceptance run with older timestamp
    const normalDir = path.join(runsDir, "20260930-100100-p1a-chat-normal");
    fs.mkdirSync(normalDir, { recursive: true });
    fs.writeFileSync(
      path.join(normalDir, "results.json"),
      JSON.stringify({
        suite: "p1a-chat",
        runId: "20260930-100100-p1a-chat-normal",
        startedAt: "2026-09-30T10:01:00.000Z",
        results: [{ id: "normal-test", status: "PASS" }],
      })
    );

    const result = scanEvidence(runsDir, { targetSuites: ["p1a-chat"] });

    // Special runs are collected separately
    expect(result.specialRuns.length).toBe(2);
    expect(result.specialRuns.some((r) => r.type === "negative-control")).toBe(true);
    expect(result.specialRuns.some((r) => r.type === "perf")).toBe(true);

    // Negative control is NOT picked as the latest acceptance for p1a-chat
    expect(result.latestBySuite["p1a-chat"]).toBeDefined();
    expect(result.latestBySuite["p1a-chat"].runId).toBe("20260930-100100-p1a-chat-normal");
  });

  test("5. 必需未运行: 状态 NOT RUN 或缺失必需用例准确反映并返回 exit 1", () => {
    const runsDir = path.join(tmpDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    const runDir = path.join(runsDir, "20260930-100600-p1b-ime-part");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "results.json"),
      JSON.stringify({
        suite: "p1b-ime",
        runId: "20260930-100600-p1b-ime-part",
        results: [
          { id: "ime-1", status: "PASS" },
          { id: "ime-2", status: "NOT RUN" },
        ],
        missingRequired: ["ime-2"],
        exitCode: 1,
      })
    );

    const result = scanEvidence(runsDir, { targetSuites: ["p1b-ime"] });
    const ime = result.latestBySuite["p1b-ime"];

    expect(ime).toBeDefined();
    expect(ime.summary.PASS).toBe(1);
    expect(ime.summary["NOT RUN"]).toBe(1);
    expect(ime.missingRequired).toContain("ime-2");
    expect(ime.exitCode).toBe(1);
  });

  test("6. 子进程失败退出: verify 遇到命令失败准确记录耗时与退出码并返回非零", () => {
    const simulatedExec = (check: { name: string; cmd: string }) => {
      if (check.name === "typecheck") {
        return { exitCode: 2, error: "Type error in apps/extension" };
      }
      return { exitCode: 0, error: null };
    };

    const outcome = runVerification({
      cwd: tmpDir,
      build: false,
      execFn: simulatedExec,
    });

    expect(outcome.allPassed).toBe(false);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.e2e).toContain("NOT RUN");

    const typecheckCheck = outcome.checks.find((c) => c.name === "typecheck");
    const unitCheck = outcome.checks.find((c) => c.name === "unit");

    expect(typecheckCheck?.status).toBe("FAIL");
    expect(typecheckCheck?.exitCode).toBe(2);
    expect(typeof typecheckCheck?.durationMs).toBe("number");

    expect(unitCheck?.status).toBe("PASS");
    expect(unitCheck?.exitCode).toBe(0);
  });

  test("7. 终端输出限制: formatBriefTerminal 行数必须 <= 40 行", () => {
    // Generate many suites to test line constraint
    const latestBySuite: Record<string, any> = {};
    for (let i = 0; i < 10; i++) {
      latestBySuite[`suite-${i}`] = {
        suite: `suite-${i}`,
        runId: `20260930-run-${i}`,
        shortCommit: "commit1",
        dirty: false,
        summary: { PASS: 10, FAIL: 0, "NOT RUN": 0, BLOCKED: 0 },
      };
    }

    const specialRuns = [
      { suite: "perf", runId: "run-perf-1", type: "perf", reason: "benchmark" },
      { suite: "p1a-chat", runId: "run-neg-1", type: "negative-control", reason: "test" },
      { suite: "mutation", runId: "run-mut-1", type: "mutation", reason: "mutation test" },
    ];

    const terminal = formatBriefTerminal({
      git: { shortHead: "commit1", dirty: false },
      scanResult: {
        latestBySuite,
        specialRuns,
        corrupted: [{ runId: "c1", error: "bad json" }],
        empty: [{ runId: "e1", reason: "missing results.json" }],
        missingSuites: ["extra-suite"],
      },
      versionAnalysis: {
        allSameRevision: true,
        matchesCurrentHead: true,
        revisions: ["commit1"],
        status: "OK",
        message: "All match.",
      },
    });

    const lines = terminal.split("\n");
    expect(lines.length).toBeLessThanOrEqual(40);
  });

  test("8. 安全白名单: 绝不向报告写入原始日志、Prompt、认证头或Secrets", () => {
    const payload = generateReportPayload({
      git: { head: "sha123", shortHead: "sha1", dirty: false },
      scanResult: {
        latestBySuite: {
          "p1a-chat": {
            suite: "p1a-chat",
            runId: "run-1",
            commit: "sha123",
            shortCommit: "sha1",
            dirty: false,
            startedAt: "2026-09-30T00:00:00.000Z",
            finishedAt: "2026-09-30T00:01:00.000Z",
            exitCode: 0,
            summary: { PASS: 1, FAIL: 0, "NOT RUN": 0, BLOCKED: 0 },
            missingRequired: [],
            tests: [{ id: "t1", status: "PASS" }],
            // Arbitrary raw properties that might exist in raw results:
            rawLog: "Bearer sensitive_secret_token_12345",
            secretPrompt: "You are an assistant with secret instruction",
            authHeader: "Authorization: Bearer secret",
            internalUrl: "https://api.internal.com?token=supersecret",
          } as any,
        },
        specialRuns: [],
        corrupted: [],
        empty: [],
        missingSuites: [],
      },
      versionAnalysis: {
        allSameRevision: true,
        matchesCurrentHead: true,
        revisions: ["sha1"],
        hasDirty: false,
        status: "OK",
        message: "OK",
      },
    });

    const jsonStr = JSON.stringify(payload);
    expect(jsonStr).not.toContain("sensitive_secret_token_12345");
    expect(jsonStr).not.toContain("secretPrompt");
    expect(jsonStr).not.toContain("Authorization: Bearer");
    expect(jsonStr).not.toContain("supersecret");

    const mdStr = generateMarkdownReport(payload);
    expect(mdStr).not.toContain("sensitive_secret_token_12345");
    expect(mdStr).not.toContain("supersecret");
  });

  test("9. 元数据可靠性: provider 与 model 无可靠来源时严格写入 unknown，不估算Codex额度", () => {
    const payload = generateReportPayload({
      git: { head: "sha123", shortHead: "sha1", dirty: false },
      scanResult: { latestBySuite: {}, specialRuns: [], corrupted: [], empty: [], missingSuites: [] },
      versionAnalysis: { allSameRevision: false, matchesCurrentHead: false, revisions: [], hasDirty: false, status: "NO_EVIDENCE", message: "None" },
    });

    expect(payload.metadata.provider).toBe("unknown");
    expect(payload.metadata.model).toBe("unknown");
    expect((payload as any).codexTokens).toBeUndefined();
    expect((payload as any).codexQuota).toBeUndefined();
  });

  test("10. 历史 Verify 隔离: 旧版本验证记录保留其版本/dirty/时间，不冒充当前代码", () => {
    const oldVerify = {
      recordedAt: "2026-09-29T12:00:00.000Z",
      recordedRevision: "oldCommit",
      recordedDirty: false,
      allPassed: true,
      exitCode: 0,
      checks: [{ name: "unit", exitCode: 0, durationMs: 1000, status: "PASS" }],
      e2e: "NOT RUN",
    };

    const terminal = formatBriefTerminal({
      git: { shortHead: "newCommit", dirty: true },
      scanResult: { latestBySuite: {}, specialRuns: [], corrupted: [], empty: [], missingSuites: [] },
      versionAnalysis: { allSameRevision: false, matchesCurrentHead: false, revisions: [], hasDirty: true, status: "NO_EVIDENCE", message: "None" },
      previousVerify: oldVerify,
    });

    expect(terminal).toContain("oldCommit");
    expect(terminal).toContain("NOT current round - rev mismatch");
  });

  test("11. 回归(1): stdout 行数与日志捕获 - verify 和 brief 终端输出行数严格 <= 40 行，失败给出提示且不泄露 raw 日志/密钥", () => {
    // A. Test runVerification output line count and failure tip
    const loggedLines: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => {
      loggedLines.push(args.join(" "));
    };

    try {
      const outcome = runVerification({
        cwd: tmpDir,
        build: true,
        execFn: (check) => {
          if (check.name === "unit") {
            return {
              exitCode: 1,
              shortCount: "80 pass / 2 fail",
              error: null,
            };
          }
          return {
            exitCode: 0,
            shortCount: check.name === "typecheck" ? "0 errors" : "built successfully",
            error: null,
          };
        },
      });

      const totalLines = loggedLines.join("\n").split("\n");
      expect(totalLines.length).toBeLessThanOrEqual(40);
      expect(loggedLines.some((l) => l.includes("Tip: Run 'bun test tests/unit' directly to inspect full failure logs."))).toBe(true);
      expect(loggedLines.some((l) => l.includes("80 pass / 2 fail"))).toBe(true);
      expect(outcome.exitCode).toBe(1);
    } finally {
      console.log = origLog;
    }

    // B. Test formatBriefTerminal line count with large set of suites
    const largeSuites: Record<string, any> = {};
    for (let i = 0; i < 15; i++) {
      largeSuites[`suite-${i}`] = {
        suite: `suite-${i}`,
        runId: `20260930-long-run-identifier-${i}`,
        shortCommit: "c123456",
        dirty: false,
        summary: { PASS: 10, FAIL: 0, "NOT RUN": 0, BLOCKED: 0 },
      };
    }
    const terminal = formatBriefTerminal({
      git: { shortHead: "c123456", dirty: false },
      scanResult: {
        latestBySuite: largeSuites,
        specialRuns: [
          { suite: "perf", runId: "p1", type: "perf", reason: "perf test" },
          { suite: "perf", runId: "p2", type: "perf", reason: "perf test 2" },
          { suite: "perf", runId: "p3", type: "perf", reason: "perf test 3" },
        ],
        corrupted: [],
        empty: [],
        missingSuites: [],
      },
      versionAnalysis: {
        allSameRevision: true,
        matchesCurrentHead: true,
        revisions: ["c123456"],
        status: "OK",
        message: "All good",
      },
      currentVerify: {
        allPassed: true,
        exitCode: 0,
        recordedRevision: "c123456",
        recordedDirty: false,
      },
    });

    const lines = terminal.split("\n");
    expect(lines.length).toBeLessThanOrEqual(40);
  });

  test("12. 回归(2): verify 之后更新 HEAD/证据 - 每次重新采集 Git 与证据，不复用旧 payload，当前与 previous 区分", () => {
    // 1. Setup existing report with old commit e67129d
    const reportsDir = path.join(tmpDir, ".oco-reports");
    fs.mkdirSync(reportsDir, { recursive: true });
    const oldReport = {
      generatedAt: "2026-09-29T10:00:00.000Z",
      git: { head: "old1111111111111111111111111111111111111111", shortHead: "old1111", dirty: false },
      suites: [{ suite: "p1a-chat", runId: "old-run-1", recordedShortRevision: "old1111" }],
      currentVerify: {
        recordedAt: "2026-09-29T10:00:00.000Z",
        recordedRevision: "old1111",
        recordedDirty: false,
        allPassed: true,
        exitCode: 0,
      },
      previousVerify: null,
    };
    fs.writeFileSync(path.join(reportsDir, "latest.json"), JSON.stringify(oldReport, null, 2));

    // 2. Setup newly recorded evidence under runsDir with new commit new2222
    const runsDir = path.join(tmpDir, "docs", "evidence", "runs");
    const newRunDir = path.join(runsDir, "20260930-120000-p1a-chat-new");
    fs.mkdirSync(newRunDir, { recursive: true });
    fs.writeFileSync(
      path.join(newRunDir, "results.json"),
      JSON.stringify({
        suite: "p1a-chat",
        runId: "20260930-120000-p1a-chat-new",
        ocoCommit: "new2222222222222222222222222222222222222222",
        ocoDirty: true,
        results: [{ id: "test-new", status: "PASS" }],
        exitCode: 0,
      })
    );

    // 3. Run main with --verify and new Git HEAD
    let capturedExit = -1;
    main(["--verify"], {
      repoRoot: tmpDir,
      runsDir,
      gitInfo: { head: "new2222222222222222222222222222222222222222", shortHead: "new2222", dirty: true },
      execFn: () => ({ exitCode: 0, shortCount: "pass", error: null }),
      exitFn: (code: number) => {
        capturedExit = code;
        return code;
      },
    });

    expect(capturedExit).toBe(0);

    // 4. Read updated latest.json
    const updatedPayload = JSON.parse(fs.readFileSync(path.join(reportsDir, "latest.json"), "utf8"));

    // Git HEAD must be new2222, NOT the stale old1111!
    expect(updatedPayload.git.shortHead).toBe("new2222");
    expect(updatedPayload.git.dirty).toBe(true);

    // Scanned evidence must contain the newly added run
    const chatSuite = updatedPayload.suites.find((s: any) => s.suite === "p1a-chat");
    expect(chatSuite?.runId).toBe("20260930-120000-p1a-chat-new");
    expect(chatSuite?.recordedShortRevision).toBe("new2222");

    // currentVerify must be this round's verification
    expect(updatedPayload.currentVerify).toBeDefined();
    expect(updatedPayload.currentVerify.recordedRevision).toBe("new2222");
    expect(updatedPayload.currentVerify.recordedDirty).toBe(true);

    // previousVerify must hold the prior round's verification
    expect(updatedPayload.previousVerify).toBeDefined();
    expect(updatedPayload.previousVerify.recordedRevision).toBe("old1111");
  });

  test("13. 回归(3): 损坏证据退出码与报错脱敏 - 默认 brief 发现损坏 JSON 必须 exit 1，错误信息不泄露原始数据片段", () => {
    const runsDir = path.join(tmpDir, "docs", "evidence", "runs");
    const corruptRunDir = path.join(runsDir, "20260930-corrupt-secret-run");
    fs.mkdirSync(corruptRunDir, { recursive: true });

    // Corrupted file containing a sensitive token
    fs.writeFileSync(
      path.join(corruptRunDir, "results.json"),
      `{ "suite": "p1a-chat", "secret": "VERY_SECRET_KEY_12345", INVALID_SYNTAX }`
    );

    let capturedExit = -1;
    main([], {
      repoRoot: tmpDir,
      runsDir,
      gitInfo: { head: "sha999", shortHead: "sha9", dirty: false },
      exitFn: (code: number) => {
        capturedExit = code;
        return code;
      },
    });

    // Requirement: brief must return non-zero exit code when corrupted JSON exists
    expect(capturedExit).toBe(1);

    const scanResult = scanEvidence(runsDir);
    expect(scanResult.corrupted.length).toBe(1);
    const errText = scanResult.corrupted[0].error;
    // Error must NOT contain the sensitive data snippet
    expect(errText).not.toContain("VERY_SECRET_KEY_12345");
    expect(errText).toContain("Invalid JSON syntax");
  });

  test("14. 回归(4): 名字含 debug 但无标记的失败 - 不盲目排除，保留为正常验收套件并真实反映 FAIL", () => {
    const runsDir = path.join(tmpDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    // Run whose runId contains 'debug', but has NO explicit meta.debug or meta.purpose
    const debugRunDir = path.join(runsDir, "20260930-150000-p1a-chat-debug-investigation");
    fs.mkdirSync(debugRunDir, { recursive: true });
    fs.writeFileSync(
      path.join(debugRunDir, "results.json"),
      JSON.stringify({
        suite: "p1a-chat",
        runId: "20260930-150000-p1a-chat-debug-investigation",
        results: [
          { id: "msg-send", status: "PASS" },
          { id: "msg-render", status: "FAIL" },
        ],
        exitCode: 1,
      })
    );

    const result = scanEvidence(runsDir, { targetSuites: ["p1a-chat"] });

    // Must NOT be falsely classified as special run
    expect(result.specialRuns.length).toBe(0);

    // Must be retained as the latest acceptance run for p1a-chat
    const chatSuite = result.latestBySuite["p1a-chat"];
    expect(chatSuite).toBeDefined();
    expect(chatSuite.runId).toBe("20260930-150000-p1a-chat-debug-investigation");
    expect(chatSuite.summary.PASS).toBe(1);
    expect(chatSuite.summary.FAIL).toBe(1);
    expect(chatSuite.exitCode).toBe(1);

    const terminal = formatBriefTerminal({
      git: { shortHead: "head1", dirty: false },
      scanResult: result,
      versionAnalysis: {
        allSameRevision: true,
        matchesCurrentHead: false,
        revisions: ["unknown"],
        status: "OK",
        message: "OK",
      },
    });

    // Terminal must show the suite with FAIL = 1
    expect(terminal).toContain("p1a-chat");
    expect(terminal).toContain("20260930-150000-p1a-chat-deb...");
    expect(terminal).toMatch(/p1a-chat\s+20260930-150000-p1a-chat-deb\.\.\..*?\b1\s+1\b/);
  });

  test("15. 回归(5): stored summary 与 results 不一致时不能信任 stored summary 伪造 PASS", () => {
    const runsDir = path.join(tmpDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    const runDir = path.join(runsDir, "20260930-160000-p1a-chat-forged");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "results.json"),
      JSON.stringify({
        suite: "p1a-chat",
        runId: "20260930-160000-p1a-chat-forged",
        ocoCommit: "abc1234deadbeef",
        ocoDirty: "yes",
        results: [
          { id: "msg-send", status: "FAIL" },
          { id: "msg-render", status: "NOT RUN" },
        ],
        summary: { PASS: 8, FAIL: 0, "NOT RUN": 0, BLOCKED: 0 },
      })
    );

    const result = scanEvidence(runsDir, { targetSuites: ["p1a-chat"] });
    const chat = result.latestBySuite["p1a-chat"];
    expect(chat).toBeDefined();
    expect(chat.summary.PASS).toBe(0);
    expect(chat.summary.FAIL).toBe(1);
    expect(chat.summary["NOT RUN"]).toBe(1);
    expect(chat.summaryTrusted).toBe(false);
    expect(chat.dirty).toBe(null);
    expect(chat.exitCode).not.toBe(0);
    expect(chat.exitCode).toBe(1);

    const terminal = formatBriefTerminal({
      git: { shortHead: "abc1234", dirty: null },
      scanResult: result,
      versionAnalysis: analyzeVersionConsistency(result.latestBySuite, "abc1234", null),
    });
    expect(terminal).toMatch(/p1a-chat\s+20260930-160000-p1a-chat-forged\s+abc1234\s+unknown\s+0\s+1\s+1/);
    expect(terminal).toContain("dirty: unknown");
  });
});
