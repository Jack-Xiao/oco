import { launch, command, waitForChatFrame, shot, sleep } from "./vscode.mjs"
const { app, page } = await launch()
const logs = []
page.on("console", (m) => logs.push(`[workbench ${m.type()}] ${m.text()}`))
try {
  await sleep(2000)
  await command(page, "oco: New Session")
  await sleep(6000);   const [frame] = await waitForChatFrame(page, 1, 90000)
  frame.page().on("console", () => {})
  const errs = []
  await sleep(8000)
  const text = await frame.evaluate(() => document.body.innerText.slice(0, 800))
  console.log("webview text:", JSON.stringify(text))
  await shot(page, "smoke-new-session")
} catch (e) {
  console.log("ERROR", e.message)
  await shot(page, "smoke-error").catch(() => {})
} finally {
  console.log(logs.filter((l) => /error|violat|refused|oco/i.test(l)).slice(0, 40).join("\n"))
  await app.close()
}
