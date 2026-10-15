import * as vscode from "vscode"

export type ExportSessionInfo = {
  id: string
  title?: string
  directory?: string
  parentID?: string
  cost?: number
  tokens?: number | { total?: number; input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
  time?: {
    created?: number | string
    updated?: number | string
    archived?: number | string
  }
  revert?: {
    messageID?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type ExportPart = {
  type: string
  text?: string
  reasoning?: string
  tool?: string
  name?: string
  status?: string
  state?: {
    title?: string
    status?: string
    input?: unknown
    output?: unknown
    [key: string]: unknown
  }
  input?: unknown
  output?: unknown
  filename?: string
  mime?: string
  mimeType?: string
  [key: string]: unknown
}

export type ExportMessageItem = {
  id?: string
  info?: {
    id?: string
    role?: string
    modelID?: string
    providerID?: string
    cost?: number
    tokens?: number | { total?: number; input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
    time?: {
      created?: number | string
      [key: string]: unknown
    }
    created?: number | string
    [key: string]: unknown
  }
  parts?: ExportPart[]
  role?: string
  modelID?: string
  time?: {
    created?: number | string
    [key: string]: unknown
  }
  created?: number | string
  text?: string
  [key: string]: unknown
}

export type RenderSessionMarkdownOptions = {
  includeReasoning?: boolean
}

export type ExportSessionItem = {
  id: string
  directory?: string
  title?: string
}

export type ExportDeps = {
  request: <T>(method: string, path: string, body?: unknown, directory?: string) => Promise<T>
  rowItem: (arg: unknown) => ExportSessionItem | undefined
  mainSession: () => ExportSessionItem | undefined
  pickSession: (placeHolder: string) => Promise<ExportSessionItem | undefined>
  requireTrust: (what: string) => boolean
}

function formatISO(t: unknown): string {
  if (t === undefined || t === null) return ""
  let ms: number
  if (typeof t === "number") {
    ms = t < 1e11 ? t * 1000 : t
  } else if (typeof t === "string") {
    const parsed = Date.parse(t)
    if (isNaN(parsed)) return t
    ms = parsed
  } else {
    return ""
  }
  const d = new Date(ms)
  return isNaN(d.getTime()) ? "" : d.toISOString()
}

function formatHHMM(t: unknown): string {
  if (t === undefined || t === null) return ""
  let ms: number
  if (typeof t === "number") {
    ms = t < 1e11 ? t * 1000 : t
  } else if (typeof t === "string") {
    const parsed = Date.parse(t)
    if (isNaN(parsed)) return ""
    ms = parsed
  } else {
    return ""
  }
  const d = new Date(ms)
  if (isNaN(d.getTime())) return ""
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function renderSessionMarkdown(
  info?: ExportSessionInfo | null,
  messages?: ExportMessageItem[] | null,
  opts?: RenderSessionMarkdownOptions,
): string {
  const sessionId = info?.id ?? "unknown"
  const title = info?.title?.trim() || `Session ${sessionId}`

  const rawMessages = Array.isArray(messages) ? messages : []
  let activeMessages = rawMessages
  let omittedCount = 0

  if (info?.revert?.messageID) {
    const revertId = info.revert.messageID
    const idx = rawMessages.findIndex((m) => {
      const id = m.info?.id ?? m.id
      return id === revertId
    })
    if (idx !== -1) {
      omittedCount = rawMessages.length - idx
      activeMessages = rawMessages.slice(0, idx)
    }
  }

  // Models used
  const modelSet = new Set<string>()
  let calculatedTokens = 0
  let calculatedCost = 0

  for (const m of activeMessages) {
    const mInfo = m.info ?? m
    if (typeof mInfo.modelID === "string" && mInfo.modelID.trim()) {
      modelSet.add(mInfo.modelID.trim())
    }
    if (typeof mInfo.cost === "number" && !isNaN(mInfo.cost)) {
      calculatedCost += mInfo.cost
    }
    const t = mInfo.tokens
    if (typeof t === "number") {
      calculatedTokens += t
    } else if (t && typeof t === "object") {
      const tok = t as { total?: number; input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
      if (typeof tok.total === "number" && !isNaN(tok.total)) {
        calculatedTokens += tok.total
      } else {
        calculatedTokens +=
          (Number(tok.input) || 0) +
          (Number(tok.output) || 0) +
          (Number(tok.reasoning) || 0) +
          (Number(tok.cache?.read) || 0) +
          (Number(tok.cache?.write) || 0)
      }
    }
  }

  const modelsUsed = modelSet.size > 0 ? [...modelSet].join(", ") : "none"
  const totalCost = typeof info?.cost === "number" ? info.cost : calculatedCost
  let totalTokens = calculatedTokens
  if (typeof info?.tokens === "number") {
    totalTokens = info.tokens
  } else if (info?.tokens && typeof info.tokens === "object" && typeof info.tokens.total === "number") {
    totalTokens = info.tokens.total
  }

  const createdISO = formatISO(info?.time?.created)
  const updatedISO = formatISO(info?.time?.updated)

  const lines: string[] = []
  lines.push(`# ${title}\n`)

  lines.push(`- **Session ID:** ${sessionId}`)
  if (createdISO) lines.push(`- **Created:** ${createdISO}`)
  if (updatedISO) lines.push(`- **Updated:** ${updatedISO}`)
  lines.push(`- **Models:** ${modelsUsed}`)
  lines.push(`- **Total Cost:** $${totalCost.toFixed(2)}`)
  lines.push(`- **Total Tokens:** ${totalTokens}`)

  for (const m of activeMessages) {
    const mInfo = m.info ?? m
    const role = (mInfo.role || "user").toLowerCase()
    const modelID = mInfo.modelID
    const timeVal = mInfo.time?.created ?? mInfo.created
    const timeStr = formatHHMM(timeVal)

    let headerParts: string[] = []
    if (role === "assistant") {
      headerParts.push("Assistant")
      if (modelID) headerParts.push(modelID)
    } else {
      headerParts.push(role.charAt(0).toUpperCase() + role.slice(1))
    }
    if (timeStr) headerParts.push(timeStr)

    lines.push(`\n## ${headerParts.join(" · ")}\n`)

    const parts = Array.isArray(m.parts) ? m.parts : []
    const contentParts: string[] = []

    const rawText = m.text ?? mInfo.text
    if (parts.length === 0 && typeof rawText === "string") {
      contentParts.push(rawText)
    } else {
      for (const part of parts) {
        if (!part || typeof part !== "object") continue
        const type = part.type

        if (type === "text") {
          contentParts.push(typeof part.text === "string" ? part.text : "")
        } else if (type === "reasoning") {
          if (opts?.includeReasoning) {
            const rText = typeof part.text === "string" ? part.text : typeof part.reasoning === "string" ? part.reasoning : ""
            contentParts.push(rText)
          }
        } else if (type === "tool") {
          const toolName = part.tool ?? part.name ?? "tool"
          const stateObj = part.state && typeof part.state === "object" ? (part.state as Record<string, unknown>) : undefined
          const stateLabel = stateObj?.title ?? stateObj?.status ?? part.status
          const summary = stateLabel ? `🔧 ${toolName} — ${stateLabel}` : `🔧 ${toolName}`

          const toolBlocks: string[] = []
          toolBlocks.push(`<details><summary>${summary}</summary>\n`)

          const rawInput = stateObj?.input ?? part.input
          if (rawInput !== undefined) {
            let inputStr = typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput, null, 2)
            if (inputStr.length > 2000) {
              inputStr = inputStr.slice(0, 2000) + "(truncated)"
            }
            toolBlocks.push(`\`\`\`json\n${inputStr}\n\`\`\`\n`)
          }

          const rawOutput = stateObj?.output ?? part.output
          if (rawOutput !== undefined) {
            let outputStr = typeof rawOutput === "string" ? rawOutput : typeof rawOutput === "object" ? JSON.stringify(rawOutput, null, 2) : String(rawOutput)
            if (outputStr.length > 4000) {
              outputStr = outputStr.slice(0, 4000) + "(truncated)"
            }
            toolBlocks.push(`\`\`\`\n${outputStr}\n\`\`\`\n`)
          }

          toolBlocks.push("</details>")
          contentParts.push(toolBlocks.join("\n"))
        } else if (type === "file") {
          const fileLabel = part.filename ?? part.name ?? part.mime ?? part.mimeType ?? "file"
          contentParts.push(`[attachment: ${fileLabel}]`)
        } else if (type === "step-start" || type === "step-finish" || type === "snapshot" || type === "patch") {
          // skipped
        } else {
          // unknown part types: tolerated, do not throw
        }
      }
    }

    if (contentParts.length > 0) {
      lines.push(contentParts.join("\n\n"))
    }
  }

  if (omittedCount > 0) {
    lines.push(`\n_${omittedCount} rolled back messages omitted_`)
  }

  return lines.join("\n")
}

export function registerExportSession(deps: ExportDeps): vscode.Disposable[] {
  const exportDoc = async (arg?: unknown) => {
    if (!deps.requireTrust("export a session")) return
    const item = deps.rowItem(arg)
    const s = item ?? deps.mainSession() ?? (await deps.pickSession("Select a session to export"))
    if (!s) return

    const sessionPath = s.directory
      ? `/session/${encodeURIComponent(s.id)}?directory=${encodeURIComponent(s.directory)}`
      : `/session/${encodeURIComponent(s.id)}`
    const msgPath = s.directory
      ? `/session/${encodeURIComponent(s.id)}/message?directory=${encodeURIComponent(s.directory)}`
      : `/session/${encodeURIComponent(s.id)}/message`

    const [info, messages] = await Promise.all([
      deps.request<ExportSessionInfo>("GET", sessionPath, undefined, s.directory),
      deps.request<ExportMessageItem[]>("GET", msgPath, undefined, s.directory),
    ])

    const content = renderSessionMarkdown(info, messages)
    const doc = await vscode.workspace.openTextDocument({ language: "markdown", content })
    await vscode.window.showTextDocument(doc)
  }

  const exportFile = async (arg?: unknown) => {
    if (!deps.requireTrust("export a session")) return
    const item = deps.rowItem(arg)
    const s = item ?? deps.mainSession() ?? (await deps.pickSession("Select a session to export"))
    if (!s) return

    const sessionPath = s.directory
      ? `/session/${encodeURIComponent(s.id)}?directory=${encodeURIComponent(s.directory)}`
      : `/session/${encodeURIComponent(s.id)}`
    const msgPath = s.directory
      ? `/session/${encodeURIComponent(s.id)}/message?directory=${encodeURIComponent(s.directory)}`
      : `/session/${encodeURIComponent(s.id)}/message`

    const [info, messages] = await Promise.all([
      deps.request<ExportSessionInfo>("GET", sessionPath, undefined, s.directory),
      deps.request<ExportMessageItem[]>("GET", msgPath, undefined, s.directory),
    ])

    const content = renderSessionMarkdown(info, messages)

    const titleSlug =
      (info?.title || s.title || s.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "session"
    const now = new Date()
    const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`
    const defaultName = `${titleSlug}-${yyyymmdd}.md`

    const firstFolder = vscode.workspace.workspaceFolders?.[0]?.uri
    const defaultUri = firstFolder ? vscode.Uri.joinPath(firstFolder, defaultName) : undefined

    const fileUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { Markdown: ["md"] },
      saveLabel: "Export",
    })
    if (!fileUri) return

    const bytes = new TextEncoder().encode(content)
    await vscode.workspace.fs.writeFile(fileUri, bytes)
    void vscode.window.showInformationMessage(`oco: Exported session to ${fileUri.fsPath}`)
  }

  return [
    vscode.commands.registerCommand("oco.exportSession", async (arg?: unknown) => {
      try {
        await exportDoc(arg)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        void vscode.window.showErrorMessage(`oco: Could not export session (${msg})`)
      }
    }),
    vscode.commands.registerCommand("oco.exportSessionToFile", async (arg?: unknown) => {
      try {
        await exportFile(arg)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        void vscode.window.showErrorMessage(`oco: Could not export session to file (${msg})`)
      }
    }),
  ]
}
