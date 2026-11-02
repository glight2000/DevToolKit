export const launcherGroups = [
  { id: 'tools', name: '工具页面', description: 'SSH、AI 订阅、笔记、加密工具、时间工具和翻译' },
  { id: 'desktop', name: '桌面组件', description: '展开随手记、剪贴板、AI 额度和窗口速切' },
  { id: 'system', name: '系统快捷入口', description: '下载、用户文件夹和 Windows 设置' },
  { id: 'copy', name: '快速复制', description: '日期、时间、时间戳和 UUID' },
  { id: 'calculator', name: '计算器', description: '直接输入四则运算，回车复制结果' },
  { id: 'web', name: '网页搜索', description: '确认后使用默认浏览器搜索，不自动发送输入内容' }
] as const
export type LauncherGroup = typeof launcherGroups[number]['id']
export interface LauncherSettings { enabled: boolean; hideOnBlur: boolean; groups: LauncherGroup[] }
export interface LauncherState { settings: LauncherSettings; active: boolean; error: string | null }
export const defaultLauncherSettings = (): LauncherSettings => ({ enabled: false, hideOnBlur: true, groups: launcherGroups.map(group => group.id) })
export function validateLauncherPatch(value: unknown): Partial<LauncherSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid launcher settings')
  const patch = value as Record<string, unknown>
  if (Object.keys(patch).some(key => !['enabled', 'hideOnBlur', 'groups'].includes(key))) throw new Error('Unknown launcher setting')
  for (const key of ['enabled', 'hideOnBlur']) if (key in patch && typeof patch[key] !== 'boolean') throw new Error('Invalid switch value')
  if ('groups' in patch && (!Array.isArray(patch.groups) || patch.groups.length > launcherGroups.length || new Set(patch.groups).size !== patch.groups.length || patch.groups.some(id => !launcherGroups.some(group => group.id === id)))) throw new Error('Invalid shortcut group')
  return patch as Partial<LauncherSettings>
}
export interface LauncherCommand { id: string; group: LauncherGroup; title: string; detail: string; keywords: string; icon: string }
export const launcherCommands: LauncherCommand[] = [
  { id: 'page:ssh-connections', group: 'tools', title: 'SSH 连接', detail: '管理连接与终端', keywords: 'ssh terminal 远程 连接 lianjie', icon: 'terminal' },
  { id: 'page:ssh-tunnel', group: 'tools', title: 'SSH 隧道', detail: '管理端口转发', keywords: 'ssh tunnel 隧道 suidao', icon: 'terminal' },
  { id: 'page:subscriptions', group: 'tools', title: 'AI 订阅', detail: '账号、额度与会话', keywords: 'usage codex claude ai quota 额度 订阅 edu', icon: 'gauge' },
  { id: 'page:notebook', group: 'tools', title: '笔记', detail: '打开笔记文档', keywords: 'notebook note 笔记 biji', icon: 'note' },
  { id: 'page:crypto-tools', group: 'tools', title: '加密工具', detail: '编码、哈希和密码生成', keywords: 'crypto hash base64 password 密码 mima', icon: 'shield' },
  { id: 'page:time-tools', group: 'tools', title: '时间工具', detail: '时间戳与时区转换', keywords: 'time timestamp 时间 shijian', icon: 'clock' },
  { id: 'page:translation', group: 'tools', title: '翻译', detail: '打开翻译工具', keywords: 'translate translation fanyi 翻译', icon: 'language' },
  { id: 'widget:note', group: 'desktop', title: '随手记', detail: '展开桌面记事组件', keywords: 'note suishouji 记事', icon: 'note' },
  { id: 'widget:clipboard', group: 'desktop', title: '剪贴板', detail: '展开剪贴板历史', keywords: 'clipboard paste jiantieban 复制', icon: 'clipboard' },
  { id: 'widget:quota', group: 'desktop', title: '桌面额度', detail: '展开 AI 额度组件', keywords: 'usage quota edu codex claude', icon: 'gauge' },
  { id: 'switcher', group: 'desktop', title: '窗口速切', detail: '检索已经打开的窗口', keywords: 'window switch chuangkou 窗口', icon: 'window' },
  { id: 'folder:downloads', group: 'system', title: '下载文件夹', detail: '在资源管理器中打开', keywords: 'download xiazai 下载 文件夹', icon: 'folder' },
  { id: 'folder:home', group: 'system', title: '用户文件夹', detail: '在资源管理器中打开', keywords: 'home folder wenjianjia 文件夹', icon: 'folder' },
  { id: 'system:settings', group: 'system', title: 'Windows 设置', detail: '打开系统设置', keywords: 'settings windows shezhi 设置', icon: 'settings' },
  { id: 'copy:date', group: 'copy', title: '复制当前日期', detail: 'YYYY-MM-DD', keywords: 'copy date riqi 日期', icon: 'clock' },
  { id: 'copy:time', group: 'copy', title: '复制当前时间', detail: 'HH:mm:ss', keywords: 'copy time shijian 时间', icon: 'clock' },
  { id: 'copy:timestamp', group: 'copy', title: '复制时间戳', detail: 'Unix 秒级时间戳', keywords: 'copy timestamp shijianchuo 时间戳', icon: 'clock' },
  { id: 'copy:uuid', group: 'copy', title: '生成并复制 UUID', detail: '生成一个新的 UUID', keywords: 'uuid guid random 随机', icon: 'copy' }
]
export function searchLauncher(query: string, groups: LauncherGroup[]): LauncherCommand[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return launcherCommands.filter(command => groups.includes(command.group) && terms.every(term => `${command.title} ${command.detail} ${command.keywords}`.toLocaleLowerCase().includes(term)))
}
// Bounded recursive descent: never evaluate JavaScript or execute user input.
export function calculate(input: string): string | undefined {
  const source = input.trim().replace(/^=\s*/, '').replaceAll('×', '*').replaceAll('÷', '/')
  if (!source || source.length > 256 || !/^[\d\s.+\-*/()%]+$/.test(source)) return
  const tokens = source.match(/\d+(?:\.\d*)?|\.\d+|[^\s]/g) ?? []
  let position = 0, depth = 0
  const primary = (): number => {
    if (++depth > 32) throw new Error('Too deep')
    const token = tokens[position++]
    let result: number
    if (token === '+' || token === '-') result = (token === '-' ? -1 : 1) * primary()
    else if (token === '(') { result = expression(); if (tokens[position++] !== ')') throw new Error('Missing parenthesis') }
    else { if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new Error('Expected number'); result = Number(token) }
    if (tokens[position] === '%') { position++; result /= 100 }
    depth--; return result
  }
  const product = (): number => { let result = primary(); while (tokens[position] === '*' || tokens[position] === '/') { const op = tokens[position++], right = primary(); result = op === '*' ? result * right : result / right }; return result }
  const expression = (): number => { let result = product(); while (tokens[position] === '+' || tokens[position] === '-') { const op = tokens[position++], right = product(); result = op === '+' ? result + right : result - right }; return result }
  try { const result = expression(); if (position !== tokens.length || !Number.isFinite(result)) return; return String(Number(result.toPrecision(12))) } catch { return }
}
