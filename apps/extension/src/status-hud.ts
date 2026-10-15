export type HudTokens = {
  input: number
  output: number
  reasoning?: number
  cache?: {
    read?: number
    write?: number
  }
  total?: number
}

export type HudState = "idle" | "busy" | "retry" | "running" | "waiting" | "permission" | "question" | string

export type FormatHudInput = {
  model?: string
  tokens?: HudTokens
  limit?: number
  cost?: number
  state?: HudState
}

export type FormatHudTooltipInput = {
  title?: string
  sessionId?: string
  state?: HudState
  providerID?: string
  modelID?: string
  tokens?: HudTokens
  limit?: number
  cost?: number
  sessionTokens?: number
}

export function formatHud(input: FormatHudInput): string {
  const { model, tokens, limit, cost, state } = input

  // 1. Model: modelID (max 24 chars, add "…" when cut)
  let modelStr = ""
  if (typeof model === "string" && model.trim()) {
    const trimmed = model.trim()
    if (trimmed.length > 24) {
      modelStr = trimmed.slice(0, 23) + "…"
    } else {
      modelStr = trimmed
    }
  }

  // 2. Context usage: NN% when limit is known else <k>k tok (e.g. 58k tok)
  let totalTokens = 0
  if (tokens) {
    if (typeof tokens.total === "number" && !isNaN(tokens.total)) {
      totalTokens = tokens.total
    } else {
      totalTokens =
        (Number(tokens.input) || 0) +
        (Number(tokens.output) || 0) +
        (Number(tokens.reasoning) || 0) +
        (Number(tokens.cache?.read) || 0) +
        (Number(tokens.cache?.write) || 0)
    }
  }

  let ctxStr = ""
  if (typeof limit === "number" && limit > 0) {
    const pct = Math.round((totalTokens / limit) * 100)
    ctxStr = `${pct}%`
  } else {
    const k = Math.round(totalTokens / 1000)
    ctxStr = `${k}k tok`
  }

  // 3. Cost: $0.12 (two decimals; <$0.01 when 0 < cost < 0.005; omitted when 0)
  let costStr: string | undefined
  if (typeof cost === "number" && cost > 0) {
    if (cost < 0.005) {
      costStr = "<$0.01"
    } else {
      costStr = `$${cost.toFixed(2)}`
    }
  }

  const parts = [modelStr, ctxStr, costStr].filter((p): p is string => Boolean(p && p.trim()))
  let text = parts.join(" · ")

  // 4. Prefix: $(sync~spin) while busy/running, $(bell) while waiting for permission/question
  if (state === "busy" || state === "running" || state === "retry") {
    text = `$(sync~spin) ${text}`
  } else if (state === "waiting" || state === "permission" || state === "question") {
    text = `$(bell) ${text}`
  }

  return text
}

export function formatHudTooltip(input: FormatHudTooltipInput): string {
  const lines: string[] = []
  const title = input.title || `Session ${input.sessionId ?? ""}`
  lines.push(`oco: ${title}`)

  if (input.state) {
    lines.push(`State: ${input.state}`)
  }

  const modelLabel = [input.providerID, input.modelID].filter(Boolean).join("/")
  if (modelLabel) {
    lines.push(`Model: ${modelLabel}`)
  }

  let totalTokens = 0
  if (input.tokens) {
    if (typeof input.tokens.total === "number" && !isNaN(input.tokens.total)) {
      totalTokens = input.tokens.total
    } else {
      totalTokens =
        (Number(input.tokens.input) || 0) +
        (Number(input.tokens.output) || 0) +
        (Number(input.tokens.reasoning) || 0) +
        (Number(input.tokens.cache?.read) || 0) +
        (Number(input.tokens.cache?.write) || 0)
    }
  }

  if (input.tokens) {
    const limitStr = typeof input.limit === "number" && input.limit > 0 ? ` / ${input.limit.toLocaleString()}` : ""
    const pctStr = typeof input.limit === "number" && input.limit > 0 ? ` (${Math.round((totalTokens / input.limit) * 100)}%)` : ""
    lines.push(`Context: ${totalTokens.toLocaleString()}${limitStr} tokens${pctStr}`)
    lines.push(`  • Input: ${(Number(input.tokens.input) || 0).toLocaleString()}`)
    lines.push(`  • Output: ${(Number(input.tokens.output) || 0).toLocaleString()}`)
    if (input.tokens.reasoning) {
      lines.push(`  • Reasoning: ${input.tokens.reasoning.toLocaleString()}`)
    }
    if (input.tokens.cache?.read || input.tokens.cache?.write) {
      lines.push(`  • Cache read: ${(Number(input.tokens.cache.read) || 0).toLocaleString()}`)
      lines.push(`  • Cache write: ${(Number(input.tokens.cache.write) || 0).toLocaleString()}`)
    }
  }

  let sessionCostStr = ""
  if (typeof input.cost === "number" && input.cost > 0) {
    sessionCostStr = input.cost < 0.005 ? "<$0.01" : `$${input.cost.toFixed(2)}`
  }

  const sessionTokens = input.sessionTokens ?? totalTokens
  const sessionParts: string[] = []
  if (sessionCostStr) sessionParts.push(sessionCostStr)
  if (sessionTokens > 0) sessionParts.push(`${sessionTokens.toLocaleString()} tokens`)
  if (sessionParts.length > 0) {
    lines.push(`Session Total: ${sessionParts.join(" · ")}`)
  }

  return lines.join("\n")
}
