# 技术手册独立验证

时间：2026-10-01T16:56:00.573Z（开始 2026-10-01T16:55:55.312Z，5261 ms）
HTML SHA256：`ddf8eaa4a6e93c915af342c4009620eff3af984436d300913133a086a326ca41`
浏览器：147.0.7727.15
可执行文件：/Users/xiaojiang/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
model/provider：unknown / unknown（本轮没有工具返回模型身份；健康检查不作为模型证据）

## 结果

- 已执行检查全部为 pass。视觉判断见截图复核，若本节之后另有视觉问题会改写本文件。

## 检查

- pass `anchors-21`
- pass `unique-ids`
- pass `local-hrefs`
- pass `external-hrefs-not-fetched-static`
- pass `no-external-assets`
- pass `js-syntax`
- pass `js-dom-ids`
- pass `risk-markup-12`
- pass `step-markup-6`
- pass `print-css-text`
- pass `baseline-5d99942`
- pass `extension-identity`
- pass `vscode-engine`
- pass `upstream-pin`
- pass `root-bun`
- pass `root-typescript`
- pass `root-esbuild-playwright`
- pass `upstream-tooling-versions`
- pass `patches-18`
- pass `bridge-v2-origin`
- pass `browser-launch`
- pass `toc-runtime-21`
- pass `overflow-1440`
- pass `search-sse`
- pass `search-miss`
- pass `search-clear`
- pass `steps-6`
- pass `risk-filter`
- pass `theme-toggle`
- pass `details-toggle`
- pass `print-css-runtime`
- pass `overflow-390`
- pass `mobile-toc-still-21`
- pass `page-errors`
- pass `external-network`
- pass `claude-observation-recheck`
- pass `local-hrefs-recheck`
- pass `validation-json-written`

## 产物

- `docs/evidence/technical-guide-validation.json`
- `docs/evidence/technical-guide-review.md`
- `docs/evidence/runs/technical-guide/desktop-1440.png`
- `docs/evidence/runs/technical-guide/desktop-1440-flow.png`
- `docs/evidence/runs/technical-guide/mobile-390.png`
- `docs/evidence/runs/technical-guide/mobile-390-table.png`

未改 HTML、产品代码或共享文件。未连接 VS Code，未跑项目 E2E。

## 最终复核与执行归属（2026-10-02）

- 最终 40 项 PASS / 0 FAIL / 0 BLOCKED，最终 HTML 哈希以验证 JSON 为准。浏览器检查由主线程实际运行，初次代理启动受限记录保存在 `runs/technical-guide/delegated-validation.json`，不是最终阻塞。
- 代理已目视复核前版四张桌面/手机截图，无重叠与侧栏压文；手机表格右侧疑似截字由集成人只查看该问题截图并结合 DOM 核实：600px 表格位于约326px可横滚容器内，右侧内容未丢失，不是正文裁字。
- 为避免读者误解，最终版增加手机表格“表格可左右滑动”提示。主线程重新执行完整脚本，另外实测横滚后最后一列进入容器可见范围，全页横向溢出为0；最终截图已重生成。
- 深色阅读后的打印正文/卡片颜色已实测，40项中包含 `dark-print-contrast` 与 `mobile-table-scroll-hint`；本说明前面的自动清单为基础38项，完整40项见JSON。
- 检查命令：`node docs/evidence/runs/technical-guide/check.mjs`，然后 `node docs/evidence/runs/technical-guide/extra.mjs`。脚本/截图为本机忽略目录中的详细证据。
- 131个href中11个为外部学习链接，其余为本地路径/锚点；外链不是本页加载依赖。无外部资源请求或页面错误。
- 未运行产品构建、产品E2E、真实模型或Remote验收；没有改动或提交Claude的产品文件。
