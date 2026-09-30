// Visible state for the embedded composer's model wait (patches/opencode/0004):
// - `data-oco-model="loading"` on <html>: the directory's agents/providers have not loaded yet;
// - `oco:submit-state` events: a submit is waiting for them (one pending send, cancellable), or ended.
// The banner is plain DOM so it never touches the official app's component tree.

type State = "waiting" | "ready" | "cancel" | "draft" | "timeout"

const counts: Record<State, number> = { waiting: 0, ready: 0, cancel: 0, draft: 0, timeout: 0 }
const LOADING_DELAY_MS = 800 // do not flash a hint for a normal, fast first load
const NOTICE_MS = 4000

const bar = document.createElement("div")
bar.id = "oco-submit-status"
bar.setAttribute("role", "status")
bar.setAttribute("aria-live", "polite")
bar.hidden = true
const text = document.createElement("span")
const cancel = document.createElement("button")
cancel.type = "button"
cancel.textContent = "取消发送"
cancel.addEventListener("click", () => window.dispatchEvent(new CustomEvent("oco:submit-cancel")))
bar.append(text, cancel)

const style = document.createElement("style")
style.textContent = `
#oco-submit-status{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483000;
  max-width:calc(100% - 16px);box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;
  padding:6px 10px;border-radius:6px;font:12px/1.4 var(--vscode-font-family,system-ui,sans-serif);
  color:var(--vscode-notifications-foreground,var(--vscode-foreground));
  background:var(--vscode-notifications-background,var(--vscode-editorWidget-background));
  border:1px solid var(--vscode-notifications-border,var(--vscode-widget-border,transparent));
  box-shadow:0 2px 8px var(--vscode-widget-shadow,rgba(0,0,0,.25))}
#oco-submit-status[hidden]{display:none}
#oco-submit-status button{font:inherit;padding:2px 8px;border-radius:4px;cursor:pointer;
  color:var(--vscode-button-secondaryForeground,inherit);background:var(--vscode-button-secondaryBackground,transparent);
  border:1px solid var(--vscode-button-border,var(--vscode-widget-border,currentColor))}
`

let mode: "idle" | "loading" | "waiting" | "notice" = "idle"
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let loadingTimer: ReturnType<typeof setTimeout> | undefined

function show(next: typeof mode, message: string, withCancel = false) {
  mode = next
  text.textContent = message
  cancel.hidden = !withCancel
  bar.hidden = false
  bar.dataset.state = next
}

function hide() {
  mode = "idle"
  bar.hidden = true
  delete bar.dataset.state
  syncLoading()
}

function modelLoading() {
  return document.documentElement.dataset.ocoModel === "loading"
}

/** Passive hint while the model is still loading and nothing more important is shown. */
function syncLoading() {
  if (mode === "waiting" || mode === "notice") return
  if (!modelLoading()) {
    clearTimeout(loadingTimer)
    loadingTimer = undefined
    if (mode === "loading") hide()
    return
  }
  if (mode === "loading" || loadingTimer) return
  loadingTimer = setTimeout(() => {
    loadingTimer = undefined
    if (modelLoading() && mode === "idle") show("loading", "正在加载模型和 Agent……")
  }, LOADING_DELAY_MS)
}

function notice(message: string) {
  clearTimeout(noticeTimer)
  show("notice", message)
  noticeTimer = setTimeout(hide, NOTICE_MS)
}

window.addEventListener("oco:submit-state", (e) => {
  const state = (e as CustomEvent<{ state?: State }>).detail?.state
  if (!state || !(state in counts)) return
  counts[state]++
  clearTimeout(noticeTimer)
  switch (state) {
    case "waiting":
      return show("waiting", "模型和 Agent 仍在加载，加载完成后自动发送。修改草稿或按 Esc 会取消发送。", true)
    case "cancel":
      return notice("已取消发送，草稿已保留。")
    case "draft":
      return notice("草稿已修改，已取消自动发送。确认后请重新发送。")
    case "ready":
    case "timeout": // the official app shows its own "select an agent and model" toast
      return hide()
  }
})

new MutationObserver(syncLoading).observe(document.documentElement, { attributes: true, attributeFilter: ["data-oco-model"] })

export function installSubmitStatus() {
  document.head.append(style)
  document.body.append(bar)
  syncLoading()
}

export const submitStats = () => ({ ...counts, shown: bar.hidden ? null : (bar.dataset.state ?? null), text: bar.hidden ? "" : text.textContent })
