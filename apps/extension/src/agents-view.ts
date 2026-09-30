// T013 native Agents view: the server's effective agent list, where each one comes from, and file-based
// create / duplicate / open-raw. oco only ever creates new files; editing happens in the raw file.
import * as vscode from "vscode"
import * as fs from "node:fs"
import * as path from "node:path"
import { isLoopbackHost } from "./endpoint"
import type { Connection } from "./connection"
import { agentDirs, agentFileContent, agentRows, configFiles, configText, modelString, newAgentPath, scanAgentFiles, validateAgentName, type AgentRow, type AgentScope, type ServerAgent } from "./agents"

export const AGENTS_VIEW = "oco.agents"
type ServerPaths = { home: string; config: string; worktree: string; directory: string }

const SOURCE: Record<AgentRow["source"], string> = { builtin: "内置", file: "文件", config: "配置文件" }
const SCOPE: Record<AgentScope, string> = { project: "项目", user: "用户" }

export class AgentItem extends vscode.TreeItem {
  constructor(readonly row: AgentRow) {
    super(row.name, vscode.TreeItemCollapsibleState.None)
    this.id = `agent:${row.name}`
    const where = row.source === "file" && row.scope ? `${SCOPE[row.scope]}文件` : SOURCE[row.source]
    this.description = [row.mode, where, row.state === "pending" ? "待生效" : ""].filter(Boolean).join(" · ")
    const icon = row.state === "pending" ? "watch" : row.source === "builtin" ? "lock" : row.source === "config" ? "json" : "hubot"
    this.iconPath = new vscode.ThemeIcon(icon, row.state === "pending" ? new vscode.ThemeColor("charts.yellow") : undefined)
    this.contextValue = `oco.agent.${row.source}`
    const tip = new vscode.MarkdownString(undefined, true)
    tip.appendMarkdown(`**${row.name}**（${row.mode ?? "?"}）\n\n`)
    if (row.description) tip.appendText(row.description + "\n\n")
    tip.appendText(`来源：${where}${row.file ? `\n${row.file}` : ""}`)
    const model = modelString(row.server?.model)
    if (model) tip.appendText(`\n模型：${model}`)
    if (row.source === "builtin") tip.appendText("\n内置定义只读；可复制为文件后修改")
    if (row.pendingReason) tip.appendText(`\n\n待生效：${row.pendingReason}`)
    this.tooltip = tip
    this.accessibilityInformation = { label: [row.name, row.mode, where, row.state === "pending" ? "待生效" : ""].filter(Boolean).join("，") }
    if (row.file) this.command = { command: "oco.agents.openFile", title: "打开原文", arguments: [this] }
  }
}

export class AgentsView implements vscode.TreeDataProvider<AgentItem>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changed.event
  readonly view: vscode.TreeView<AgentItem>
  private rows: AgentRow[] = []
  private paths: ServerPaths | undefined
  private error: string | undefined
  private loading: Promise<void> | undefined
  private watcher: vscode.FileSystemWatcher | undefined
  readonly stats = { loads: 0, reloads: 0 }

  constructor(
    private readonly conn: Connection,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.view = vscode.window.createTreeView(AGENTS_VIEW, { treeDataProvider: this })
    this.view.onDidChangeVisibility((e) => e.visible && void this.refresh())
  }

  /** Files are only writable when the server runs on this host (then its paths are ours). */
  writable(): string | undefined {
    try {
      if (!isLoopbackHost(this.conn.endpoint().host)) return "服务不在本机，Agent 文件以服务端为准，oco 只读显示"
    } catch (e) {
      return (e as Error).message
    }
    if (!vscode.workspace.isTrusted) return "受限模式下不能写入 Agent 文件"
    if (!this.paths) return "尚未从服务读取配置目录"
    return undefined
  }

  refresh(): Promise<void> {
    if (this.loading) return this.loading
    this.loading = this.load().finally(() => {
      this.loading = undefined
      this.changed.fire()
    })
    return this.loading
  }

  private async load() {
    this.stats.loads++
    try {
      const dir = this.conn.directory
      if (!dir) throw new Error("需要先打开一个工作区文件夹")
      const [agents, paths] = await Promise.all([this.conn.request<ServerAgent[]>("GET", "/agent"), this.conn.request<ServerPaths>("GET", "/path")])
      this.paths = paths
      const local = isLoopbackHost(this.conn.endpoint().host)
      const files = local ? scanAgentFiles(agentDirs(paths)) : new Map()
      this.rows = agentRows(agents, files, local ? configText(paths) : undefined)
      this.error = undefined
      this.watch(local ? paths : undefined)
    } catch (e) {
      this.rows = []
      this.error = (e as Error).message
    }
    this.view.message = this.error ? `无法读取 Agent：${this.error}` : this.writable() && this.paths ? this.writable() : undefined
  }

  private watch(paths: ServerPaths | undefined) {
    this.watcher?.dispose()
    this.watcher = undefined
    if (!paths) return
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.join(paths.directory, ".opencode")), "{agent,agents}/**/*.md"))
    const again = () => void this.refresh()
    w.onDidChange(again)
    w.onDidCreate(again)
    w.onDidDelete(again)
    this.watcher = w
  }

  getTreeItem(e: AgentItem) {
    return e
  }

  getChildren(): AgentItem[] {
    return this.rows.map((r) => new AgentItem(r))
  }

  find(name: string) {
    return this.rows.find((r) => r.name === name)
  }

  debugState() {
    return { error: this.error ?? null, message: this.view.message ?? null, writable: this.writable() ?? true, rows: this.rows.map((r) => ({ name: r.name, source: r.source, scope: r.scope ?? null, mode: r.mode ?? null, state: r.state, file: r.file ?? null })), stats: this.stats }
  }

  private async pickScope(title: string): Promise<AgentScope | undefined> {
    const p = this.paths!
    const pick = await vscode.window.showQuickPick(
      [
        { label: "项目", description: path.join(p.directory, ".opencode", "agent"), scope: "project" as const, detail: "只对当前项目生效，可随仓库提交" },
        { label: "用户", description: path.join(p.config, "agent"), scope: "user" as const, detail: "对这台机器上该用户的所有项目生效" },
      ],
      { title, placeHolder: "保存到哪个范围？" },
    )
    return pick?.scope
  }

  private async askName(title: string, scope: AgentScope, value = ""): Promise<{ name: string; file: string } | undefined> {
    const p = this.paths!
    const name = (
      await vscode.window.showInputBox({
        title,
        prompt: "Agent 名称（也是文件名）",
        value,
        validateInput: (v) => {
          const bad = validateAgentName(v)
          if (bad) return bad
          if (fs.existsSync(newAgentPath(p, scope, v.trim()))) return "该范围已有同名文件；请换一个名字或直接打开原文编辑"
          if (this.find(v.trim()) && !value) return { message: `已有同名 Agent“${v.trim()}”，新文件会覆盖它的有效定义`, severity: vscode.InputBoxValidationSeverity.Warning }
          return undefined
        },
      })
    )?.trim()
    return name ? { name, file: newAgentPath(p, scope, name) } : undefined
  }

  private async write(file: string, content: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // wx: never overwrite an existing file (e.g. created externally since the name was validated).
    fs.writeFileSync(file, content, { encoding: "utf8", flag: "wx" })
    this.log.info(`agent file created: ${path.basename(file)}`)
    await vscode.window.showTextDocument(vscode.Uri.file(file))
    await this.refresh()
  }

  async create() {
    const ro = this.writable()
    if (ro) return void vscode.window.showWarningMessage(`oco: ${ro}`)
    const scope = await this.pickScope("新建 Agent")
    if (!scope) return
    const n = await this.askName("新建 Agent", scope)
    if (!n) return
    const description = await vscode.window.showInputBox({ title: "新建 Agent", prompt: "一句话描述（主 Agent 显示在选择器里；子 Agent 由模型据此决定何时调用）", validateInput: (v) => (v.trim() ? undefined : "描述不能为空") })
    if (!description) return
    const mode = await vscode.window.showQuickPick(
      [
        { label: "primary", detail: "主 Agent：可在对话里直接选择" },
        { label: "subagent", detail: "子 Agent：由其他 Agent 调用或用 @ 提及" },
        { label: "all", detail: "两者皆可" },
      ],
      { title: "新建 Agent", placeHolder: "类型" },
    )
    if (!mode) return
    await this.write(n.file, agentFileContent({ description: description.trim(), mode: mode.label, prompt: "在这里写这个 Agent 的系统提示词。\n\n保存后执行“重新加载配置”使其生效。" }))
  }

  async duplicate(item?: AgentItem) {
    const ro = this.writable()
    if (ro) return void vscode.window.showWarningMessage(`oco: ${ro}`)
    const row = item?.row ?? (await this.pick("复制哪个 Agent？"))
    if (!row) return
    const scope = await this.pickScope(`复制 ${row.name}`)
    if (!scope) return
    const n = await this.askName(`复制 ${row.name}`, scope, `${row.name}-copy`)
    if (!n) return
    let content: string
    if (row.file) content = fs.readFileSync(row.file, "utf8") // byte-for-byte copy: comments, unknown fields, body
    else {
      const a = row.server!
      content = agentFileContent({
        description: a.description ?? `${row.name} 的副本`,
        mode: a.mode ?? "primary",
        model: modelString(a.model),
        temperature: a.temperature,
        prompt: a.prompt ?? `（${row.name} 使用服务内置提示词，接口未提供原文。在这里写新提示词；留空段落会让模型没有额外指令。）`,
      })
    }
    await this.write(n.file, content)
  }

  async openFile(item?: AgentItem) {
    const row = item?.row ?? (await this.pick("打开哪个 Agent 的原文？"))
    if (!row) return
    if (row.file) return void (await vscode.window.showTextDocument(vscode.Uri.file(row.file)))
    if (row.source === "builtin") return void vscode.window.showInformationMessage(`oco: “${row.name}”是内置 Agent，没有原文文件。可用“复制 Agent”生成可编辑的副本。`)
    const files = this.paths ? configFiles(this.paths) : []
    const hit = files.find((f) => {
      try {
        return fs.readFileSync(f, "utf8").includes(`"${row.name}"`)
      } catch {
        return false
      }
    })
    if (!hit) return void vscode.window.showInformationMessage(`oco: “${row.name}”定义在服务配置里，但本机找不到包含它的 opencode.json(c)`)
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(hit))
    const at = doc.getText().indexOf(`"${row.name}"`)
    const pos = doc.positionAt(Math.max(0, at))
    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos) })
  }

  /** Explicit, confirmed: dispose this directory's server instance so it re-reads config. Never restarts the server. */
  async reloadConfig(): Promise<boolean> {
    const dir = this.conn.directory
    if (!dir) return false
    const ok = await vscode.window.showWarningMessage(
      "重新加载该项目的 OpenCode 配置？",
      { modal: true, detail: `服务会释放 ${dir} 的实例并在下次请求时重新读取配置和 Agent。该目录中正在运行的任务可能被中止。服务进程本身不会重启，其他项目不受影响。` },
      "重新加载",
    )
    if (ok !== "重新加载") return false
    try {
      await this.conn.request("POST", "/instance/dispose")
      this.stats.reloads++
      await this.refresh()
      const pending = this.rows.filter((r) => r.state === "pending")
      if (pending.length) void vscode.window.showWarningMessage(`oco: 重新加载后仍有 ${pending.length} 个 Agent 未生效：${pending.map((r) => r.name).join("、")}。请检查文件格式（查看 oco 日志或服务日志）。`)
      else void vscode.window.showInformationMessage("oco: 配置已重新加载，Agent 列表与文件一致")
      return true
    } catch (e) {
      void vscode.window.showErrorMessage(`oco: 重新加载失败（${(e as Error).message}）`)
      return false
    }
  }

  private async pick(placeHolder: string) {
    if (!this.rows.length) await this.refresh()
    return (await vscode.window.showQuickPick(this.rows.map((r) => ({ label: r.name, description: r.mode, row: r })), { placeHolder }))?.row
  }

  dispose() {
    this.watcher?.dispose()
    this.changed.dispose()
    this.view.dispose()
  }
}
