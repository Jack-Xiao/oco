// T010 recovery UI owned by oco (patches/opencode/0008 routes the official app's error page, unreachable-server
// screen and missing-session screen here via platform.recoveryView), plus an in-panel notice while the host's
// connection is down. Never shows raw errors, server responses, addresses or credentials: the text is fixed and
// the only actions are fixed host operations. Drafts are left where they are (panel storage); nothing is sent.
import type { RecoveryViewProps } from "@opencode-ai/app"
import { createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { init, onConnection, ui } from "./bridge"

type Kind = RecoveryViewProps["kind"]
type Action = { id: string; label: string; run: () => void; primary?: boolean }

const zh = /^zh/i.test(init.locale ?? "")
const t = (cn: string, en: string) => (zh ? cn : en)

const stats = ((window as unknown as { __OCO_STATS__: Record<string, number> }).__OCO_STATS__ ??= {})
stats.recoveryViews = 0

/** Upstream only knows "error" for some failures it did not classify; recognise the two we can act on. */
export function classify(p: RecoveryViewProps): Kind {
  if (p.kind !== "error") return p.kind
  const e = p.error as { name?: unknown; message?: unknown; data?: { name?: unknown } } | undefined
  const name = String(e?.name ?? e?.data?.name ?? "")
  const message = String(e?.message ?? "")
  if (name === "NotFoundError") return "session-missing"
  // Bridge fetch failures surface as TypeError (apps/chat-webview/src/bridge.ts).
  if (e instanceof TypeError && /fetch|network|connect|offline|refused|reach/i.test(message)) return "unreachable"
  return "error"
}

const [recoveryShown, setRecoveryShown] = createSignal(0)
const UNREACHABLE_MIN_MS = 1500

function Screen(props: { kind: Kind; title: string; body: string; actions: Action[] }) {
  setRecoveryShown((n) => n + 1)
  onCleanup(() => setRecoveryShown((n) => n - 1))
  stats.recoveryViews++
  return (
    <div
      data-oco-recovery={props.kind}
      role="alert"
      style={{
        position: "fixed",
        inset: "0",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        padding: "24px",
        background: "var(--vscode-editor-background, var(--background-base))",
        color: "var(--vscode-foreground, inherit)",
        "font-family": "var(--vscode-font-family, sans-serif)",
        "z-index": "10000",
      }}
    >
      <div style={{ "max-width": "440px", display: "flex", "flex-direction": "column", gap: "12px", "text-align": "center" }}>
        <div style={{ "font-size": "15px", "font-weight": "600" }}>{props.title}</div>
        <div style={{ "font-size": "13px", opacity: "0.8", "line-height": "1.5" }}>{props.body}</div>
        <div style={{ display: "flex", gap: "8px", "justify-content": "center", "flex-wrap": "wrap", "margin-top": "8px" }}>
          <For each={props.actions}>{(a) => <Button action={a} />}</For>
        </div>
      </div>
    </div>
  )
}

function Button(props: { action: Action }) {
  return (
    <button
      type="button"
      data-oco-action={props.action.id}
      onClick={() => props.action.run()}
      style={{
        padding: "4px 12px",
        "font-size": "13px",
        border: "1px solid var(--vscode-button-border, transparent)",
        "border-radius": "2px",
        cursor: "pointer",
        color: props.action.primary ? "var(--vscode-button-foreground)" : "var(--vscode-button-secondaryForeground)",
        background: props.action.primary ? "var(--vscode-button-background)" : "var(--vscode-button-secondaryBackground)",
      }}
    >
      {props.action.label}
    </button>
  )
}

const act = {
  settings: (): Action => ({ id: "openSettings", label: t("打开设置", "Open Settings"), run: () => ui("openSettings") }),
  sessions: (): Action => ({ id: "showSessions", label: t("会话列表", "Sessions"), run: () => ui("showSessions") }),
  newSession: (): Action => ({ id: "newSession", label: t("新建会话", "New Session"), run: () => ui("newSession") }),
  close: (): Action => ({ id: "closePanel", label: t("关闭面板", "Close Panel"), run: () => ui("closePanel") }),
  reload: (primary = true): Action => ({ id: "reload", label: t("重新加载面板", "Reload Panel"), primary, run: () => ui("reload") }),
}

/** platform.recoveryView */
export function RecoveryView(p: RecoveryViewProps): JSX.Element {
  const kind = classify(p)
  if (p.error !== undefined) console.error("[oco] recovery view:", kind, p.error)
  // Shown by the app's startup health gate: once the server answers again the gate drops this view. The app
  // bootstrapped nothing while it was down (models/agents stay unloaded), so start the document afresh.
  // The gate also renders this view for a moment on every healthy start (it leaves "blocking" mode before its
  // check settles), so only a view that outlived one of the gate's 1 s retries counts as a real outage.
  if (p.kind === "unreachable") {
    const shownAt = performance.now()
    onCleanup(() => {
      if (performance.now() - shownAt < UNREACHABLE_MIN_MS) return
      ui("retryConnection") // the host's own feed may still be waiting out its backoff
      ui("reload")
    })
  }
  if (kind === "unreachable")
    return (
      <Screen
        kind="unreachable"
        title={t("无法连接 OpenCode 服务", "Can't reach the OpenCode server")}
        body={t(
          "请确认服务正在运行，并检查 oco 的服务地址设置。服务恢复后面板会自动继续；草稿保留在本机，不会自动发送。",
          "Make sure the server is running and check oco's server settings. The panel continues on its own once the server is back; your draft stays on this machine and is not sent.",
        )}
        actions={[
          {
            id: "retry",
            label: t("重试", "Retry"),
            primary: true,
            // The app's own check retries every second; this retries now and resets the host's backoff.
            run: () => (ui("retryConnection"), p.retry ? p.retry() : ui("reload")),
          },
          act.settings(),
        ]}
      />
    )
  if (kind === "session-missing")
    return (
      <Screen
        kind="session-missing"
        title={t("此会话已不存在", "This session no longer exists")}
        body={t(
          "它可能已在其他客户端或服务端被删除。可以从会话列表打开其他会话，或新建会话。本面板的草稿仍留在本机，不会迁移到其他会话，也不会自动发送。",
          "It may have been deleted from another client or on the server. Open another session from the list or start a new one. This panel's draft stays on this machine; it is not moved to another session or sent.",
        )}
        actions={[{ ...act.sessions(), primary: true }, act.newSession(), act.close()]}
      />
    )
  return (
    <Screen
      kind="error"
      title={t("聊天面板出错", "The chat panel hit an error")}
      body={t(
        "界面遇到意外错误。会话内容保存在服务端，重新加载面板即可继续；草稿保留在本机，不会自动发送。",
        "Something unexpected went wrong. The session is stored on the server; reload the panel to continue. Your draft stays on this machine and is not sent.",
      )}
      actions={[act.reload(), act.sessions()]}
    />
  )
}

/** Thin notice at the top of the panel while the host cannot reach the server (the page itself keeps its content). */
export function ConnectionBanner(): JSX.Element {
  const [state, setState] = createSignal<{ state: string; bound: boolean } | undefined>()
  onCleanup(onConnection((m) => setState({ state: m.state, bound: m.bound })))
  const text = () => {
    const s = state()
    if (!s || s.state === "connected" || s.state === "connecting") return undefined
    if (s.state === "unauthorized") return t("服务认证失败，请检查 oco 的用户名或密码。", "The server rejected oco's credentials. Check the username or password.")
    if (s.state === "unconfigured") return t("oco 的服务地址或工作区未配置。", "oco's server address or workspace folder is not set up.")
    return t("与 OpenCode 服务的连接已断开，正在自动重连……草稿不会丢失。", "Lost the connection to the OpenCode server; reconnecting… Your draft is kept.")
  }
  return (
    <Show when={!recoveryShown() && text()}>
      {(msg) => (
        <div
          data-oco-connection-banner={state()?.state}
          role="status"
          style={{
            position: "fixed",
            top: "0",
            left: "0",
            right: "0",
            display: "flex",
            "align-items": "center",
            gap: "8px",
            "flex-wrap": "wrap",
            padding: "6px 12px",
            "font-size": "12px",
            "font-family": "var(--vscode-font-family, sans-serif)",
            color: "var(--vscode-inputValidation-warningForeground, var(--vscode-foreground))",
            background: "var(--vscode-inputValidation-warningBackground, #5a4a00)",
            "border-bottom": "1px solid var(--vscode-inputValidation-warningBorder, transparent)",
            "z-index": "9999",
          }}
        >
          <span style={{ flex: "1 1 auto" }}>{msg()}</span>
          <Show when={state()?.state !== "unauthorized" && state()?.state !== "unconfigured"}>
            <Button action={{ id: "retry", label: t("立即重试", "Retry now"), run: () => ui("retryConnection") }} />
          </Show>
          <Button action={act.settings()} />
        </div>
      )}
    </Show>
  )
}
