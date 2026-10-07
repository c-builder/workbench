import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react'
import {
  appShortcuts,
  initialArchived,
  initialArtifacts,
  initialTodos,
  ME,
  sessions as seedSessions,
  sessionSeeds,
  suggestions,
} from './data'
import { IconBoard, IconChat, IconChatPlus, IconChevron, IconChevronDown, IconClock, IconLogo, IconMenu, IconMore, IconNodes, IconPause, IconPencil, IconPlus, IconRestore, IconSend, IconShield, IconSpinner, IconTrash } from './icons'
import type {
  Artifact,
  ArtifactSource,
  BrowserTab,
  ChatMessage,
  Control,
  Domain,
  ExecBy,
  FillMap,
  FlowNode,
  LogEntry,
  Session,
  SessionStatus,
  Todo,
  WorkbenchTab,
} from './types'
import { LogPanel } from './LogPanel'
import { MarketPage } from './MarketPage'
import { downloadArtifact, execLabel, NodeStrip, nowStamp, sourceLabel, typeLabel } from './ui'

const ONBOARD_KEY = 'hengtai-onboard-v1'
const DOMAINS: Domain[] = ['报销', '采购', 'HR', '行政', '项目协作']

const APPS_HOME_URL = 'https://hengtai.internal/apps'

function normalizeUrl(raw: string) {
  const t = raw.trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  // 已有其它协议前缀（如 htt:）视为非法，不自动补全
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return ''
  return `https://${t}`
}

/** 合法应用地址：http(s) + 有效主机名（含点，或 localhost） */
function isValidAppUrl(raw: string) {
  const url = normalizeUrl(raw)
  if (!url) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname
    if (!host) return false
    if (host === 'localhost') return true
    if (!host.includes('.')) return false
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)) return false
    return true
  } catch {
    return false
  }
}

function isAppsHomeUrl(url: string) {
  try {
    const u = new URL(url)
    return u.hostname === 'hengtai.internal' && /^\/apps\/?$/.test(u.pathname)
  } catch {
    return false
  }
}

function tabMetaFromUrl(
  url: string,
  apps: { id: string; name: string; url: string }[] = [],
): { kind: BrowserTab['kind']; title: string } {
  if (isAppsHomeUrl(url)) return { kind: 'home', title: '应用中心' }
  const hit = apps.find(
    (a) => url === a.url || url.startsWith(a.url.replace(/\/$/, '') + '/') || url.startsWith(a.url),
  )
  if (hit) {
    if (hit.id === 'w3' || /w3/i.test(hit.url)) return { kind: 'w3', title: hit.name }
    if (hit.id === 'ebuy' || /ebuy/i.test(hit.url)) return { kind: 'ebuy', title: hit.name }
    return { kind: 'external', title: hit.name }
  }
  if (/w3\.internal/i.test(url)) return { kind: 'w3', title: 'W3 审批' }
  if (/ebuy\.internal/i.test(url)) return { kind: 'ebuy', title: 'eBuy' }
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return { kind: 'external', title: host || '网页' }
  } catch {
    return { kind: 'external', title: '网页' }
  }
}

function canOpenExternally(url: string) {
  return isValidAppUrl(url)
}

/** 地址栏与 Tab 是否为同一页（忽略末尾 /、主机大小写） */
function sameAppUrl(a: string, b: string) {
  const na = normalizeUrl(a)
  const nb = normalizeUrl(b)
  if (!na || !nb) return false
  try {
    const ua = new URL(na)
    const ub = new URL(nb)
    const path = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p)
    return (
      ua.protocol === ub.protocol &&
      ua.hostname.toLowerCase() === ub.hostname.toLowerCase() &&
      ua.port === ub.port &&
      path(ua.pathname) === path(ub.pathname) &&
      ua.search === ub.search &&
      ua.hash === ub.hash
    )
  } catch {
    return na === nb
  }
}

/** 应用中心不回填地址，引导用户主动输入 */
function addrBarValueForTab(tab: BrowserTab) {
  return tab.id === 'home' || tab.kind === 'home' ? '' : tab.url
}

function uid(p: string) {
  return `${p}-${Math.random().toString(36).slice(2, 8)}`
}

function isMeActor(actor: string) {
  return actor === '我' || actor === ME
}

function shortDate() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function flowBaseTitle(title: string) {
  return title.split('·')[0].trim() || title
}

/** 提交后推进节点：归档当前待办；若下一节点非本人则生成「我的申请」跟踪项 */
function advanceAfterSubmit(todo: Todo, execBy: ExecBy): { archived: Todo; followUp?: Todo; note: string } {
  const nodes = todo.flow?.nodes
  const archivedBase: Todo = { ...todo, state: 'done', execBy }
  if (!nodes?.length) {
    return { archived: archivedBase, note: '该待办已归档。' }
  }

  const curIdx = nodes.findIndex((n) => n.status === 'current')
  const idx = curIdx >= 0 ? curIdx : nodes.findIndex((n) => n.status === 'todo')
  if (idx < 0) {
    return { archived: archivedBase, note: '该待办已归档。' }
  }

  const today = shortDate()
  const advanced: FlowNode[] = nodes.map((n, i) => {
    if (i === idx) return { ...n, status: 'done', date: n.date || today }
    if (i === idx + 1) return { ...n, status: 'current' }
    return { ...n }
  })

  const archived: Todo = {
    ...archivedBase,
    flow: todo.flow ? { ...todo.flow, nodes: advanced } : undefined,
  }
  const next = advanced[idx + 1]
  if (!next) {
    return { archived, note: `「${nodes[idx].label}」已完成，流程结束并归档。` }
  }

  const base = flowBaseTitle(todo.title)
  if (isMeActor(next.actor)) {
    const followUp: Todo = {
      ...todo,
      id: uid('t'),
      title: `${base} · ${next.label}`,
      subtitle: `流转至你 · ${next.label}`,
      relation: 'mine_todo',
      state: 'pending',
      agent: true,
      execBy: undefined,
      flow: todo.flow ? { ...todo.flow, nodes: advanced } : undefined,
    }
    return {
      archived,
      followUp,
      note: `「${nodes[idx].label}」已完成，下一节点「${next.label}」仍由你处理，已回到「我的待办」。`,
    }
  }

  const followUp: Todo = {
    id: uid('t'),
    title: `${base} · ${next.label}`,
    subtitle: `我发起 · 当前处理人：${next.actor}`,
    domain: todo.domain,
    pri: todo.pri,
    due: '跟踪中',
    agent: false,
    relation: 'mine_initiated',
    state: 'pending',
    amount: todo.amount,
    app: todo.app,
    url: todo.url,
    flow: todo.flow ? { ...todo.flow, nodes: advanced } : undefined,
  }
  return {
    archived,
    followUp,
    note: `「${nodes[idx].label}」已完成，已流转至「${next.label}」（${next.actor}），已加入「我的申请」。`,
  }
}
const MODELS = [
  { id: 'hy4', name: 'Hy4 preview', brand: 'hy', free: true, cost: '0.00x' },
  { id: 'hy3', name: 'Hy3', brand: 'hy', free: true, cost: '0.00x' },
  { id: 'ds-flash', name: 'Deepseek-V4.1-Flash', brand: 'deepseek', free: true, cost: '0.00x' },
  { id: 'gpt-astra', name: 'GPT-6-Astra', brand: 'gpt', free: false, cost: '6.67x' },
  { id: 'gpt-61-sol', name: 'GPT-6.1-Sol', brand: 'gpt', free: false, cost: '1.33x' },
  { id: 'gpt-sol', name: 'GPT-6-Sol', brand: 'gpt', free: false, cost: '1.33x' },
  { id: 'gpt-luna', name: 'GPT-6-Luna', brand: 'gpt', free: false, cost: '0.07x' },
  { id: 'gpt56-sol', name: 'GPT-5.6-Sol', brand: 'gpt', free: false, cost: '3.47x' },
  { id: 'gpt56-terra', name: 'GPT-5.6-Terra', brand: 'gpt', free: false, cost: '1.39x' },
  { id: 'gpt56-luna', name: 'GPT-5.6-Luna', brand: 'gpt', free: false, cost: '0.14x' },
] as const

function ModelBrand({ brand }: { brand: (typeof MODELS)[number]['brand'] }) {
  if (brand === 'deepseek') {
  return (
      <span className="model-brand deepseek" aria-hidden>
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            fill="currentColor"
            d="M12 3c-2.8 1.6-4.6 4.2-4.6 7.2 0 2.2 1 4.2 2.6 5.6-.2.6-.4 1.4-.4 2.2 0 .8.3 1.5.8 2-.9-.2-1.7-.7-2.3-1.4C6.4 17 5.5 14.6 5.5 12 5.5 7.4 8.6 3.6 12 2.2c3.4 1.4 6.5 5.2 6.5 9.8 0 2.6-.9 5-2.6 6.6-.6.7-1.4 1.2-2.3 1.4.5-.5.8-1.2.8-2 0-.8-.2-1.6-.4-2.2 1.6-1.4 2.6-3.4 2.6-5.6C16.6 7.2 14.8 4.6 12 3Z"
          />
        </svg>
      </span>
    )
  }
  if (brand === 'hy') {
    return (
      <span className="model-brand hy" aria-hidden>
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            fill="currentColor"
            d="M12 3.2c2.4 2.1 4 5.1 4 8.3 0 1.9-.6 3.7-1.6 5.2 1.3-.4 2.4-1.3 3.1-2.5.9-1.5 1.3-3.3 1.3-5.1C18.8 5.5 15.8 2.4 12 1.5 8.2 2.4 5.2 5.5 5.2 9.1c0 1.8.4 3.6 1.3 5.1.7 1.2 1.8 2.1 3.1 2.5-1-1.5-1.6-3.3-1.6-5.2 0-3.2 1.6-6.2 4-8.3Z"
          />
        </svg>
      </span>
    )
  }
  return (
    <span className="model-brand gpt" aria-hidden>
      <svg viewBox="0 0 24 24" width="14" height="14">
        <path
          fill="currentColor"
          d="M12.4 3.2c1.1-.6 2.5-.3 3.3.7l.2.3c.5-.2 1-.2 1.5 0 1.2.5 1.8 1.8 1.4 3l-.1.2c.7.8.8 2 .3 3-.3.5-.7.8-1.2 1 .2.5.2 1 0 1.5-.5 1.2-1.8 1.8-3 1.4l-.2-.1c-.2.5-.6.9-1.1 1.1-1.1.6-2.5.3-3.3-.7l-.2-.3c-.5.2-1 .2-1.5 0-1.2-.5-1.8-1.8-1.4-3l.1-.2c-.7-.8-.8-2-.3-3 .3-.5.7-.8 1.2-1-.2-.5-.2-1 0-1.5.5-1.2 1.8-1.8 3-1.4l.2.1c.2-.5.6-.9 1.1-1.1Zm-.3 3.5c-.7.4-.9 1.2-.6 1.9l1.8 3.1c.4.7 1.2.9 1.9.6.7-.4.9-1.2.6-1.9l-1.8-3.1c-.4-.7-1.2-.9-1.9-.6Z"
        />
      </svg>
    </span>
  )
}

function sessionLiveStatus(p: {
  control: Control
  typing: boolean
  submitReady: boolean
  submitted: boolean
  batchReady: boolean
}): SessionStatus {
  if (p.control === 'agent' || p.typing) return 'running'
  if (p.control === 'paused' || (p.submitReady && !p.submitted) || p.batchReady) return 'confirm'
  return 'idle'
}

function welcome(): ChatMessage {
  return {
    id: 'm0',
    role: 'agent',
    text: `你好，${ME}。我是衡台工作助手。把待办、内网页面和产物放在右侧现场，我只做可逆操作，提交和审批交给你确认。`,
    time: '14:01:02',
  }
}

function seedMessages(id: string): ChatMessage[] {
  const extra = (sessionSeeds[id] || []).map((m, i) => ({
    id: `${id}-m${i}`,
    role: m.role,
    text: m.text,
    time: m.time,
  }))
  return [welcome(), ...extra]
}

export default function App() {
  const [bench, setBench] = useState(50)
  const [splitting, setSplitting] = useState(false)
  const drag = useRef(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const runRef = useRef(0)
  const fillKeys = useRef<string[]>([])

  const [panel, setPanel] = useState<WorkbenchTab>('flow')
  const [control, setControl] = useState<Control>('none')
  /** 全局控制权所作用的应用标签；色点只挂在此标签上 */
  const [controlTabId, setControlTabId] = useState<string | null>(null)
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [archived, setArchived] = useState<Todo[]>(initialArchived)
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'agent' | 'human' | 'mix'>('all')
  const [flowRelation, setFlowRelation] = useState<'mine' | 'initiated'>('mine')
  const [mineLens, setMineLens] = useState<'all' | 'agentable' | 'running' | 'done'>('all')
  const [initLens, setInitLens] = useState<'all' | 'running' | 'done'>('all')
  const [batchMode, setBatchMode] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [detail, setDetail] = useState<Todo | null>(null)
  const [onboard, setOnboard] = useState(() => localStorage.getItem(ONBOARD_KEY) !== '1')
  const [query, setQuery] = useState('')
  const [domainFilter, setDomainFilter] = useState<'all' | Domain>('all')
  const [sessionList, setSessionList] = useState<Session[]>(seedSessions)
  const [sessionId, setSessionId] = useState('s1')
  const [railNav, setRailNav] = useState<'assistant' | 'skills' | 'schedule'>('assistant')
  const [foldTasks, setFoldTasks] = useState(false)
  const [foldSpaces, setFoldSpaces] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null)
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null)
  const [mobilePane, setMobilePane] = useState<'chat' | 'bench'>('chat')
  const [railOpen, setRailOpen] = useState(false)
  const [inbox, setInbox] = useState<Record<string, ChatMessage[]>>({
    s1: seedMessages('s1'),
    s2: seedMessages('s2'),
    s3: seedMessages('s3'),
  })

  const messages = inbox[sessionId] || [welcome()]
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [modelId, setModelId] = useState<(typeof MODELS)[number]['id']>('ds-flash')
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [marketTab, setMarketTab] = useState<'expert' | 'skill' | 'connector'>('expert')
  const attachFileRef = useRef<HTMLInputElement>(null)
  const [composerFocused, setComposerFocused] = useState(false)
  const [phIndex, setPhIndex] = useState(0)
  const [phVisible, setPhVisible] = useState(true)
  const composerInputRef = useRef<HTMLTextAreaElement>(null)

  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 'home', title: '应用中心', url: APPS_HOME_URL, kind: 'home', controlDot: 'none' },
  ])
  const [activeTab, setActiveTab] = useState('home')
  const [urlInput, setUrlInput] = useState('')
  const [customApps, setCustomApps] = useState<{ id: string; name: string; url: string; desc: string }[]>([])
  const [addAppOpen, setAddAppOpen] = useState(false)
  const [newAppName, setNewAppName] = useState('')
  const [newAppDesc, setNewAppDesc] = useState('')
  const [newAppUrl, setNewAppUrl] = useState('https://')
  const allApps = useMemo(() => [...appShortcuts, ...customApps], [customApps])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logApp, setLogApp] = useState<'all' | string>('all')
  const [formFill, setFormFill] = useState<FillMap>({})
  const [submitReady, setSubmitReady] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [batchItems, setBatchItems] = useState<Todo[]>([])
  const [batchReady, setBatchReady] = useState(false)
  const [batchChecked, setBatchChecked] = useState<string[]>([])
  const [batchConfirm, setBatchConfirm] = useState(false)
  const [artifacts, setArtifacts] = useState<Artifact[]>(initialArtifacts)
  const [fileId, setFileId] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [artifactSource, setArtifactSource] = useState<'all' | ArtifactSource>('all')
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null)
  const [cursor, setCursor] = useState({ x: 40, y: 80, on: false })
  const msgEnd = useRef<HTMLDivElement>(null)

  const match = (t: Todo) => {
    const q = query.trim()
    const hit =
      !q ||
      t.title.includes(q) ||
      t.subtitle.includes(q) ||
      t.domain.includes(q) ||
      t.app.includes(q)
    const dom = domainFilter === 'all' || t.domain === domainFilter
    return hit && dom
  }
  const mineAll = todos.filter((t) => t.relation === 'mine_todo')
  const initiatedAll = todos.filter((t) => t.relation === 'mine_initiated')
  const mine = mineAll.filter(match)
  const initiated = initiatedAll.filter(match)
  const mineRunning = mine.filter((t) => t.state === 'running')
  const mineAgentable = mine.filter((t) => t.agent && t.state === 'pending' && t.kind !== 'simple')
  // 我的申请：他人处理中的跟踪项多为 pending，业务上均视为「处理中」
  const initRunning = initiated.filter((t) => t.state === 'pending' || t.state === 'running')
  const agentableList = mineAll.filter((t) => t.agent && t.state === 'pending' && t.kind !== 'simple')
  const agentable = agentableList.length
  const archivedMine = archived.filter((t) => t.relation !== 'mine_initiated').filter(match)
  const archivedInitiated = archived.filter((t) => t.relation === 'mine_initiated').filter(match)
  const doneMine = archivedMine.filter((t) => archiveFilter === 'all' || t.execBy === archiveFilter)
  const doneInitiated = archivedInitiated.filter((t) => archiveFilter === 'all' || t.execBy === archiveFilter)
  const doneCount = flowRelation === 'initiated' ? archivedInitiated.length : archivedMine.length
  const scopedMine =
    mineLens === 'agentable'
      ? mineAgentable
      : mineLens === 'running'
        ? mineRunning
        : mineLens === 'done'
          ? doneMine
          : mine
  const scopedInitiated =
    initLens === 'running' ? initRunning : initLens === 'done' ? doneInitiated : initiated
  const scopedTodos = flowRelation === 'initiated' ? scopedInitiated : scopedMine
  const viewingDone = flowRelation === 'mine' ? mineLens === 'done' : initLens === 'done'
  const shownLogs = logs.filter((l) => logApp === 'all' || l.app === logApp)
  const logApps = ['all', ...Array.from(new Set(logs.map((l) => l.app).filter((a): a is string => Boolean(a))))]
  const currentStatus = sessionLiveStatus({ control, typing, submitReady, submitted, batchReady })

  useEffect(() => {
    setSessionList((list) => list.map((s) => (s.id === sessionId ? { ...s, status: currentStatus } : s)))
  }, [sessionId, currentStatus])

  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  useEffect(() => {
    if (draft.trim() || suggestions.length === 0) return
    let fadeTimer: number | undefined
    const tick = window.setInterval(() => {
      setPhVisible(false)
      fadeTimer = window.setTimeout(() => {
        setPhIndex((i) => (i + 1) % suggestions.length)
        setPhVisible(true)
      }, 220)
    }, 3200)
    return () => {
      window.clearInterval(tick)
      if (fadeTimer) window.clearTimeout(fadeTimer)
    }
  }, [draft])

  useEffect(() => {
    if (!splitting) return
    const prevUserSelect = document.body.style.userSelect
    const prevCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    return () => {
      document.body.style.userSelect = prevUserSelect
      document.body.style.cursor = prevCursor
    }
  }, [splitting])

  const resizeBench = (clientX: number) => {
    const shell = shellRef.current
    if (!shell) return
    const rect = shell.getBoundingClientRect()
    const railW = 248
    const gutter = 12
    const rest = Math.max(320, rect.width - railW - gutter)
    const fromRight = rect.right - clientX
    const pct = (fromRight / rest) * 100
    setBench(Math.min(72, Math.max(28, pct)))
  }

  const onSplitterPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    drag.current = true
    setSplitting(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
  }

  const onSplitterPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    resizeBench(e.clientX)
  }

  const onSplitterPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = false
    setSplitting(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    e.currentTarget.blur()
  }

  const onSplitterKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 8 : 2
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setBench((v) => Math.min(72, v + step))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setBench((v) => Math.max(28, v - step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setBench(28)
    } else if (e.key === 'End') {
      e.preventDefault()
      setBench(72)
    }
  }

  const logHead = useRef<string | undefined>(undefined)

  const pushLog = (partial: Omit<LogEntry, 'id' | 'time'>) => {
    const id = uid('l')
    logHead.current = id
    setLogs((l) => [{ id, time: nowStamp(), ...partial }, ...l].slice(0, 80))
    return id
  }

  const say = (role: ChatMessage['role'], text: string, steps?: string[]) => {
    const msg: ChatMessage = { id: uid('m'), role, text, time: nowStamp().slice(0, 8), steps, checkpoint: logHead.current }
    setInbox((box) => ({ ...box, [sessionId]: [...(box[sessionId] || []), msg] }))
  }

  const sleep = (ms: number, token: number) =>
    new Promise<boolean>((res) => {
      setTimeout(() => res(token === runRef.current), ms)
    })

  const abortRun = () => {
    runRef.current += 1
    setCursor((c) => ({ ...c, on: false }))
  }

  const fillField = (key: string, v: string, src: string) => {
    fillKeys.current = [...fillKeys.current, key]
    setFormFill((f) => ({ ...f, [key]: { v, src } }))
    setCursor({ on: true, x: 120 + fillKeys.current.length * 18, y: 90 + fillKeys.current.length * 52 })
  }

  /** 控制权是工作台全局的；tabId 标明正在作用的应用页 */
  const setSessionControl = (c: Control, tabId?: string | null) => {
    setControl(c)
    if (c === 'none') {
      setControlTabId(null)
      return
    }
    if (tabId !== undefined && tabId !== null) setControlTabId(tabId)
    else setControlTabId((prev) => prev ?? activeTab)
  }

  const archiveTodos = (ids: string[], execBy: Todo['execBy']) => {
    const move: Todo[] = []
    setTodos((list) => {
      move.length = 0
      for (const t of list) {
        if (ids.includes(t.id)) move.push({ ...t, state: 'done', execBy })
      }
      if (!move.length) return list
      return list.filter((t) => !ids.includes(t.id))
    })
    if (move.length) setArchived((a) => [...move, ...a])
  }

  /** 提交完成：归档 + 节点流转；他人节点进入「我的申请」 */
  const completeTodosWithFlow = (ids: string[], execBy: ExecBy) => {
    const notes: string[] = []
    let addedInitiated = 0
    let addedMine = 0
    const archivedItems: Todo[] = []
    const followUps: Todo[] = []
    setTodos((list) => {
      const done = list.filter((t) => ids.includes(t.id))
      if (!done.length) return list
      const rest = list.filter((t) => !ids.includes(t.id))
      archivedItems.length = 0
      followUps.length = 0
      notes.length = 0
      addedInitiated = 0
      addedMine = 0
      for (const t of done) {
        const { archived, followUp, note } = advanceAfterSubmit(t, execBy)
        archivedItems.push(archived)
        notes.push(note)
        if (followUp) {
          followUps.push(followUp)
          if (followUp.relation === 'mine_initiated') addedInitiated += 1
          else addedMine += 1
        }
      }
      return [...followUps, ...rest]
    })
    if (archivedItems.length) {
      setArchived((a) => [...archivedItems, ...a])
    }
    if (addedInitiated) setFlowRelation('initiated')
    else if (addedMine) setFlowRelation('mine')
    return { notes, addedInitiated, addedMine }
  }

  const addArtifact = (a: Artifact) => {
    setArtifacts((list) => [a, ...list])
    setFileId(a.id)
    if (a.status !== 'generating') setPreviewOpen(true)
  }

  async function runSingleCollab(todo: Todo, fromDetail = false) {
    if (todo.relation !== 'mine_todo') {
      say('system', '该节点负责人不是你，Agent 不能代办。')
      return
    }
    if (todo.kind === 'simple') {
      say('agent', '这是普通任务，直接在卡片上勾选完成即可，不必走协同提交。')
      return
    }
    abortRun()
    const token = runRef.current
    setDetail(null)
    setActiveTodoId(todo.id)
    setSubmitted(false)
    fillKeys.current = []
    setTodos((list) => list.map((t) => (t.id === todo.id ? { ...t, state: 'running' } : t)))
    setPanel('app')
    setMobilePane('bench')
    setSubmitReady(false)
    setFormFill({})
    setCursor({ on: true, x: 80, y: 70 })
    const tab: BrowserTab = {
      id: uid('tab'),
      title: `${todo.app} · ${todo.title.split('·')[0].trim()}`,
      url: todo.url || 'https://w3.internal/todo',
      kind: 'w3-form',
      controlDot: 'agent',
    }
    setTabs((ts) => [...ts.filter((t) => t.kind !== 'w3-form'), tab])
    setActiveTab(tab.id)
    setUrlInput(tab.url)
    setSessionControl('agent', tab.id)
    say('user', fromDetail ? `对「${todo.title}」执行协同：汇总评审意见并起草结论` : `协同处理：${todo.title}`)
    setTyping(true)
    const artId = uid('f')
    addArtifact({
      id: artId,
      type: 'doc',
      name: `${todo.title.split('·')[0].trim()}处理草稿.docx`,
      sub: '生成中',
      kind: 'doc',
      source: 'agent',
      status: 'generating',
      session: sessionList.find((s) => s.id === sessionId)?.title || '当前任务',
      pages: '—',
      preview: '正在抽取上下文并起草…',
    })
    const steps: string[] = []
    const step = async (ms: number, action: string, reversible = true) => {
      if (!(await sleep(ms, token))) {
        setTyping(false)
        return false
      }
      steps.push(`${nowStamp()}  ${action}`)
      pushLog({ actor: 'agent', action, level: 'info', reversible, app: todo.app })
      return true
    }
    if (!(await step(480, `打开 ${todo.app} · ${todo.title}`))) return
    if (todo.domain === '采购' || todo.id === 't4') {
      if (!(await step(640, '从群聊抽取三位评委意见'))) return
      fillField('opinion', '张伟：PCIe 与现网 H100 兼容，有条件通过；赵磊：需补备件清单与备机方案。', '群聊')
      if (!(await step(640, '从邮件读取评分表（平均 82.6）'))) return
      fillField('score', '82.6 / 有条件通过', '邮件附件')
      if (!(await step(560, '对照评审会纪要：待补安全扫描报告'))) return
      fillField('conclusion', '建议有条件通过。前置条件：补充备件清单与安全扫描报告后再归档。', '会议纪要')
      if (!(await step(420, '预填评审结论草稿'))) return
      if (!(await step(360, '上传评分表附件（草稿）'))) return
    } else if (todo.domain === 'HR') {
      if (!(await step(560, '核验材料清单完整性'))) return
      fillField('opinion', '答辩材料结构完整，缺「项目量化结果」附件。', '材料包')
      if (!(await step(560, '对照任职资格模板'))) return
      fillField('score', '规范性 86 分 · 需补一页量化结果', '模板比对')
      if (!(await step(480, '起草审核意见'))) return
      fillField('conclusion', '建议退回补件后进入答辩安排，不建议直接驳回。', '预填')
    } else if (todo.domain === '行政') {
      if (!(await step(500, '读取会议室占用与冲突'))) return
      fillField('opinion', 'A3-12 周四 14:00 与「产品例会」重叠 30 分钟。', '行政门户')
      fillField('score', '可改 A3-08 或顺延至 14:30', '空闲检索')
      fillField('conclusion', '建议改期至 14:30，保持原会议室。', '预填')
    } else {
      if (!(await step(520, '读取报销单与发票 OCR'))) return
      fillField('amount', todo.amount || '', 'OCR')
      if (!(await step(640, '比对发票金额与单据'))) return
      fillField(
        'comment',
        todo.reviewFlags?.needReview ? `发现差异：${todo.reviewFlags.reason}` : '金额一致，建议同意。',
        '比对',
      )
      fillField('decision', todo.reviewFlags?.needReview ? '待复核' : '同意', '预填')
    }
    if (token !== runRef.current) return
    setTyping(false)
    setCursor((c) => ({ ...c, on: false }))
    setSessionControl('paused', tab.id)
    setSubmitReady(true)
    pushLog({ actor: 'agent', action: '停在提交前，等待人工确认（不可逆）', level: 'pause', reversible: false, app: todo.app })
    setArtifacts((list) =>
      list.map((a) =>
        a.id === artId
          ? { ...a, status: 'done', sub: nowStamp(), pages: '1 页', preview: steps.join('\n') }
          : a,
      ),
    )
    say('agent', `「${todo.title}」可逆步骤已完成，表单已预填。提交是不可逆操作，请你确认。`, steps)
  }

  async function runBatch(ids: string[]) {
    const items = todos.filter((t) => ids.includes(t.id) && t.relation === 'mine_todo')
    if (!items.length) return
    abortRun()
    const token = runRef.current
    setBatchMode(false)
    setPanel('app')
    setMobilePane('bench')
    setBatchReady(false)
    setBatchItems(items.map((t) => ({ ...t, state: 'running' })))
    setTodos((list) => list.map((t) => (ids.includes(t.id) ? { ...t, state: 'running' as const } : t)))
    const tab: BrowserTab = {
      id: uid('tab'),
      title: 'W3 · 批量审批',
      url: 'https://w3.internal/approve/batch',
      kind: 'w3-batch',
      controlDot: 'agent',
    }
    setTabs((ts) => [...ts.filter((t) => t.kind !== 'w3-batch'), tab])
    setActiveTab(tab.id)
    setUrlInput(tab.url)
    setSessionControl('agent', tab.id)
    say('user', `批量审批（待我审批）· ${items.length} 条`)
    setTyping(true)
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!(await sleep(560, token))) {
        setTyping(false)
        return
      }
      setCursor({ on: true, x: 90, y: 70 + i * 36 })
      const flag = it.reviewFlags?.needReview ? `标记需人工复核：${it.reviewFlags.reason}` : '比对通过，建议同意'
      pushLog({ actor: 'agent', action: `预审 ${it.subtitle} · ${flag}`, level: 'info', reversible: true, app: 'W3' })
    }
    if (token !== runRef.current) return
    setTyping(false)
    setCursor((c) => ({ ...c, on: false }))
    setSessionControl('paused', tab.id)
    setBatchReady(true)
    setBatchChecked(items.filter((t) => !t.reviewFlags?.needReview).map((t) => t.id))
    const need = items.filter((t) => t.reviewFlags?.needReview).length
    pushLog({ actor: 'agent', action: `停在批量同意提交（${items.length}）前`, level: 'pause', reversible: false, app: 'W3' })
    addArtifact({
      id: uid('f'),
      type: 'xls',
      name: '批量预审对照表.xlsx',
      sub: `${nowStamp()} · ${items.length} 条`,
      kind: 'doc',
      source: 'agent',
      status: 'done',
      session: sessionList.find((s) => s.id === sessionId)?.title || '当前任务',
      pages: '1 页',
      preview: items
        .map(
          (t) =>
            `${t.subtitle}\t${t.amount}\t${t.reviewFlags?.needReview ? '需人工复核' : '建议同意'}\t${t.reviewFlags?.reason || ''}`,
        )
        .join('\n'),
    })
    say(
      'agent',
      `${items.length} 条可直接批的预审已完成，其中 ${need} 条有差异需你判断。差异项已标红。批量提交为不可逆操作。`,
    )
  }

  async function runPageCollab() {
    abortRun()
    const token = runRef.current
    setSessionControl('agent', activeTab)
    setTyping(true)
    say('user', '把这个页面里待审批的条目核对一下')
    const acts = ['读取当前页列表', '抽取金额与发票字段', '与预算科目比对', '预填同意意见（草稿）']
    for (const a of acts) {
      if (!(await sleep(600, token))) return
      pushLog({ actor: 'agent', action: a, level: 'info', reversible: true, app: urlInput })
    }
    if (token !== runRef.current) return
    setTyping(false)
    setSessionControl('paused', activeTab)
    setSubmitReady(true)
    pushLog({ actor: 'agent', action: '停在审批提交前，等待确认', level: 'pause', reversible: false, app: urlInput })
    say('agent', '当前页核对完成。3 条金额一致，请确认是否提交。我不会代你点击审批。')
  }

  const confirmSubmit = () => {
    if (batchReady) {
      setBatchConfirm(true)
      return
    }
    doSubmit(activeTodoId ? [activeTodoId] : [])
  }

  const doSubmit = (ids: string[]) => {
    pushLog({ actor: 'human', action: ids.length > 1 ? `确认批量提交 ${ids.length} 条（不可逆）` : '确认提交（不可逆）', level: 'ok', reversible: false, app: 'W3' })
    setSessionControl('human')
    setSubmitReady(false)
    setBatchConfirm(false)
    setSubmitted(true)
    if (batchReady) {
      const { notes, addedInitiated } = completeTodosWithFlow(ids, 'mix')
      const remain = batchItems.filter((t) => !ids.includes(t.id))
      setBatchItems(remain)
      setBatchReady(remain.length > 0)
      setPicked([])
      setBatchChecked([])
      say(
        'agent',
        [
          `已批量提交 ${ids.length} 条（差异项未提交）。执行方：Agent 代办 · 人工确认。`,
          ...notes,
          addedInitiated ? `其中 ${addedInitiated} 条已进入「我的申请」跟踪。` : '',
          remain.length ? `仍留 ${remain.length} 条需你复核。` : '',
        ]
          .filter(Boolean)
          .join(''),
      )
      setPanel('flow')
    } else if (ids[0]) {
      const t = todos.find((x) => x.id === ids[0])
      const { notes, addedInitiated } = completeTodosWithFlow(ids, 'mix')
      addArtifact({
        id: uid('f'),
        type: 'doc',
        name: `${t?.title.split('·')[0].trim() || '流程'}结论.docx`,
        sub: nowStamp(),
        kind: 'doc',
        source: 'flow',
        status: 'done',
        session: sessionList.find((s) => s.id === sessionId)?.title || '当前任务',
        pages: '1 页',
        preview: `已提交。\n${notes.join('\n')}\n来源：${t?.title}`,
      })
      say(
        'agent',
        `「${t?.title}」已提交。${notes.join('')}${addedInitiated ? '可在流程活动里展开「我的申请」查看进度。' : ''}可问我「刚刚核对出的差异有哪些」。`,
      )
      setPanel('flow')
    }
    setTimeout(() => {
      setSessionControl('none')
    }, 600)
  }

  const pauseAgent = () => {
    abortRun()
    setTyping(false)
    setSessionControl('paused')
    pushLog({ actor: 'human', action: '暂停 Agent', level: 'pause', reversible: true })
    say('system', '已暂停。可接管修改，或交还 Agent 继续可逆步骤。')
  }
  const takeover = () => {
    abortRun()
    setTyping(false)
    setSessionControl('human')
    pushLog({ actor: 'human', action: '接管页面操作', level: 'info', reversible: true })
  }
  const returnAgent = () => {
    pushLog({ actor: 'human', action: '交还 Agent', level: 'info', reversible: true })
    if (submitReady || batchReady) {
      setSessionControl('paused')
      say('agent', '可逆步骤已完成，仍停在提交前。请你确认不可逆操作。')
      return
    }
    const t = todos.find((x) => x.id === activeTodoId)
    if (t) {
      runSingleCollab(t)
      return
    }
    setSessionControl('agent')
    runPageCollab()
  }

  const resetWorkbench = () => {
    abortRun()
    setTyping(false)
    setLogs([])
    logHead.current = undefined
    fillKeys.current = []
    setFormFill({})
    setSubmitReady(false)
    setSubmitted(false)
    setBatchReady(false)
    setBatchItems([])
    setSessionControl('none')
  }

  const restoreTo = (id: string, opts: { silent?: boolean; dropSelf?: boolean } = {}) => {
    const silent = opts.silent
    const dropSelf = opts.dropSelf
    const idx = logs.findIndex((l) => l.id === id)
    const target = logs[idx]
    if (idx < 0 || !target) return false
    const cut = dropSelf ? idx + 1 : idx
    if (cut <= 0) {
      if (!silent) say('system', '已经在这个检查点，没有更新的步骤可回退。')
      return false
    }
    const removed = logs.slice(0, cut)
    const kept = logs.slice(cut)
    setLogs(kept)
    if (removed.some((l) => l.actor === 'agent' && l.reversible)) {
      fillKeys.current = []
      setFormFill({})
    }
    const anchor = kept[0]
    if (anchor?.level === 'pause') {
      setSubmitReady(true)
      setSubmitted(false)
      setBatchReady(anchor.action.includes('批量'))
      setSessionControl('paused')
    } else if (removed.some((l) => l.level === 'pause' || l.action.includes('提交'))) {
      setSubmitReady(false)
      setSubmitted(false)
      setBatchReady(false)
      setSessionControl('none')
    }
    const label = dropSelf ? `撤销「${target.action}」及之后步骤` : `回退到检查点：${target.action}`
    pushLog({ actor: 'human', action: label, level: 'ok', reversible: false })
    if (!silent) {
      say(
        'system',
        dropSelf ? `已撤销「${target.action}」，之后的停提交与预填已丢掉。` : `已回退到「${target.action}」之后的步骤已丢弃。`,
      )
    }
    return true
  }

  const restoreChat = (msgId: string) => {
    const list = inbox[sessionId] || []
    const i = list.findIndex((m) => m.id === msgId)
    if (i <= 0) return
    const prev = list[i - 1]
    abortRun()
    setTyping(false)
    if (prev.checkpoint) {
      const ok = restoreTo(prev.checkpoint, { silent: true })
      if (!ok) resetWorkbench()
    } else {
      resetWorkbench()
    }
    setInbox((box) => ({ ...box, [sessionId]: list.slice(0, i) }))
  }

  const toggleSimple = (t: Todo) => {
    archiveTodos([t.id], 'human')
    say('agent', `已勾选完成「${t.title}」，记为人工执行并进入归档。`)
  }

  useEffect(() => {
    if (!taskMenuId) return
    const close = () => setTaskMenuId(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [taskMenuId])

  useEffect(() => {
    if (!modeMenuOpen) return
    const close = () => setModeMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [modeMenuOpen])

  useEffect(() => {
    if (!attachMenuOpen) return
    const close = () => setAttachMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [attachMenuOpen])

  const switchSession = (id: string) => {
    setSessionId(id)
    setEditingSessionId(null)
    setTaskMenuId(null)
    setSessionList((list) => list.map((s) => (s.id === id ? { ...s, unread: false } : s)))
  }

  const newSession = () => {
    const id = uid('s')
    const s: Session = { id, title: '新任务', time: '刚刚', status: 'idle' }
    setSessionList((list) => [s, ...list])
    setInbox((box) => ({ ...box, [id]: [welcome()] }))
    setSessionId(id)
    setRailNav('assistant')
  }

  const startRenameSession = (s: Session) => {
    setEditingSessionId(s.id)
    setEditingTitle(s.title)
  }

  const commitRenameSession = () => {
    if (!editingSessionId) return
    const next = editingTitle.trim().slice(0, 28) || '未命名任务'
    const prev = sessionList.find((s) => s.id === editingSessionId)?.title
    setSessionList((list) => list.map((s) => (s.id === editingSessionId ? { ...s, title: next } : s)))
    if (prev && prev !== next) {
      setArtifacts((list) => list.map((a) => (a.session === prev ? { ...a, session: next } : a)))
    }
    setEditingSessionId(null)
  }

  const requestDeleteSession = (id: string) => {
    setTaskMenuId(null)
    setDeleteSessionId(id)
  }

  const confirmDeleteSession = () => {
    const id = deleteSessionId
    if (!id) return
    const target = sessionList.find((s) => s.id === id)
    if (!target) {
      setDeleteSessionId(null)
      return
    }
    const rest = sessionList.filter((s) => s.id !== id)
    setSessionList(rest)
    setInbox((box) => {
      const next = { ...box }
      delete next[id]
      return next
    })
    setArtifacts((list) => list.filter((a) => a.session !== target.title))
    setEditingSessionId(null)
    setDeleteSessionId(null)
    if (sessionId === id) {
      const fallback = rest[0]
      if (fallback) setSessionId(fallback.id)
      else newSession()
    }
  }

  const send = (text?: string) => {
    const q = (text ?? draft).trim()
    if (!q) return
    setDraft('')
    const cur = sessionList.find((s) => s.id === sessionId)
    if (cur?.title === '新任务') {
      setSessionList((list) => list.map((s) => (s.id === sessionId ? { ...s, title: q.slice(0, 18) } : s)))
    }
    if (q.includes('差旅') || q.includes('报销')) {
      setPanel('flow')
      setDomainFilter('报销')
      setMineLens('all')
      say('user', q)
      const ids = todos.filter((t) => t.relation === 'mine_todo' && t.domain === '报销').map((t) => t.id)
      say('agent', `已聚合报销域待我审批 ${ids.length} 条。建议走批量预审：我比对发票与金额，有差异的标红且默认不提交，提交仍由你确认。`)
      setBatchMode(true)
      setPicked(ids)
      return
    }
    if (q.includes('供应商') || q.includes('技术评审')) {
      const t = todos.find((x) => x.id === 't4')
      if (t) runSingleCollab(t)
      else say('agent', '供应商引入的技术评审已不在你的待办中，可到归档查看。')
      return
    }
    if (q.includes('我发起') || q.includes('卡在')) {
      setPanel('flow')
      say('user', q)
      const names = todos
        .filter((t) => t.relation === 'mine_initiated')
        .map((t) => `· ${t.title}（${t.flow?.nodes.find((n) => n.status === 'current')?.actor || '他人'}）`)
      say('agent', `你发起、他人处理的流程：\n${names.join('\n') || '暂无'}\n我可以生成催办提醒，但不能代他人操作。`)
      return
    }
    if (q.includes('核对') || q.includes('当前页') || q.includes('这个页面')) {
      setPanel('app')
      setMobilePane('bench')
      runPageCollab()
      return
    }
    if (q.includes('刚刚') || q.includes('差异')) {
      say('user', q)
      const last = logs.filter((l) => l.action.includes('复核') || l.action.includes('比对') || l.action.includes('差异'))
      say(
        'agent',
        last.length
          ? `对照如下：\n${last.map((l) => `· ${l.time} ${l.action}`).join('\n')}`
          : '最近一次预审：李思远深圳拜访超预算且发票差 ¥180，其余建议同意。差异项默认不会被批量提交。',
      )
      return
    }
    say('user', q)
    say('agent', '可以从右侧「流程活动」点协同处理，或打开应用后让我处理当前页。不可逆操作我会停下来等你。')
  }

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0]
  const addrSameAsTab = sameAppUrl(urlInput, currentTab.url)
  const canGoAddress = isValidAppUrl(urlInput) && !addrSameAsTab
  const currentSessionTitle = sessionList.find((s) => s.id === sessionId)?.title || '当前任务'
  const filteredArtifacts = useMemo(
    () => artifacts.filter((a) => artifactSource === 'all' || a.source === artifactSource),
    [artifacts, artifactSource],
  )
  const artifactsBySession = useMemo(() => {
    const map = new Map<string, Artifact[]>()
    for (const a of filteredArtifacts) {
      const key = a.session || '未归类'
      const list = map.get(key)
      if (list) list.push(a)
      else map.set(key, [a])
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === currentSessionTitle) return -1
      if (b === currentSessionTitle) return 1
      return a.localeCompare(b, 'zh')
    })
    return keys.map((session) => ({ session, items: map.get(session)! }))
  }, [filteredArtifacts, currentSessionTitle])
  const file = filteredArtifacts.find((a) => a.id === fileId)

  useEffect(() => {
    if (!filteredArtifacts.length) {
      setFileId('')
      setPreviewOpen(false)
      return
    }
    if (fileId && !filteredArtifacts.some((a) => a.id === fileId)) {
      setFileId('')
      setPreviewOpen(false)
    }
  }, [filteredArtifacts, fileId])

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

  useEffect(() => {
    const el = document.querySelector('.btab[data-active-tab="1"]')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTab, tabs.length])

  const openArtifactPreview = (id: string) => {
    setFileId(id)
    setPreviewOpen(true)
  }

  const openAppTab = (a: { id: string; name: string; url: string }, source: '应用中心' | '新增应用') => {
    const kind: BrowserTab['kind'] =
      a.id === 'w3' || a.url.includes('w3') ? 'w3' : a.id === 'ebuy' || a.url.includes('ebuy') ? 'ebuy' : 'external'
    const tab: BrowserTab = {
      id: uid('tab'),
      title: a.name,
      url: a.url,
      kind,
      controlDot: 'human',
    }
    setTabs((ts) => [...ts, tab])
    setActiveTab(tab.id)
    setUrlInput(a.url)
    if (control === 'none' || control === 'human') setSessionControl('human', tab.id)
    setPanel('app')
    setMobilePane('bench')
    pushLog({ actor: 'human', action: `${source}打开 ${a.name}`, level: 'info', reversible: true, app: a.url })
  }

  /** 地址栏「前往」：内置浏览器始终新开 Tab（应用中心除外） */
  const navigateAddress = (raw: string) => {
    if (!isValidAppUrl(raw)) return
    const url = normalizeUrl(raw)
    if (!url) return
    if (sameAppUrl(url, currentTab.url)) return
    const { kind, title } = tabMetaFromUrl(url, allApps)
    setPanel('app')
    setMobilePane('bench')

    if (kind === 'home') {
      setActiveTab('home')
      setTabs((ts) =>
        ts.map((t) => (t.id === 'home' ? { ...t, url: APPS_HOME_URL, kind: 'home', title: '应用中心' } : t)),
      )
      setUrlInput('')
      pushLog({ actor: 'human', action: '内置浏览器打开应用中心', level: 'info', reversible: true, app: APPS_HOME_URL })
      return
    }

    const tab: BrowserTab = { id: uid('tab'), title, url, kind, controlDot: 'human' }
    setTabs((ts) => [...ts, tab])
    setActiveTab(tab.id)
    setUrlInput(url)
    if (control === 'none' || control === 'human') setSessionControl('human', tab.id)
    pushLog({ actor: 'human', action: `内置浏览器新开 ${title}`, level: 'info', reversible: true, app: url })
  }

  const openInExternalBrowser = (url = currentTab.url) => {
    if (!canOpenExternally(url)) return
    window.open(url, '_blank', 'noopener,noreferrer')
    pushLog({
      actor: 'human',
      action: `在外部浏览器打开 ${url}`,
      level: 'info',
      reversible: true,
      app: url,
    })
  }

  const submitNewApp = () => {
    const name = newAppName.trim()
    const desc = newAppDesc.trim() || '自定义应用'
    let url = newAppUrl.trim()
    if (!name || !url) return
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    const app = { id: uid('app'), name, url, desc }
    setCustomApps((list) => [...list, app])
    setAddAppOpen(false)
    setNewAppName('')
    setNewAppDesc('')
    setNewAppUrl('https://')
    openAppTab(app, '新增应用')
  }
  const selectFlowRelation = (id: 'mine' | 'initiated') => {
    setPanel('flow')
    setMobilePane('bench')
    setFlowRelation(id)
    if (id !== 'mine') {
      setBatchMode(false)
      setPicked([])
    }
  }

  const runOneClickAdvance = () => {
    setFlowRelation('mine')
    setMineLens('agentable')
    const list = agentableList
    if (!list.length) return
    if (list.length === 1) runSingleCollab(list[0])
    else runBatch(list.map((t) => t.id))
  }

  return (
    <div
      ref={shellRef}
      className={`app-shell mobile-${mobilePane}${railOpen ? ' rail-open' : ''}${splitting ? ' is-splitting' : ''}`}
      style={{ gridTemplateColumns: `248px minmax(0, ${100 - bench}fr) 12px minmax(0, ${bench}fr)` }}
    >
      {railOpen && <button type="button" className="rail-scrim" aria-label="关闭菜单" onClick={() => setRailOpen(false)} />}
      <aside className="rail">
        <div className="rail-brand">
          <div className="logo" title="衡台">
            <IconLogo />
        </div>
        <div>
            <b>衡台</b>
            <span>工作助手</span>
          </div>
          <button type="button" className="rail-close" onClick={() => setRailOpen(false)}>
            关闭
          </button>
        </div>
        <button
          className="new-task"
          onClick={() => {
            newSession()
            setRailOpen(false)
            setMobilePane('chat')
          }}
        >
          <IconChatPlus />
          新建任务
        </button>
        <nav className="rail-nav">
          <button
            className={railNav === 'skills' ? 'active' : ''}
            onClick={() => {
              setRailNav('skills')
              setRailOpen(false)
            }}
          >
            <IconNodes />
            专家·技能·连接器
          </button>
          <button
            className={railNav === 'schedule' ? 'active' : ''}
            onClick={() => {
              setRailNav('schedule')
              setRailOpen(false)
            }}
          >
            <IconClock />
            定时任务
          </button>
        </nav>
        <div className="rail-body">
          <button className={`task-fold ${foldTasks ? 'closed' : ''}`} onClick={() => setFoldTasks((v) => !v)}>
            <IconChevron />
            任务 ({sessionList.length})
          </button>
          {!foldTasks &&
            (sessionList.length ? (
              sessionList.map((s) => {
                const st = s.id === sessionId ? currentStatus : s.status
                const editing = editingSessionId === s.id
                return (
                  <div
                    key={s.id}
                    className={`task-item ${s.id === sessionId && railNav === 'assistant' ? 'active' : ''}`}
                  >
                    {editing ? (
                      <input
                        className="task-rename"
                        value={editingTitle}
                        autoFocus
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={commitRenameSession}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitRenameSession()
                          }
                          if (e.key === 'Escape') setEditingSessionId(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
        <button
          type="button"
                        className="task-main"
                        onClick={() => {
                          switchSession(s.id)
                          setRailNav('assistant')
                          setRailOpen(false)
                          setMobilePane('chat')
                        }}
                      >
                        <span className="task-title">{s.title}</span>
        </button>
                    )}
                    <div className="task-side">
                      {st === 'confirm' && (
                        <span className="task-badge">
                          待确认
                          <i />
                        </span>
                      )}
                      {st === 'running' && (
                        <span className="task-spin" title="进行中">
                          <IconSpinner />
                        </span>
                      )}
                      <div className={`task-actions ${taskMenuId === s.id ? 'open' : ''}`}>
                        <button
                          type="button"
                          className="task-more"
                          title="更多"
                          aria-label="更多操作"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTaskMenuId((id) => (id === s.id ? null : s.id))
                          }}
                        >
                          <IconMore />
                        </button>
                        {taskMenuId === s.id && (
                          <div className="task-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setTaskMenuId(null)
                                startRenameSession(s)
                              }}
                            >
                              <IconPencil />
                              重命名
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="danger"
                              onClick={() => {
                                requestDeleteSession(s.id)
                              }}
                            >
                              <IconTrash />
                              删除任务
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rail-muted">暂无任务</div>
            ))}
          <button className={`task-fold ${foldSpaces ? 'closed' : ''}`} onClick={() => setFoldSpaces((v) => !v)}>
            <IconChevron />
            空间 (0)
          </button>
          {!foldSpaces && <div className="rail-muted">暂无任务</div>}
        </div>
        <div className="rail-foot">
          <div className="rail-user">{ME.slice(0, 1)}</div>
          <div>
            <b>{ME}</b>
            <span>待办人</span>
          </div>
        </div>
      </aside>

      <section className="chat">
        <header className="chat-head">
          <button type="button" className="mobile-icon" aria-label="打开任务列表" onClick={() => setRailOpen(true)}>
            <IconMenu />
          </button>
          <div className="chat-head-main">
            <h1>{sessionList.find((s) => s.id === sessionId)?.title || '衡台 · 人机协同工作台'}</h1>
          </div>
        </header>
        <div className="messages">
              {messages.map((m, i) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <div className="bubble">
                {m.text}
                {m.steps && (
                  <div className="steps">
                    {m.steps.map((s) => (
                      <div key={s} className="step">
                        {s}
                      </div>
                    ))}
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setPanel('app')
                        setMobilePane('bench')
                      }}
                    >
                      去工作台确认
                    </button>
                  </div>
                )}
              </div>
              <div className="msg-meta">
                <span>{m.role === 'user' ? ME : m.role === 'agent' ? '衡台 Agent' : ''} · {m.time}</span>
                {m.role !== 'system' && i > 0 && (
                  <button type="button" className="msg-restore" title="撤销到这条之前，现场一并回退" onClick={() => restoreChat(m.id)}>
                    <IconRestore />
                  </button>
                )}
              </div>
            </div>
          ))}
          {typing && (
            <div className="msg agent">
              <div className="bubble typing">正在工作台操作…</div>
            </div>
          )}
          <div ref={msgEnd} />
        </div>
        <div className="composer">
          <div className="composer-box">
            <div className={`composer-field${draft.trim() ? ' filled' : ''}${composerFocused ? ' focused' : ''}`}>
              <textarea
                ref={composerInputRef}
                rows={3}
                aria-label="任务输入"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setComposerFocused(true)}
                onBlur={() => setComposerFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (control !== 'agent') send()
                  }
                }}
              />
              {!draft.trim() && (
                <div
                  className="composer-ph"
                  aria-hidden
                  onClick={() => composerInputRef.current?.focus()}
                >
                  <div className={`composer-ph-title${composerFocused ? ' is-hidden' : ''}`}>
                    今天帮你做些什么？
                  </div>
                  <button
                    type="button"
                    className={`composer-ph-item${phVisible ? ' is-on' : ''}`}
                    tabIndex={-1}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const s = suggestions[phIndex]
                      if (!s) return
                      setDraft(s)
                      requestAnimationFrame(() => composerInputRef.current?.focus())
                    }}
                  >
                    {suggestions[phIndex]}
                  </button>
                </div>
              )}
            </div>
            <div className="composer-toolbar">
              <div className="composer-tools">
                <div className="attach-wrap">
                  <button
                    type="button"
                    className="tool-icon"
                    title="可添加文件、专家、技能、连接器"
                    aria-label="可添加文件、专家、技能、连接器"
                    aria-expanded={attachMenuOpen}
                    onClick={(e) => {
                      e.stopPropagation()
                      setAttachMenuOpen((v) => !v)
                      setModeMenuOpen(false)
                    }}
                  >
                    <IconPlus />
                  </button>
                  <input
                    ref={attachFileRef}
                    type="file"
                    className="attach-file-input"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      e.target.value = ''
                      if (!files.length) return
                      const session = sessionList.find((s) => s.id === sessionId)?.title || '当前任务'
                      const added = files.map((f) => {
                        const ext = (f.name.split('.').pop() || 'doc').toLowerCase()
                        const type = (['xls', 'xlsx', 'csv'].includes(ext)
                          ? 'xls'
                          : ['ppt', 'pptx'].includes(ext)
                            ? 'ppt'
                            : ['html', 'htm'].includes(ext)
                              ? 'html'
                              : 'doc') as Artifact['type']
                        return {
                          id: uid('f'),
                          type,
                          name: f.name,
                          sub: `刚刚 · ${(f.size / 1024).toFixed(1)} KB`,
                          kind: (type === 'html' ? 'code' : 'doc') as Artifact['kind'],
                          source: 'local' as const,
                          status: 'done' as const,
                          session,
                          pages: '1 页',
                          preview: `本地上传：${f.name}\n大小 ${(f.size / 1024).toFixed(1)} KB\n已关联到当前任务，可在「产物与文件」中查看。`,
                        }
                      })
                      setArtifacts((list) => [...added, ...list])
                      openArtifactPreview(added[0].id)
                      setPanel('files')
                      setArtifactSource('all')
                      setMobilePane('bench')
                      say('user', `添加文件：${files.map((f) => f.name).join('、')}`)
                      say('agent', `已把 ${files.length} 个文件加入当前任务的「产物与文件」。`)
                    }}
                  />
                  {attachMenuOpen && (
                    <div className="attach-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                      {(
                        [
                          ['file', '文件', '上传到当前任务产物'],
                          ['expert', '专家', '启用专家能力'],
                          ['skill', '技能', '调用可复用技能'],
                          ['connector', '连接器', '接入上下文来源'],
                        ] as const
                      ).map(([id, label, tip]) => (
                        <button
                          key={id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setAttachMenuOpen(false)
                            if (id === 'file') {
                              attachFileRef.current?.click()
                              return
                            }
                            setMarketTab(id)
                            setRailNav('skills')
                            setRailOpen(false)
                          }}
                        >
                          <b>{label}</b>
                          <em>{tip}</em>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" className="tool-pill" title="权限策略">
                  <IconShield />
                  <span>默认权限</span>
                  <IconChevronDown />
                </button>
              </div>
              <div className="composer-tools">
                {(typing || control === 'agent') && (
                  <span className="tool-spin" title="Agent 工作中">
                    <IconSpinner />
                  </span>
                )}
                <div className="mode-wrap">
                  <button
                    type="button"
                    className="tool-pill mode-pill"
                    title="选择大模型"
                    onClick={(e) => {
                      e.stopPropagation()
                      setModeMenuOpen((v) => !v)
                    }}
                  >
                    <ModelBrand brand={MODELS.find((m) => m.id === modelId)?.brand || 'deepseek'} />
                    <span className="model-trigger-name">
                      {MODELS.find((m) => m.id === modelId)?.name || 'Deepseek-V4.1-Flash'}
                    </span>
                    <IconChevronDown />
                  </button>
                  {modeMenuOpen && (
                    <div className="mode-menu model-menu" role="listbox" onClick={(e) => e.stopPropagation()}>
                      <div className="model-menu-list">
                        {MODELS.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={modelId === m.id ? 'on' : ''}
                            role="option"
                            aria-selected={modelId === m.id}
                            onClick={() => {
                              setModelId(m.id)
                              setModeMenuOpen(false)
                            }}
                          >
                            <ModelBrand brand={m.brand} />
                            <span className="model-name">{m.name}</span>
                            {m.free && <span className="model-free">Free now</span>}
                            <span className="model-cost">{m.cost}</span>
                            {modelId === m.id && <i className="mode-check">✓</i>}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="model-menu-foot"
                        onClick={() => {
                          setModeMenuOpen(false)
                          say('agent', '自定义模型配置入口已预留，当前可直接切换上方模型列表。')
                        }}
                      >
                        <IconPencil />
                        配置自定义模型
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`send-round ${control === 'agent' ? 'stop' : ''}`}
                  onClick={() => (control === 'agent' ? pauseAgent() : send())}
                  disabled={control !== 'agent' && !draft.trim()}
                  title={control === 'agent' ? '停止 Agent' : '发送'}
                >
                  {control === 'agent' ? <IconPause /> : <IconSend />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div
        className={`splitter${splitting ? ' is-active' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整对话与工作台宽度"
        aria-valuenow={Math.round(bench)}
        aria-valuemin={28}
        aria-valuemax={72}
        aria-valuetext={`工作台占 ${Math.round(bench)}%`}
        tabIndex={0}
        onPointerDown={onSplitterPointerDown}
        onPointerMove={onSplitterPointerMove}
        onPointerUp={onSplitterPointerUp}
        onPointerCancel={onSplitterPointerUp}
        onKeyDown={onSplitterKeyDown}
        onDoubleClick={() => setBench(50)}
      >
        <span className="splitter-line" aria-hidden />
        <span className="splitter-grip" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>

      <aside className="bench">
        <div className="bench-head">
          <button type="button" className="mobile-icon bench-menu" aria-label="打开任务列表" onClick={() => setRailOpen(true)}>
            <IconMenu />
          </button>
          <div className="tabs">
            {(
              [
                ['flow', '流程活动', mineAll.length, '待我处理的流程待办'],
                [
                  'app',
                  '应用',
                  tabs.filter((t) => t.id !== 'home' && t.kind !== 'home').length,
                  '已打开的应用标签（不含应用中心）',
                ],
                ['files', '产物与文件', artifacts.length, '当前可见产物数量'],
              ] as const
            ).map(([id, label, count, tip]) => (
              <button
                key={id}
                type="button"
                className={`tab ${panel === id ? 'active' : ''}`}
                title={tip}
                onClick={() => {
                  setPanel(id)
                  setMobilePane('bench')
                }}
              >
                {label}
                {!(id === 'app' && count === 0) && <span className="count">{count}</span>}
              </button>
            ))}
        </div>
        </div>
        {control !== 'none' && (
          <div className={`control-strip ${control}`} title="工作台全局控制权：同时只有一方在操作现场">
            <div className="control-strip-main">
              <i className="control-dot" />
              <div className="control-strip-copy">
                <strong>
                  {{
                    agent: 'Agent 操作中',
                    human: '你在操作',
                    paused: '已暂停，等待确认',
                    none: '',
                  }[control]}
                </strong>
                {(control === 'agent' || control === 'paused' || control === 'human') && controlTabId && (
                  <span>{tabs.find((t) => t.id === controlTabId)?.title || '当前应用'}</span>
                )}
              </div>
            </div>
            {control === 'agent' && (
              <div className="ctrl-actions">
                <button type="button" className="btn" onClick={pauseAgent}>
                  暂停
                </button>
                <button type="button" className="btn" onClick={takeover}>
                  我接管
                </button>
              </div>
            )}
            {control === 'paused' && (
              <div className="ctrl-actions">
                <button type="button" className="btn" onClick={takeover}>
                  我接管修改
                </button>
              </div>
            )}
            {control === 'human' && (
              <div className="ctrl-actions">
                <button type="button" className="btn primary" onClick={returnAgent}>
                  交还 Agent
                </button>
              </div>
            )}
          </div>
        )}

        <div className="bench-body">
          {panel === 'flow' && (
            <div className="flow-panel">
              <div className="flow-console">
                <div className="flow-console-card">
                  <div className="scope-segment" role="tablist" aria-label="责任归属">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={flowRelation === 'mine'}
                      className={flowRelation === 'mine' ? 'on' : ''}
                      onClick={() => selectFlowRelation('mine')}
                    >
                      我的待办
                      <span className="scope-count">{mineAll.length}</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={flowRelation === 'initiated'}
                      className={flowRelation === 'initiated' ? 'on' : ''}
                      onClick={() => selectFlowRelation('initiated')}
                    >
                      我的申请
                      <span className="scope-count">{initiatedAll.length}</span>
                    </button>
                  </div>
                  <div className="flow-query-row">
                    <input
                      className="search flow-search"
                      placeholder={
                        flowRelation === 'mine' ? '搜索待办名称或应用' : '搜索申请名称或应用'
                      }
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <label className="domain-select-wrap">
                      <span className="sr-only">业务分类</span>
                      <select
                        className="domain-select"
                        value={domainFilter}
                        onChange={(e) => setDomainFilter(e.target.value as 'all' | Domain)}
                        aria-label="业务分类"
                      >
                        <option value="all">全部业务</option>
                        {DOMAINS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flow-meta-row">
                    <div
                      className="lens-segment"
                      role="radiogroup"
                      aria-label={flowRelation === 'mine' ? '待办视角' : '申请视角'}
                    >
                      {flowRelation === 'mine'
                        ? (
                            [
                              ['all', '全部', mine.length, true],
                              ['running', '进行中', mineRunning.length, mineRunning.length > 0],
                              ['agentable', '可推进', mineAgentable.length, mineAgentable.length > 0],
                              ['done', '已完成', doneCount, doneCount > 0],
                            ] as const
                          )
                            .filter(([id, , , enabled]) => enabled || mineLens === id)
                            .map(([id, label, n]) => (
                              <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={mineLens === id}
                                className={mineLens === id ? 'on' : ''}
                                onClick={() => {
                                  setMineLens(id)
                                  if (id === 'done') setBatchMode(false)
                                }}
                              >
                                {label}
                                <em>{n}</em>
                              </button>
                            ))
                        : (
                            [
                              ['all', '全部', initiated.length, true],
                              ['running', '处理中', initRunning.length, initRunning.length > 0],
                              ['done', '已完成', doneCount, doneCount > 0],
                            ] as const
                          )
                            .filter(([id, , , enabled]) => enabled || initLens === id)
                            .map(([id, label, n]) => (
                              <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={initLens === id}
                                className={initLens === id ? 'on' : ''}
                                onClick={() => setInitLens(id)}
                              >
                                {label}
                                <em>{n}</em>
                              </button>
                            ))}
                    </div>
                    {flowRelation === 'mine' && !viewingDone ? (
                      <div className="flow-actions">
                        <button
                          type="button"
                          className={`btn flow-batch-btn${batchMode ? ' on' : ''}`}
                          onClick={() => {
                            setBatchMode((v) => !v)
                            setPicked([])
                          }}
                        >
                          {batchMode ? '退出批量' : '批量审批'}
                        </button>
                        <button
                          type="button"
                          className="btn primary flow-advance-btn"
                          disabled={!agentable}
                          title={agentable ? `推进全部 ${agentable} 条可代办` : '暂无可代办事项'}
                          onClick={runOneClickAdvance}
                        >
                          一键推进{agentable ? ` ${agentable}` : ''}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {viewingDone && (
                    <div className="flow-filters flow-filters-exec" role="radiogroup" aria-label="按执行方式筛选">
                      {(['all', 'agent', 'human', 'mix'] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={archiveFilter === k}
                          className={`chip ${archiveFilter === k ? 'on' : ''}`}
                          onClick={() => setArchiveFilter(k)}
                        >
                          {k === 'all' ? '全部执行方' : execLabel(k)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {batchMode && flowRelation === 'mine' && !viewingDone && (
                <div className="batch-bar">
                  <span className="hint">已选 {picked.length} 条，仅待我审批可勾选</span>
                  <button className="btn primary" disabled={picked.length < 2} onClick={() => runBatch(picked)}>
                    确认批量审批（{picked.length}）
                  </button>
                </div>
              )}

              {!scopedTodos.length ? (
                <div className="empty-scope">
                  {viewingDone
                    ? '当前筛选下没有已完成事项。'
                    : flowRelation === 'initiated'
                      ? initLens === 'running'
                        ? '当前没有处理中的申请。'
                        : '当前没有我发起、他人处理中的申请。'
                      : mineLens === 'running'
                        ? '当前没有进行中的待办。'
                        : mineLens === 'agentable'
                          ? '当前没有 Agent 可推进的待办。'
                          : '当前没有待办。'}
                </div>
              ) : viewingDone ? (
                scopedTodos.map((t) => (
                  <div key={t.id} className="card" onClick={() => setDetail(t)}>
                    <h3>{t.title}</h3>
                    <div className="meta">{t.subtitle}</div>
                    <div className="badges">
                      <span className="badge">{execLabel(t.execBy)}</span>
                      <span className="badge">{t.domain}</span>
                      {t.app && <span className="badge">{t.app}</span>}
                    </div>
                  </div>
                ))
              ) : flowRelation === 'mine' ? (
                DOMAINS.map((d) => {
                  const rows = scopedTodos.filter((t) => t.domain === d)
                  if (!rows.length) return null
                  return (
                    <div key={d}>
                      <div className="domain-h">
                        {d} · {rows.length}
                      </div>
                      {rows.map((t) => (
                        <TodoCard
                          key={t.id}
                          t={t}
                          batchMode={batchMode && t.kind !== 'simple'}
                          checked={picked.includes(t.id)}
                          onCheck={(on) => setPicked((p) => (on ? [...p, t.id] : p.filter((i) => i !== t.id)))}
                          onOpen={() => setDetail(t)}
                          onCollab={() => runSingleCollab(t)}
                          onToggle={() => toggleSimple(t)}
                        />
                      ))}
                    </div>
                  )
                })
              ) : (
                scopedTodos.map((t) => (
                  <TodoCard
                    key={t.id}
                    t={t}
                    onOpen={() => setDetail(t)}
                    onNudge={() =>
                      say(
                        'agent',
                        `已生成催办提醒给「${t.flow?.nodes.find((n) => n.status === 'current')?.actor}」，不会代为处理该节点。`,
                      )
                    }
                  />
                ))
              )}
            </div>
          )}

          {panel === 'app' && (
            <div className="browser">
              <div className="tabstrip">
                {tabs.map((t) => (
                  <div
                    key={t.id}
                    className={`btab ${t.id === activeTab ? 'active' : ''}`}
                    data-active-tab={t.id === activeTab ? '1' : undefined}
                  >
                    <button
                      type="button"
                      className="btab-label"
                      title={t.title}
                      onClick={() => {
                        setActiveTab(t.id)
                        setUrlInput(addrBarValueForTab(t))
                      }}
                    >
                      {t.id === controlTabId && (control === 'agent' || control === 'paused') && (
                        <span
                          className={`cdot ${control}`}
                          title={control === 'agent' ? 'Agent 操作中' : '已暂停，待确认'}
                        />
                      )}
                      <span className="btab-title">{t.title}</span>
                    </button>
                    {t.id !== 'home' && (
                      <button
                        type="button"
                        className="x"
                        aria-label={`关闭 ${t.title}`}
                        onClick={() => {
                          const next = tabs.filter((x) => x.id !== t.id)
                          setTabs(next)
                          if (activeTab === t.id) {
                            setActiveTab(next[0].id)
                            setUrlInput(addrBarValueForTab(next[0]))
                          }
                          if (controlTabId === t.id) {
                            if (control === 'agent' || control === 'paused') setSessionControl(control, next[0].id)
                            else setControlTabId(null)
                          }
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="browser-chrome">
                <form
                  className="addr-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!canGoAddress) return
                    navigateAddress(urlInput)
                  }}
                >
                  <label className="sr-only" htmlFor="browser-addr">
                    应用地址
                  </label>
                  <input
                    id="browser-addr"
                    className={`addr-input${urlInput.trim() && !isValidAppUrl(urlInput) ? ' invalid' : ''}`}
                    value={urlInput}
                    placeholder="请输入应用地址，例如 https://w3.internal/todo"
                    spellCheck={false}
                    aria-invalid={Boolean(urlInput.trim() && !isValidAppUrl(urlInput))}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onFocus={(e) => {
                      if (e.target.value) e.target.select()
                    }}
                  />
                  <button
                    type="submit"
                    className="btn primary addr-go"
                    disabled={!canGoAddress}
                    title={
                      !isValidAppUrl(urlInput)
                        ? '请输入合法的 http(s) 应用地址'
                        : addrSameAsTab
                          ? '当前页已是该地址'
                          : '在内置浏览器中新开标签页'
                    }
                  >
                    前往
                  </button>
                </form>
                <button
                  type="button"
                  className="btn addr-ext"
                  disabled={!isValidAppUrl(urlInput)}
                  title={
                    isValidAppUrl(urlInput)
                      ? '用系统默认浏览器打开（离开工作台）'
                      : '请输入合法的 http(s) 应用地址'
                  }
                  onClick={() => openInExternalBrowser(normalizeUrl(urlInput))}
                >
                  在外部浏览器打开
                </button>
              </div>
              <div className="page">
                {cursor.on && control === 'agent' && (
                  <div className="agent-cursor" style={{ left: cursor.x, top: cursor.y }} />
                )}
                {currentTab.kind === 'home' && (
                  <div className="mock-app">
                    <div className="home-head">
                      <div>
                        <h2>应用中心</h2>
                        <p className="hint">点选应用打开；进入后控制权默认归你，可再交给 Agent 处理当前页。</p>
                      </div>
                      <button className="btn" onClick={() => setAddAppOpen(true)}>
                        <IconPlus /> 新增应用
                      </button>
                    </div>
                    <div className="home-apps">
                      {allApps.map((a) => (
                        <button key={a.id} className="app-tile" onClick={() => openAppTab(a, '应用中心')}>
                          <b>{a.name}</b>
                          <span>{a.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {currentTab.kind === 'w3' && (
                  <W3List todos={mine} onOpen={(t) => runSingleCollab(t)} />
                )}
                {currentTab.kind === 'w3-form' && (
                  <W3Form
                    todo={todos.find((t) => t.id === activeTodoId) || archived.find((t) => t.id === activeTodoId)}
                    fill={formFill}
                    ready={submitReady}
                    submitted={submitted}
                    human={control === 'human'}
                    onSubmit={confirmSubmit}
                    onEdit={(key, v) => {
                      if (control !== 'human') return
                      setFormFill((f) => ({ ...f, [key]: { v, src: '你修改' } }))
                    }}
                  />
                )}
                {currentTab.kind === 'w3-batch' && (
                  <W3Batch
                    items={batchItems}
                    ready={batchReady}
                    checked={batchChecked}
                    onCheck={(id, on) => setBatchChecked((p) => (on ? [...p, id] : p.filter((x) => x !== id)))}
                    onSubmit={confirmSubmit}
                  />
                )}
                {currentTab.kind === 'ebuy' && (
                  <div className="mock-app">
                    <div className="w3-bar">
                      <span>eBuy 采购</span>
                      <span>控制权：{control}</span>
                    </div>
                    <h2>供应商引入订单 INTRO-7710</h2>
                    <p className="hint">当前节点：法务审核（法务部）。这不是你的待办，Agent 不可代办。</p>
                  </div>
                )}
                {currentTab.kind === 'html' && (
                  <div className="mock-app">
                    <h2>产物预览（应用内打开）</h2>
                    <div className="preview-paper" dangerouslySetInnerHTML={{ __html: currentTab.html || '' }} />
                  </div>
                )}
                {currentTab.kind === 'external' && (
                  <div className="placeholder">
                    <h3>已在内置浏览器打开</h3>
                    <p>
                      内网站点在工作台内以安全占位页呈现现场。需要时可改用系统浏览器，或在对话里让 Agent
                      处理当前页。
                    </p>
                    <p>
                      <code>{currentTab.url}</code>
                    </p>
                    {canOpenExternally(currentTab.url) && (
                      <button type="button" className="btn" onClick={() => openInExternalBrowser(currentTab.url)}>
                        改用外部浏览器打开
                      </button>
                    )}
                  </div>
                )}
              </div>
              {logs.length > 0 && (
                <LogPanel
                  logs={shownLogs}
                  apps={logApps}
                  filter={logApp}
                  onFilter={setLogApp}
                  onRestore={(id, dropSelf) => restoreTo(id, { dropSelf })}
                />
              )}
            </div>
          )}

          {panel === 'files' && (
            <div className="files">
              <div className="file-list">
                <div className="file-filters">
                  {(
                    [
                      ['all', '全部', '全部会话下的产物', artifacts.length],
                      [
                        'agent',
                        'Agent 产物',
                        'Agent 在协同处理流程时自动生成的文件',
                        artifacts.filter((a) => a.source === 'agent').length,
                      ],
                      [
                        'dialogue',
                        '对话产物',
                        '对话中生成或导出的文件',
                        artifacts.filter((a) => a.source === 'dialogue').length,
                      ],
                      [
                        'flow',
                        '流程产物',
                        '流程节点完成后沉淀的业务文件',
                        artifacts.filter((a) => a.source === 'flow').length,
                      ],
                      [
                        'local',
                        '我添加的',
                        '你手动上传或添加的本地文件',
                        artifacts.filter((a) => a.source === 'local').length,
                      ],
                    ] as const
                  ).map(([id, label, hint, n]) => (
                    <button
                      key={id}
                      type="button"
                      className={`btn ${artifactSource === id ? 'primary' : ''}`}
                      title={hint}
                      aria-label={`${label}：${hint}`}
                      onClick={() => setArtifactSource(id)}
                    >
                      {label}
                      <em className="filter-count">{n}</em>
                    </button>
                  ))}
                </div>
                {!filteredArtifacts.length ? (
                  <div className="rail-empty" style={{ padding: '28px 8px' }}>
                    <b>暂无产物</b>
                    <p>协同处理、对话生成、流程完成或本地上传后，文件会按会话归档出现在这里。</p>
                  </div>
                ) : (
                  artifactsBySession.map(({ session, items }) => (
                    <div key={session} className="file-group">
                      <div className="section-h section-h-inline">
                        <span>{session}</span>
                        <span className="section-count">{items.length}</span>
                        {session === currentSessionTitle && <span className="session-tag">当前</span>}
                      </div>
                      {items.map((a) => (
                        <div
                          key={a.id}
                          className={`file-row ${previewOpen && file?.id === a.id ? 'active' : ''} ${a.status === 'generating' ? 'gen' : ''}`}
                        >
                          <button type="button" className="file-item" onClick={() => openArtifactPreview(a.id)}>
                            <b>
                              <span className="file-type">{typeLabel(a.type)}</span>
                              {a.name}
                            </b>
                            <span className="file-meta">
                              <i className={`file-src ${a.source}`}>{sourceLabel(a.source)}</i>
                              {a.status === 'generating' ? '生成中' : a.sub}
                              {a.pages ? ` · ${a.pages}` : ''}
                            </span>
                          </button>
                          {a.status !== 'generating' && (
                            <div className="file-row-actions">
                              <button type="button" className="file-act" onClick={() => openArtifactPreview(a.id)}>
                                预览
                              </button>
                              <button type="button" className="file-act" onClick={() => downloadArtifact(a)}>
                                下载
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
              <div
                className={`preview-drawer${previewOpen && file ? ' open' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label={file ? `预览 ${file.name}` : '产物预览'}
                aria-hidden={!previewOpen || !file}
              >
                {file && (
                  <>
                    <div className="preview-head">
                      <button
                        type="button"
                        className="preview-back"
                        onClick={() => setPreviewOpen(false)}
                        aria-label="关闭预览"
                      >
                        <IconChevron />
                        返回列表
                      </button>
                      <h3>{file.name}</h3>
                      <div className="preview-head-actions">
                        {file.type === 'html' && file.status !== 'generating' && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              const tab: BrowserTab = {
                                id: uid('tab'),
                                title: file.name,
                                url: `https://hengtai.internal/artifact/${file.id}`,
                                kind: 'html',
                                html: file.preview,
                                controlDot: 'human',
                              }
                              setTabs((ts) => [...ts, tab])
                              setActiveTab(tab.id)
                              setUrlInput(tab.url)
                              setPanel('app')
                              setMobilePane('bench')
                              setPreviewOpen(false)
                              if (control === 'none' || control === 'human') setSessionControl('human', tab.id)
                              say('agent', `已在应用面板打开 ${file.name}，控制权归你。`)
                            }}
                          >
                            在应用中打开
                          </button>
                        )}
                        {file.status !== 'generating' && (
                          <button type="button" className="btn" onClick={() => downloadArtifact(file)}>
                            下载
                          </button>
                        )}
                        <button
                          type="button"
                          className="sheet-close"
                          aria-label="关闭"
                          onClick={() => setPreviewOpen(false)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="preview-drawer-body">
                      <ArtifactPreview artifact={file} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="主区域切换">
        <button
          type="button"
          className={mobilePane === 'chat' ? 'on' : ''}
          onClick={() => setMobilePane('chat')}
        >
          <IconChat />
          <span>对话</span>
        </button>
        <button
          type="button"
          className={mobilePane === 'bench' ? 'on' : ''}
          onClick={() => setMobilePane('bench')}
        >
          <IconBoard />
          <span>工作台</span>
          {currentStatus === 'confirm' && <i className="mobile-nav-dot" title="待你确认" />}
          {currentStatus === 'running' && <i className="mobile-nav-dot run" title="进行中" />}
        </button>
      </nav>

      {railNav === 'skills' && (
        <div className="market-layer">
          <MarketPage
            key={marketTab}
            initialTab={marketTab}
            onUse={(title) => {
              setRailNav('assistant')
              say('user', `启用「${title}」`)
              say(
                'agent',
                `已把「${title}」加入当前任务。专家 / 技能 / 连接器提供可复用能力，不会代替应用中心里的 W3、eBuy 等应用。处理待办仍从右侧流程活动或应用进入。`,
              )
            }}
          />
        </div>
      )}
      {railNav === 'schedule' && (
        <div className="market-layer">
          <section className="market">
            <header className="market-bar">
              <h2 className="market-title">定时任务</h2>
            </header>
            <div className="rail-empty" style={{ minHeight: '60vh' }}>
              <b>暂无定时任务</b>
              <p>把重复的待办预审设为每日提醒后，会显示在这里。</p>
        </div>
      </section>
        </div>
      )}

      {deleteSessionId && (
        <div className="overlay" onClick={() => setDeleteSessionId(null)}>
          <div className="confirm-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="del-task-title">
            <h2 id="del-task-title">删除任务</h2>
            <p>
              确定删除「{sessionList.find((s) => s.id === deleteSessionId)?.title || '该任务'}」？
              <br />
              对话与该任务产物也会一并移除，且不可恢复。
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn" onClick={() => setDeleteSessionId(null)}>
                取消
              </button>
              <button type="button" className="btn danger" onClick={confirmDeleteSession}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {addAppOpen && (
        <div className="overlay" onClick={() => setAddAppOpen(false)}>
          <div className="sheet add-app-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div>
                <h2>新增应用</h2>
                <div className="hint">添加到应用中心并打开为标签页</div>
              </div>
              <button type="button" className="sheet-close" aria-label="关闭" onClick={() => setAddAppOpen(false)}>
                ×
              </button>
            </div>
            <div className="form" style={{ marginTop: 12 }}>
              <div className="field">
                <label>应用名称</label>
                <input
                  className="val"
                  value={newAppName}
                  placeholder="例如：费控报销"
                  onChange={(e) => setNewAppName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="field">
                <label>简介</label>
                <input
                  className="val"
                  value={newAppDesc}
                  placeholder="例如：发票与单据"
                  onChange={(e) => setNewAppDesc(e.target.value)}
                />
              </div>
              <div className="field">
                <label>应用地址</label>
                <input
                  className="val"
                  value={newAppUrl}
                  placeholder="https://fee.internal"
                  onChange={(e) => setNewAppUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitNewApp()}
                />
              </div>
              <div className="row-actions" style={{ marginBottom: 0 }}>
                <button className="btn primary" disabled={!newAppName.trim() || !newAppUrl.trim()} onClick={submitNewApp}>
                  添加并打开
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div>
                <h2>{detail.title}</h2>
                <div className="hint">{detail.subtitle} · {detail.app}</div>
              </div>
              <button type="button" className="sheet-close" aria-label="关闭" onClick={() => setDetail(null)}>
                ×
              </button>
            </div>
            {detail.relation === 'mine_todo' ? (
              <span className="badge mine">你的待办 · 可协同</span>
            ) : (
              <span className="badge track">我的申请 · 处理中（{detail.flow?.nodes.find((n) => n.status === 'current')?.actor}）</span>
            )}
            {detail.flow?.nodes ? (
              <div className="ctx">
                <div className="section-h">节点历程</div>
                <NodeStrip nodes={detail.flow.nodes} />
                <p className="hint">
                  {detail.relation === 'mine_todo'
                    ? '当前节点负责人是你，形成待办。其余节点不会出现在你的待办中，也不可被 Agent 代办。'
                    : '当前节点由他人处理。Agent 只读跟踪，可催办，不代操作。'}
                </p>
              </div>
            ) : (
              <p className="hint">未读取到处理历程，已隐藏流程区块，不影响处理本条待办。</p>
            )}
            {detail.flow?.context && (
              <div className="ctx">
                <div className="section-h">关联的协作上下文</div>
                {detail.flow.context.chats?.map((c) => (
                  <div key={c.title + c.time} className="ctx-item">
                    <b>聊天 · {c.title}</b>
                    <div>{c.excerpt}</div>
                    <small>{c.time}</small>
                  </div>
                ))}
                {detail.flow.context.mails?.map((c) => (
                  <div key={c.title} className="ctx-item">
                    <b>邮件 · {c.title}</b>
                    <div>
                      {c.from} · {c.excerpt}
                    </div>
                    <small>{c.time}</small>
                  </div>
                ))}
                {detail.flow.context.meetings?.map((c) => (
                  <div key={c.title} className="ctx-item">
                    <b>会议 · {c.title}</b>
                    <div>{c.excerpt}</div>
                    <small>{c.time}</small>
                  </div>
                ))}
              </div>
            )}
            {detail.relation === 'mine_todo' && detail.state !== 'done' && detail.kind !== 'simple' && (
              <div className="ctx">
                <div className="section-h">Agent 可代办的流程操作</div>
                <div className="row-actions">
                  <button className="btn" onClick={() => runSingleCollab(detail, true)}>
                    汇总评审意见
                  </button>
                  <button className="btn" onClick={() => runSingleCollab(detail, true)}>
                    草拟结论
                  </button>
                  <button className="btn" onClick={() => runSingleCollab(detail, true)}>
                    生成对照表
                  </button>
                </div>
              </div>
            )}
            {detail.relation === 'mine_initiated' && (
              <button
                className="btn"
                onClick={() => {
                  setDetail(null)
                  say('agent', `已向 ${detail.flow?.nodes.find((n) => n.status === 'current')?.actor} 发出催办提醒（仅提醒，不代处理）。`)
                }}
              >
                生成催办提醒
              </button>
            )}
          </div>
        </div>
      )}

      {batchConfirm && (
        <div className="overlay" onClick={() => setBatchConfirm(false)}>
          <div className="onboard" onClick={(e) => e.stopPropagation()}>
            <h2>批量提交不可逆</h2>
            <p className="hint">
              即将提交 {batchChecked.length} 条「建议同意」项。差异项（需人工复核）默认排除，不会被提交。
            </p>
            <ul className="confirm-list">
              {batchItems
                .filter((t) => batchChecked.includes(t.id))
                .map((t) => (
                  <li key={t.id}>{t.subtitle} · {t.amount}</li>
                ))}
            </ul>
            {batchItems.some((t) => t.reviewFlags?.needReview && !batchChecked.includes(t.id)) && (
              <p className="hint">未提交：{batchItems.filter((t) => t.reviewFlags?.needReview && !batchChecked.includes(t.id)).map((t) => t.subtitle).join('、')}</p>
            )}
            <div className="row-actions">
              <button className="btn" onClick={() => setBatchConfirm(false)}>
                返回复核
              </button>
              <button className="btn primary" disabled={!batchChecked.length} onClick={() => doSubmit(batchChecked)}>
                确认提交 {batchChecked.length} 条
              </button>
            </div>
          </div>
        </div>
      )}

      {onboard && (
        <div className="overlay">
          <div className="onboard">
            <h2>人和 Agent 共用一台电脑</h2>
            <p className="hint">智能工作台不是聊天框里的工具列表，而是对话之外的第二现场。</p>
            <div className="principles">
              <div>
                <b>控制权单一</b> — 同一时刻只有一个操作者，状态条始终可见。
              </div>
              <div>
                <b>可逆即自动</b> — 读取、抽取、比对、预填由 Agent 完成；提交必须你点。
              </div>
              <div>
                <b>日志即信任</b> — 每一步留痕，随时暂停、接管、交还。
              </div>
            </div>
            <button
              className="btn primary"
              onClick={() => {
                localStorage.setItem(ONBOARD_KEY, '1')
                setOnboard(false)
              }}
            >
              开始处理待办
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  if (artifact.status === 'generating') {
    return (
      <div className="preview-paper preview-generating">
        <p className="gen">正在生成预览…</p>
      </div>
    )
  }
  if (artifact.type === 'xls' && artifact.preview.includes('\t')) {
    const rows = artifact.preview.split('\n').filter(Boolean).map((line) => line.split('\t'))
    const [head, ...body] = rows
    return (
      <div className="preview-paper preview-table-wrap">
        <table className="preview-table">
          <thead>
            <tr>
              {head.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, i) => (
              <tr key={i}>
                {row.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (artifact.type === 'html') {
    return (
      <div className="preview-paper preview-html">
        <div className="hint" style={{ marginBottom: 10 }}>
          HTML 预览（只读）。需要交互可点「在应用中打开」。
        </div>
        <div className="preview-html-body" dangerouslySetInnerHTML={{ __html: artifact.preview }} />
      </div>
    )
  }
  if (artifact.type === 'img') {
    const src = artifact.preview.startsWith('data:') || /^https?:\/\//i.test(artifact.preview)
      ? artifact.preview
      : undefined
    return (
      <div className="preview-paper preview-img">
        {src ? (
          <img src={src} alt={artifact.name} />
        ) : (
          <div className="preview-img-fallback">
            <p>{artifact.name}</p>
            <pre>{artifact.preview}</pre>
          </div>
        )}
      </div>
    )
  }
  return <div className="preview-paper">{artifact.preview}</div>
}

function TodoCard({
  t,
  batchMode,
  checked,
  onCheck,
  onOpen,
  onCollab,
  onNudge,
  onToggle,
}: {
  t: Todo
  batchMode?: boolean
  checked?: boolean
  onCheck?: (v: boolean) => void
  onOpen: () => void
  onCollab?: () => void
  onNudge?: () => void
  onToggle?: () => void
}) {
  const mine = t.relation === 'mine_todo'
  const simple = t.kind === 'simple'
  const current = t.flow?.nodes?.find((n) => n.status === 'current')
  const dueUrgent = t.pri === 'high' || t.due.includes('今天')
  return (
    <div
      className={`card ${t.state === 'running' ? 'running' : ''}`}
      data-agentable={mine && t.agent && t.state === 'pending' && !simple ? '1' : undefined}
      onClick={onOpen}
    >
      <div className="card-head">
        {(batchMode && mine && !simple) || (simple && mine) ? (
          <input
            className="check"
            type="checkbox"
            checked={simple ? t.state === 'done' : !!checked}
            onChange={(e) => (simple ? onToggle?.() : onCheck?.(e.target.checked))}
            onClick={(e) => e.stopPropagation()}
            title={simple ? '普通任务可手动勾选完成' : undefined}
          />
        ) : null}
        <div className="card-head-main">
          <div className="card-title-row">
            <h3>{t.title}</h3>
            <div className="card-aside">
              {t.amount ? <div className="card-amount">{t.amount}</div> : null}
              <div className={`card-due${dueUrgent ? ' urgent' : ''}`}>截止 {t.due}</div>
            </div>
          </div>
          <div className="meta">{t.subtitle}</div>
          <div className="badges">
            <span className={`badge ${t.pri}`}>{t.pri === 'high' ? '紧急' : t.pri === 'mid' ? '普通' : '低'}</span>
            <span className="badge">{t.domain}</span>
            <span className="badge" title="应用">
              {t.app}
            </span>
            {simple && <span className="badge">普通任务</span>}
            {!mine && <span className="badge track">我的申请 · 处理中</span>}
            {t.state === 'running' && <span className="badge mine">进行中</span>}
          </div>
        </div>
      </div>

      {t.flow?.nodes ? (
        <div className="card-flow" onClick={(e) => e.stopPropagation()}>
          <NodeStrip nodes={t.flow.nodes} />
        </div>
      ) : !simple ? (
        <div className="card-flow-empty">未读取到处理历程，已隐藏流程区块。</div>
      ) : null}

      <div className="card-foot">
        <div className="card-foot-hint">
          {current
            ? mine
              ? `当前节点：${current.label} · ${current.actor}`
              : `处理人：${current.actor} · ${current.label}`
            : simple
              ? '普通任务，勾选即可完成'
              : '点击查看详情'}
        </div>
        <div className="card-actions" onClick={(e) => e.stopPropagation()}>
          {mine && t.state !== 'done' && !simple && (
            <button type="button" className="btn primary" onClick={onCollab}>
              协同处理
            </button>
          )}
          {simple && mine && t.state !== 'done' && (
            <button type="button" className="btn" onClick={onToggle}>
              勾选完成
            </button>
          )}
          {!mine && (
            <button type="button" className="btn" onClick={onNudge}>
              催办提醒
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function W3List({ todos, onOpen }: { todos: Todo[]; onOpen: (t: Todo) => void }) {
  const sample = todos[0]
  return (
    <div>
      <div className="w3-bar">
        <span>W3 流程 · 待我审批</span>
        <span>{todos.length} 条</span>
      </div>
      <div className="mock-app">
        {sample?.flow?.nodes && (
          <>
            <NodeStrip nodes={sample.flow.nodes} />
            <p className="hint">节点条来自待办处理历程。当前负责人是你的条目可协同；他人节点不会出现在此列表。</p>
          </>
        )}
        {todos.map((t) => (
          <div key={t.id} className="batch-row">
            <div>
              <b>{t.title}</b>
              <div className="hint">{t.subtitle}</div>
            </div>
            <div>{t.amount || '—'}</div>
            <div>{t.due}</div>
            <button className="btn" onClick={() => onOpen(t)}>
              打开
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function W3Form({
  todo,
  fill,
  ready,
  submitted,
  human,
  onSubmit,
  onEdit,
}: {
  todo?: Todo
  fill: FillMap
  ready: boolean
  submitted?: boolean
  human?: boolean
  onSubmit: () => void
  onEdit?: (key: string, v: string) => void
}) {
  const nodes = todo?.flow?.nodes
  const k1 = fill.opinion ? 'opinion' : 'comment'
  const k2 = fill.score ? 'score' : 'amount'
  const k3 = fill.conclusion ? 'conclusion' : 'decision'
  return (
    <div>
      <div className="w3-bar">
        <span>W3 · {todo?.title || '表单'}</span>
        <span>{submitted ? '已提交' : ready ? '提交需你确认' : '预填中，尚未提交'}</span>
      </div>
      <div className="mock-app">
        {nodes && <NodeStrip nodes={nodes} />}
        {todo?.flow?.nodes ? (
          (() => {
            const cur = nodes?.find((n) => n.status === 'current')
            if (!cur) {
              return <p className="hint">流程节点已全部完成。</p>
            }
            if (isMeActor(cur.actor) && todo.relation === 'mine_todo' && todo.state !== 'done') {
              return <p className="hint">当前「{cur.label}」节点负责人是你，形成待办。</p>
            }
            return (
              <p className="hint">
                当前「{cur.label}」由「{cur.actor}」处理
                {submitted ? '；本页为提交后现场回放，不可代办。' : '；只读跟踪，不可代办。'}
              </p>
            )
          })()
        ) : (
          <p className="hint">未读取到完整历程时不渲染残缺流程图，表单仍可处理。</p>
        )}
        {submitted && <div className="ok-banner">提交成功。节点完成，待办已归档（Agent 代办 · 人工确认）。</div>}
        <div className="form">
          <Field label="处理意见" k={k1} value={fill[k1]?.v} src={fill[k1]?.src} editable={human && !submitted} onEdit={onEdit} />
          <Field label="评分 / 金额" k={k2} value={fill[k2]?.v} src={fill[k2]?.src} editable={human && !submitted} onEdit={onEdit} />
          <Field label="结论草稿" k={k3} value={fill[k3]?.v} src={fill[k3]?.src} editable={human && !submitted} onEdit={onEdit} />
          <div className="irreversible">
            <div>
              <strong>{submitted ? '已完成不可逆提交' : '提交为不可逆操作'}</strong>
              <p>{human && !submitted ? '你已接管，可改草稿后再确认。' : 'Agent 已完成读取、抽取与预填。通过 / 外发必须由你确认。'}</p>
            </div>
            <button className="btn primary" disabled={!ready || submitted} onClick={onSubmit}>
              {submitted ? '已提交' : ready ? '确认提交' : '等待预填完成'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  k,
  value,
  src,
  editable,
  onEdit,
}: {
  label: string
  k: string
  value?: string
  src?: string
  editable?: boolean
  onEdit?: (key: string, v: string) => void
}) {
  return (
    <div className="field">
      <label>
        {label}
        {src && <span className="src">来自{src}</span>}
      </label>
      {editable ? (
        <textarea className="val filled" value={value || ''} onChange={(e) => onEdit?.(k, e.target.value)} />
      ) : (
        <div className={`val ${value ? 'filled' : ''}`}>{value || '…'}</div>
      )}
    </div>
  )
}

function W3Batch({
  items,
  ready,
  checked,
  onCheck,
  onSubmit,
}: {
  items: Todo[]
  ready: boolean
  checked: string[]
  onCheck: (id: string, on: boolean) => void
  onSubmit: () => void
}) {
  const n = checked.length
  return (
    <div>
      <div className="w3-bar">
        <span>W3 · 批量预审</span>
        <span>仅显示勾选条目 · 将提交 {n} 条</span>
      </div>
      <div className="mock-app">
        <div className="batch-row" style={{ color: 'var(--muted)' }}>
          <div>条目</div>
          <div>金额</div>
          <div>预审</div>
          <div>提交</div>
        </div>
        {items.map((t) => {
          const warn = !!t.reviewFlags?.needReview
          return (
            <div key={t.id} className={`batch-row ${warn ? 'row-warn' : ''}`}>
              <div>
                {t.subtitle}
                {warn && <div className="hint">{t.reviewFlags?.reason}</div>}
              </div>
              <div>{t.amount}</div>
              <div className={warn ? 'flag-warn' : 'flag-ok'}>{warn ? '需人工复核' : '建议同意'}</div>
              <div>
                <input type="checkbox" checked={checked.includes(t.id)} onChange={(e) => onCheck(t.id, e.target.checked)} />
              </div>
            </div>
          )
        })}
        <div className="irreversible">
          <div>
            <strong>批量同意提交（{n}）为不可逆操作</strong>
            <p>差异项已标红且默认不勾选。确认后将弹出二次确认。</p>
          </div>
          <button className="btn primary" disabled={!ready || n === 0} onClick={onSubmit}>
            {ready ? `确认批量提交（${n}）` : '预审进行中'}
          </button>
        </div>
      </div>
    </div>
  )
}
