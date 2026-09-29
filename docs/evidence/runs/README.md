# E2E 运行产物

每次运行写入 `runs/<runId>/`（`results.json` + 截图），由 `tests/e2e/lib/results.mjs` 生成，记录 oco 提交、是否有未提交改动、上游 SHA、脚本哈希、VS Code/服务版本。

默认不入库（开发迭代产物）。验收用的运行由集成人在干净提交上执行后用 `git add -f` 显式加入，并在 `docs/evidence/p1a-acceptance.md` 中引用。
