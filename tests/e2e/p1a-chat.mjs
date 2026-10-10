// P1a-00/04 chat regression with tightened assertions (real VS Code + real server):
// stream locked to the assistant text part, permission/question bound to request ids and answer
// fields, stop verified from the stop state, and bridge policy attacks from the page.
// OCO_E2E_NEGATIVE=question answers "red" while expecting "blue": the suite must then exit non-zero.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitForChatFrame, frameSession, sleep, runShot, hostState } from "./vscode.mjs"
import { api, messages, status, waitIdle, waitMessageFinal, MODEL } from "./server.mjs"

const REQUIRED = ["stream-locked", "permission-bound", "question-answer", "cancel-real", "policy-foreign-session", "policy-directory-override", "policy-unlisted-write", "csp-violations"]
const run = createRun({ suite: "p1a-chat", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const NEG = process.env.OCO_E2E_NEGATIVE === "question"
if (NEG) run.setEnv({ negativeControl: "question: clicks red, expects blue" })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null })

const { app, page, stateFile } = await launch({ profile: "p1a-chat", run })
run.installCrashHandlers(() => app.close())
const csp = []
page.on("console", (m) => {
  if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 200))
})
const norm = (s) => s.replace(/\s+/g, " ").trim()

async function send(frame, text) {
  const input = frame.locator('[data-component="prompt-input"]')
  for (let attempt = 0; attempt < 2; attempt++) {
    await input.click()
    await input.focus()
    await page.keyboard.type(text, { delay: 4 })
    await sleep(200)
    if ((await input.innerText()).includes(text.slice(0, 20))) break
    await page.keyboard.press("Meta+a")
    await page.keyboard.press("Backspace")
  }
  await page.keyboard.press("Enter")
}
async function newPartIds(sid, known) {
  const ms = await messages(sid)
  return ms.filter((m) => m.info.role === "assistant").flatMap((m) => m.parts).filter((p) => p.type === "text" && !known.has(p.id))
}

try {
  await command(page, "oco: New Session")
  const [frame] = await waitForChatFrame(page, 1, 90000, '[data-component="prompt-input"]')
  const sid = await frameSession(frame)
  await frame.getByText(MODEL.label).first().waitFor({ timeout: 60000 })
  // Agents/models loaded (patch 0004 marks the page); then a short settle for the composer.
  const t = Date.now()
  while (Date.now() - t < 10000 && (await frame.evaluate(() => document.documentElement.dataset.ocoModel)) !== "ready") await sleep(100)
  await sleep(500)
  run.setEnv({ sessionId: sid })

  // 1. Stream locked to one assistant text part: DOM samples of that part must grow while the server
  //    is busy, each sample must be a prefix of the final server text, and the end must match it.
  {
    const known = new Set()
    await send(frame, "List the numbers 1 to 200 as English words separated by single spaces, in one paragraph. No tools.")
    let partId
    const t0 = Date.now()
    while (!partId && Date.now() - t0 < 60000) {
      partId = (await newPartIds(sid, known))[0]?.id
      if (!partId) await sleep(100)
    }
    const samples = []
    while (partId && Date.now() - t0 < 120000) {
      const txt = await frame.evaluate((id) => document.querySelector(`[data-component="text-part"][data-timeline-part-id="${id}"] [data-component="markdown"]`)?.textContent ?? null, partId)
      const busy = (await status(sid)) === "busy"
      if (txt !== null && (samples.length === 0 || samples.at(-1).text !== txt)) samples.push({ t: Date.now() - t0, text: txt, busy })
      if (!busy && Date.now() - t0 > 3000) break
      await sleep(80)
    }
    await waitIdle(sid)
    await sleep(800)
    const finalServer = (await messages(sid)).flatMap((m) => m.parts).find((p) => p.id === partId)?.text ?? ""
    const finalDom = await frame.evaluate((id) => document.querySelector(`[data-component="text-part"][data-timeline-part-id="${id}"] [data-component="markdown"]`)?.textContent ?? "", partId)
    const whileBusy = samples.filter((s) => s.busy && s.text.length > 0)
    const prefixes = whileBusy.every((s) => norm(finalServer).startsWith(norm(s.text).slice(0, Math.max(0, norm(s.text).length - 2))))
    const growing = whileBusy.every((s, i) => i === 0 || norm(s.text).length >= norm(whileBusy[i - 1].text).length)
    await runShot(page, run, "1-stream")
    run.record("stream-locked", partId && whileBusy.length >= 3 && prefixes && growing && norm(finalDom) === norm(finalServer) ? "PASS" : "FAIL", {
      partId,
      distinctSamplesWhileBusy: whileBusy.length,
      samplesArePrefixes: prefixes,
      monotonic: growing,
      finalDomEqualsServer: norm(finalDom) === norm(finalServer),
      serverChars: finalServer.length,
      firstDiff: (() => {
        const a = norm(finalDom), b = norm(finalServer)
        let i = 0
        while (i < a.length && a[i] === b[i]) i++
        return i >= Math.max(a.length, b.length) ? null : { at: i, dom: a.slice(Math.max(0, i - 20), i + 40), server: b.slice(Math.max(0, i - 20), i + 40) }
      })(),
    })
  }

  // 2. Permission bound to its request id -> tool call id -> tool part.
  {
    await send(frame, "Use the bash tool to run exactly: echo oco-perm-$((6*7)) . Then reply with the output.")
    let req
    const t0 = Date.now()
    while (!req && Date.now() - t0 < 90000) {
      req = ((await api("GET", "/permission")) ?? []).find((p) => p.sessionID === sid)
      if (!req) await sleep(300)
    }
    if (!req) {
      run.record("permission-bound", "NOT RUN", { reason: "model did not request the bash permission within 90s", waitedMs: Date.now() - t0 })
    } else {
      const dock = frame.locator('[data-component="dock-prompt"][data-kind="permission"]')
      const dockSeen = await dock.waitFor({ timeout: 30000 }).then(() => true, () => false)
      if (!dockSeen) {
        run.record("permission-bound", "FAIL", { requestId: req.id, reason: "permission request exists but the dock did not appear" })
      } else {
        const dockText = await dock.innerText()
        await runShot(page, run, "2-permission")
        await dock.getByRole("button", { name: /allow once|允许一次/i }).click()
        await waitIdle(sid)
        const stillPending = ((await api("GET", "/permission")) ?? []).some((p) => p.id === req?.id)
        const tool = (await messages(sid)).flatMap((m) => m.parts).find((p) => p.type === "tool" && p.callID === req?.tool?.callID)
        run.record("permission-bound", req && !stillPending && tool?.tool === "bash" && tool.state?.status === "completed" && String(tool.state.output).includes("oco-perm-42") && dockText.includes("oco-perm") ? "PASS" : "FAIL", {
          requestId: req?.id,
          callId: req?.tool?.callID,
          requestResolved: !!req && !stillPending,
          toolStatus: tool?.state?.status,
          outputMatches: String(tool?.state?.output ?? "").includes("oco-perm-42"),
          dockShowsCommand: dockText.includes("oco-perm"),
        })
      }
    }
  }

  // 3. Question: the recorded answer must equal the option clicked (answer field, not the whole state).
  {
    const expected = "blue"
    const click = NEG ? "red" : "blue"
    // The model may answer in plain text instead of calling the tool: up to two attempts.
    let q
    let attempts = 0
    for (; attempts < 2 && !q; attempts++) {
      await send(frame, "Use the question tool (not plain text) to ask which color I prefer, with exactly two options: red and blue. After my answer reply with the color only.")
      const t0 = Date.now()
      while (!q && Date.now() - t0 < 90000) {
        q = ((await api("GET", "/question")) ?? []).find((x) => x.sessionID === sid)
        if (!q && Date.now() - t0 > 5000 && (await status(sid)) === "idle") break
        if (!q) await sleep(300)
      }
      if (!q) await waitIdle(sid)
    }
    if (!q) {
      run.record("question-answer", "NOT RUN", { reason: "model did not call the question tool", attempts })
      for (const x of ((await api("GET", "/question")) ?? []).filter((x) => x.sessionID === sid)) await api("POST", `/question/${x.id}/reject`)
      await waitIdle(sid)
    } else {
      const dock = frame.locator('[data-component="dock-prompt"][data-kind="question"]')
      await dock.waitFor({ timeout: 30000 })
      await runShot(page, run, "3-question")
      await dock.getByText(new RegExp(`^${click}$`, "i")).first().click()
      const submit = dock.getByRole("button", { name: /submit|send|提交|发送|confirm|确认/i })
      if (await submit.count()) await submit.first().click()
      await waitIdle(sid)
      const tool = (await messages(sid)).flatMap((m) => m.parts).find((p) => p.type === "tool" && p.callID === q.tool?.callID)
      const answer = tool?.state?.metadata?.answers?.[0]?.[0]
      run.record("question-answer", tool?.state?.status === "completed" && answer?.toLowerCase() === expected ? "PASS" : "FAIL", {
        requestId: q.id,
        clicked: click,
        expected,
        recordedAnswer: answer ?? null,
        negativeControl: NEG,
        attempts,
      })
    }
  }

  // 4. Real cancel: lock the assistant message created by this send; click stop only while that message
  //    is growing and the composer shows the stop state; the server must record MessageAbortedError.
  {
    const known = new Set((await messages(sid)).map((m) => m.info.id))
    await send(frame, "Write 400 numbered sentences, each about a different animal. No tools.")
    const submit = frame.locator('[data-action="prompt-submit"]')
    const t0 = Date.now()
    let label = ""
    let target
    while (Date.now() - t0 < 90000) {
      label = (await submit.getAttribute("aria-label").catch(() => "")) ?? ""
      target = (await messages(sid)).find((m) => m.info.role === "assistant" && !known.has(m.info.id))
      const chars = (target?.parts ?? []).filter((p) => p.type === "text" || p.type === "reasoning").reduce((n, p) => n + (p.text?.length ?? 0), 0)
      if (/stop|停止/i.test(label) && (await status(sid)) === "busy" && chars > 300) break
      await sleep(100)
    }
    await submit.click()
    const clicked = Date.now()
    let idleAfter = null
    while (Date.now() - clicked < 20000) {
      if ((await status(sid)) === "idle") {
        idleAfter = Date.now() - clicked
        break
      }
      await sleep(100)
    }
    // The session reports idle slightly before the aborted message is finalised: wait for that.
    const a = target ? await waitMessageFinal(sid, target.info.id) : null
    const len1 = JSON.stringify(a?.parts ?? []).length
    await sleep(3000)
    const len2 = JSON.stringify((await messages(sid)).find((m) => m.info.id === target?.info.id)?.parts ?? []).length
    await runShot(page, run, "4-cancel")
    run.record("cancel-real", /stop|停止/i.test(label) && a?.info?.error?.name === "MessageAbortedError" && idleAfter !== null && len1 === len2 ? "PASS" : "FAIL", {
      buttonLabelBeforeClick: label,
      messageId: target?.info.id ?? null,
      error: a?.info?.error?.name ?? null,
      finish: a?.info?.finish ?? null,
      serverIdleAfterMs: idleAfter,
      stoppedGrowing: len1 === len2,
    })
  }

  // 5. Bridge policy attacks from the page (the page can call the bridge directly).
  {
    const other = await api("POST", "/session", { title: "oco foreign session" })
    await api("POST", `/session/${other.id}/prompt_async`, {
      model: { providerID: MODEL.providerID, modelID: MODEL.modelID },
      parts: [{ type: "text", text: "Write a numbered list from 1 to 200 of fruit names. No tools." }],
    })
    const t0 = Date.now()
    while (Date.now() - t0 < 30000 && (await status(other.id)) !== "busy") await sleep(200)
    const attack = (url, method = "POST", body) =>
      frame.evaluate(
        async ({ url, method, body }) => {
          const r = await window.__OCO_DEBUG__.fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
          return { status: r.status, body: (await r.text()).slice(0, 200) }
        },
        { url, method, body },
      )
    const abortForeign = await attack(`http://oco.bridge/session/${other.id}/abort`)
    const foreignStillBusy = (await status(other.id)) === "busy"
    run.record("policy-foreign-session", abortForeign.status === 403 && foreignStillBusy ? "PASS" : "FAIL", { status: abortForeign.status, body: abortForeign.body, foreignStillBusy })
    const dirOverride = await attack(`http://oco.bridge/session?directory=${encodeURIComponent("/tmp")}`)
    const dirRead = await attack(`http://oco.bridge/session?directory=${encodeURIComponent("/tmp")}`, "GET")
    run.record("policy-directory-override", dirOverride.status === 403 && dirRead.status === 403 ? "PASS" : "FAIL", { write: dirOverride.status, read: dirRead.status })
    const cfg = await attack("http://oco.bridge/config", "PATCH", { share: "auto" })
    const pty = await attack("http://oco.bridge/pty", "POST", {})
    const cfgAfter = await api("GET", "/config")
    run.record("policy-unlisted-write", cfg.status === 403 && pty.status === 403 && cfgAfter?.share !== "auto" ? "PASS" : "FAIL", { configPatch: cfg.status, ptyCreate: pty.status, configUnchanged: cfgAfter?.share !== "auto" })
    await api("POST", `/session/${other.id}/abort`)
    const st = await hostState(page, stateFile)
    run.setEnv({ hostPanels: st.panels.map((p) => ({ policy: p.policy, core: p.core })) })
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  run.record("csp-violations", csp.length === 0 ? "PASS" : "FAIL", { count: csp.length, sample: csp.slice(0, 3) })
  await app.close().catch(() => {})
  process.exit(run.finish())
}
