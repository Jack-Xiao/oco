// P1b-1 host-side session contracts (extension host only; not part of the webview protocol).
// Fixed before the sidebar, status bar and tests are built on top of them.

/** Visible state of the attached connection. */
export type ConnectionState =
  | "unconfigured" // no valid server URL, or no workspace folder
  | "connecting" // first connect / snapshot in progress
  | "connected" // snapshot loaded and event stream open
  | "reconnecting" // stream lost; retrying with backoff (last snapshot still shown, marked stale)
  | "unauthorized" // 401: waits for a password change, never retries on its own
  | "error" // server unreachable or failed; retrying with backoff

/** 1. connection summary */
export type ConnectionSummary = {
  connectionId: string | null
  /** Display label: server origin (no credentials). */
  label: string
  directory: string | null
  state: ConnectionState
  /** User-facing reason for error / unauthorized / unconfigured. */
  error?: string
  /** For `unconfigured`: which setting is missing/invalid (the URL/user setting, or no workspace folder). */
  issue?: "endpoint" | "folder"
  /** Consecutive failed attempts since the last successful connect (0 when connected). */
  attempt: number
  /** Epoch ms of the next retry while reconnecting / error. */
  retryAt?: number
  lastConnectedAt?: number
  trusted: boolean
}

/** 3. session status, derived. Priority: permission > question > error > busy/retry > idle. */
export type SessionActivity = "idle" | "busy" | "retry" | "permission" | "question" | "error"

/** 2. session list item (root sessions of the bound workspace; children fold into their root). */
export type SessionListItem = {
  id: string
  title: string
  directory: string
  updated: number
  activity: SessionActivity
  /** Pending requests in this session or any of its descendant sessions. */
  pendingPermissions: number
  pendingQuestions: number
  /** Last session.error message since the session was last busy. */
  error?: string
}

/** 4. open-session: open a session's panel, or reveal (focus) the editor group that already shows it. */
export type OpenSessionRequest = {
  connectionId: string
  directory: string
  sessionId: string
  title?: string
  /** Default true: move keyboard focus to the panel. */
  focus?: boolean
}
