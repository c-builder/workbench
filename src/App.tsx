import { useEffect, useMemo, useRef, useState } from 'react'
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
import { IconChatPlus, IconChevron, IconClock, IconExternal, IconHand, IconLogo, IconNodes, IconPause, IconPlay, IconPlus, IconRestore, IconSend, IconSpinner } from './icons'
import type {
  Artifact,
  BrowserTab,
  ChatMessage,
  Control,
  Domain,
  FillMap,
  LogEntry,
  Session,
  SessionStatus,
  Todo,
  WorkbenchTab,
} from './types'
import { LogPanel } from './LogPanel'
import { MarketPage } from './MarketPage'
import { ControlLabel, downloadArtifact, execLabel, NodeStrip, nowStamp, typeLabel } from './ui'

const ONBOARD_KEY = 'hengtai-onboard-v1'
const DOMAINS: Domain[] = ['报销', '采购', 'HR', '行政', '项目协作']

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

function uid(p: string) {
  return `${p}-${Math.random().toString(36).slice(2, 8)}`
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
  const drag = useRef(false)
  const runRef = useRef(0)
  const fillKeys = useRef<string[]>([])

  const [panel, setPanel] = useState<WorkbenchTab>('flow')
  const [control, setControl] = useState<Control>('none')
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [archived, setArchived] = useState<Todo[]>(initialArchived)
  const [archiveView, setArchiveView] = useState(false)
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'agent' | 'human' | 'mix'>('all')
  const [foldMine, setFoldMine] = useState(false)
  const [foldInit, setFoldInit] = useState(false)
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
  const [inbox, setInbox] = useState<Record<string, ChatMessage[]>>({
    s1: seedMessages('s1'),
    s2: seedMessages('s2'),
    s3: seedMessages('s3'),
  })

  const messages = inbox[sessionId] || [welcome()]
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)

  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 'home', title: '应用中心', url: 'hengtai://apps', kind: 'home', controlDot: 'none' },
  ])
  const [activeTab, setActiveTab] = useState('home')
  const [urlInput, setUrlInput] = useState('hengtai://apps')
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
  const [fileId, setFileId] = useState(initialArtifacts[0].id)
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
      t.system.includes(q)
    const dom = domainFilter === 'all' || t.domain === domainFilter
    return hit && dom
  }
  const mineAll = todos.filter((t) => t.relation === 'mine_todo')
  const initiatedAll = todos.filter((t) => t.relation === 'mine_initiated')
  const mine = mineAll.filter(match)
  const initiated = initiatedAll.filter(match)
  const running = todos.filter((t) => t.state === 'running').length
  const agentable = mineAll.filter((t) => t.agent && t.state === 'pending' && t.kind !== 'simple').length
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
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return
      const w = window.innerWidth
      const rest = Math.max(480, w - 248)
      const pct = ((w - e.clientX) / rest) * 100
      setBench(Math.min(70, Math.max(30, pct)))
    }
    const up = () => {
      drag.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', up)
    }
  }, [])

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

  const setTabControl = (c: Control) => {
    setTabs((ts) => ts.map((t) => (t.id === activeTab ? { ...t, controlDot: c } : t)))
  }

  const archiveTodos = (ids: string[], execBy: Todo['execBy']) => {
    setTodos((list) => {
      const move = list.filter((t) => ids.includes(t.id)).map((t) => ({ ...t, state: 'done' as const, execBy }))
      setArchived((a) => [...move, ...a])
      return list.filter((t) => !ids.includes(t.id))
    })
  }

  const addArtifact = (a: Artifact) => {
    setArtifacts((list) => [a, ...list])
    setFileId(a.id)
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
    setControl('agent')
    setSubmitReady(false)
    setFormFill({})
    setCursor({ on: true, x: 80, y: 70 })
    const tab: BrowserTab = {
      id: uid('tab'),
      title: `${todo.system} · ${todo.title.split('·')[0].trim()}`,
      url: todo.url || 'https://w3.internal/todo',
      kind: 'w3-form',
      controlDot: 'agent',
    }
    setTabs((ts) => [...ts.filter((t) => t.kind !== 'w3-form'), tab])
    setActiveTab(tab.id)
    setUrlInput(tab.url)
    say('user', fromDetail ? `对「${todo.title}」执行协同：汇总评审意见并起草结论` : `协同处理：${todo.title}`)
    setTyping(true)
    const artId = uid('f')
    addArtifact({
      id: artId,
      type: 'doc',
      name: `${todo.title.split('·')[0].trim()}处理草稿.docx`,
      sub: 'Agent 代办 · 生成中',
      kind: 'doc',
      source: 'agent',
      status: 'generating',
      session: '本次会话',
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
      pushLog({ actor: 'agent', action, level: 'info', reversible, app: todo.system })
      return true
    }
    if (!(await step(480, `打开 ${todo.system} · ${todo.title}`))) return
    if (todo.domain === '采购' || todo.id === 't4') {
      if (!(await step(640, '从群聊抽取三位评委意见'))) return
      fillField('opinion', '张工：兼容现网，有条件通过；赵工：需补备件清单。', '群聊')
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
    setControl('paused')
    setTabControl('paused')
    setSubmitReady(true)
    pushLog({ actor: 'agent', action: '停在提交前，等待人工确认（不可逆）', level: 'pause', reversible: false, app: todo.system })
    setArtifacts((list) =>
      list.map((a) =>
        a.id === artId
          ? { ...a, status: 'done', sub: `Agent 代办 · ${nowStamp()}`, pages: '1 页', preview: steps.join('\n') }
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
    setControl('agent')
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
    setControl('paused')
    setTabControl('paused')
    setBatchReady(true)
    setBatchChecked(items.filter((t) => !t.reviewFlags?.needReview).map((t) => t.id))
    const need = items.filter((t) => t.reviewFlags?.needReview).length
    pushLog({ actor: 'agent', action: `停在批量同意提交（${items.length}）前`, level: 'pause', reversible: false, app: 'W3' })
    addArtifact({
      id: uid('f'),
      type: 'xls',
      name: '批量预审对照表.xlsx',
      sub: `Agent 代办 · ${nowStamp()} · ${items.length} 条`,
      kind: 'doc',
      source: 'agent',
      status: 'done',
      session: '本次会话',
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
    setControl('agent')
    setTabControl('agent')
    setTyping(true)
    say('user', '把这个页面里待审批的条目核对一下')
    const acts = ['读取当前页列表', '抽取金额与发票字段', '与预算科目比对', '预填同意意见（草稿）']
    for (const a of acts) {
      if (!(await sleep(600, token))) return
      pushLog({ actor: 'agent', action: a, level: 'info', reversible: true, app: urlInput })
    }
    if (token !== runRef.current) return
    setTyping(false)
    setControl('paused')
    setTabControl('paused')
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
    setControl('human')
    setTabControl('human')
    setSubmitReady(false)
    setBatchConfirm(false)
    setSubmitted(true)
    if (batchReady) {
      archiveTodos(ids, 'mix')
      const remain = batchItems.filter((t) => !ids.includes(t.id))
      setBatchItems(remain)
      setBatchReady(remain.length > 0)
      setPicked([])
      setBatchChecked([])
      say('agent', `已批量提交 ${ids.length} 条（差异项未提交）。待办已移入归档，执行方：Agent 代办 · 人工确认。${remain.length ? `仍留 ${remain.length} 条需你复核。` : ''}`)
    } else if (ids[0]) {
      const t = todos.find((x) => x.id === ids[0])
      archiveTodos(ids, 'mix')
      addArtifact({
        id: uid('f'),
        type: 'doc',
        name: `${t?.title.split('·')[0].trim() || '流程'}结论.docx`,
        sub: `流程联动 · ${nowStamp()}`,
        kind: 'doc',
        source: 'flow',
        status: 'done',
        session: '本次会话',
        pages: '1 页',
        preview: `已提交。节点完成，下一处理人按历程流转。\n来源：${t?.title}`,
      })
      say('agent', `「${t?.title}」已提交。该待办从你的列表移除并归档。若下一节点负责人不是你，将出现在「我的申请」跟踪里。可问我「刚刚核对出的差异有哪些」。`)
    }
    setTimeout(() => {
      setControl('none')
      setTabControl('none')
    }, 600)
  }

  const pauseAgent = () => {
    abortRun()
    setTyping(false)
    setControl('paused')
    setTabControl('paused')
    pushLog({ actor: 'human', action: '暂停 Agent', level: 'pause', reversible: true })
    say('system', '已暂停。可接管修改，或交还 Agent 继续可逆步骤。')
  }
  const takeover = () => {
    abortRun()
    setTyping(false)
    setControl('human')
    setTabControl('human')
    pushLog({ actor: 'human', action: '接管页面操作', level: 'info', reversible: true })
  }
  const returnAgent = () => {
    pushLog({ actor: 'human', action: '交还 Agent', level: 'info', reversible: true })
    if (submitReady || batchReady) {
      setControl('paused')
      setTabControl('paused')
      say('agent', '可逆步骤已完成，仍停在提交前。请你确认不可逆操作。')
      return
    }
    const t = todos.find((x) => x.id === activeTodoId)
    if (t) {
      runSingleCollab(t)
      return
    }
    setControl('agent')
    setTabControl('agent')
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
    setControl('none')
    setTabControl('none')
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
      setControl('paused')
      setTabControl('paused')
    } else if (removed.some((l) => l.level === 'pause' || l.action.includes('提交'))) {
      setSubmitReady(false)
      setSubmitted(false)
      setBatchReady(false)
      setControl('none')
      setTabControl('none')
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

  const switchSession = (id: string) => {
    setSessionId(id)
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
      setArchiveView(false)
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
          : '最近一次预审：李娜深圳拜访金额超预算且发票差 ¥180，其余建议同意。差异项默认不会被批量提交。',
      )
      return
    }
    say('user', q)
    say('agent', '可以从右侧「流程活动」点协同处理，或打开应用后让我处理当前页。不可逆操作我会停下来等你。')
  }

  const goUrl = () => {
    let url = urlInput.trim()
    if (!url) return
    if (!/^https?:|^hengtai:/.test(url)) url = 'https://' + url
    setUrlInput(url)
    const known = url.includes('w3') ? 'w3' : url.includes('ebuy') ? 'ebuy' : 'external'
    const tab: BrowserTab = {
      id: uid('tab'),
      title: known === 'w3' ? 'W3' : known === 'ebuy' ? 'eBuy' : new URL(url, 'https://x').hostname,
      url,
      kind: known === 'w3' ? 'w3' : known === 'ebuy' ? 'ebuy' : 'external',
      controlDot: 'human',
    }
    setTabs((ts) => [...ts, tab])
    setActiveTab(tab.id)
    setControl('human')
    pushLog({ actor: 'human', action: `打开 ${url}`, level: 'info', reversible: true, app: url })
  }

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0]
  const file = artifacts.find((a) => a.id === fileId) || artifacts[0]
  const shownArchive = archived.filter((t) => archiveFilter === 'all' || t.execBy === archiveFilter)

  const stats = useMemo(
    () => [
      { n: mineAll.length, l: '我的待办' },
      { n: initiatedAll.length, l: '我的申请' },
      { n: running, l: '进行中' },
      { n: agentable, l: 'Agent 可推进' },
    ],
    [mineAll.length, initiatedAll.length, running, agentable],
  )

  const jumpStat = (label: string) => {
    setArchiveView(false)
    setPanel('flow')
    if (label === '我的申请') setFoldInit(false)
    else setFoldMine(false)
    window.setTimeout(() => {
      const el =
        label === '我的申请'
          ? document.getElementById('sec-init')
          : label === '进行中'
            ? document.querySelector<HTMLElement>('.flow-panel .card.running')
            : label === 'Agent 可推进'
              ? document.querySelector<HTMLElement>('.flow-panel [data-agentable="1"]')
              : document.getElementById('sec-mine')
      ;(el || document.getElementById('sec-mine'))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <div
      className="app-shell"
      style={{ gridTemplateColumns: `248px minmax(0, ${100 - bench}fr) 6px minmax(0, ${bench}fr)` }}
    >
      <aside className="rail">
        <div className="rail-brand">
          <div className="logo" title="衡台">
            <IconLogo />
          </div>
          <div>
            <b>衡台</b>
            <span>工作助手</span>
          </div>
        </div>
        <button className="new-task" onClick={newSession}>
          <IconChatPlus />
          新建任务
        </button>
        <nav className="rail-nav">
          <button className={railNav === 'skills' ? 'active' : ''} onClick={() => setRailNav('skills')}>
            <IconNodes />
            专家·技能·连接器
          </button>
          <button className={railNav === 'schedule' ? 'active' : ''} onClick={() => setRailNav('schedule')}>
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
                return (
                  <button
                    key={s.id}
                    className={`task-item ${s.id === sessionId && railNav === 'assistant' ? 'active' : ''}`}
                    onClick={() => {
                      switchSession(s.id)
                      setRailNav('assistant')
                    }}
                  >
                    <span className="task-title">{s.title}</span>
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
                  </button>
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
          <div>
            <h1>{sessionList.find((s) => s.id === sessionId)?.title || '衡台 · 人机协同工作台'}</h1>
            <div className="sub">对话编排意图 · 右侧是人和 Agent 共用的现场</div>
          </div>
          <span className="pill">模式 A · 决策接力</span>
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
                    <button className="btn ghost" onClick={() => setPanel('app')}>
                      在工作台查看现场
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
              <div className="bubble typing">正在操作工作台现场…</div>
            </div>
          )}
          <div ref={msgEnd} />
        </div>
        <div className="composer">
          <div className="composer-box">
            <div className="chips">
              {suggestions.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="composer-row">
              <textarea
                rows={2}
                placeholder="描述任务，或让我处理当前页面…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <button
                className="send"
                onClick={() => (control === 'agent' ? pauseAgent() : send())}
                disabled={control !== 'agent' && !draft.trim()}
                title={control === 'agent' ? '停止 Agent' : '发送'}
              >
                {control === 'agent' ? <IconPause /> : <IconSend />}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="splitter" onMouseDown={() => (drag.current = true)} />

      <aside className="bench">
        <div className="bench-head">
          <div className="tabs">
            {(
              [
                ['flow', '流程活动', mineAll.length],
                ['app', '应用', tabs.length],
                ['files', '产物与文件', artifacts.length],
              ] as const
            ).map(([id, label, count]) => (
              <button key={id} className={`tab ${panel === id ? 'active' : ''}`} onClick={() => setPanel(id)}>
                {label}
                <span className="count">{count}</span>
              </button>
            ))}
          </div>
          <div className="control-bar">
            <ControlLabel control={control} />
            <button className="icon-btn" title="暂停 Agent" disabled={control !== 'agent'} onClick={pauseAgent}>
              <IconPause />
            </button>
            <button className="icon-btn" title="我接管" disabled={control === 'human' || control === 'none'} onClick={takeover}>
              <IconHand />
            </button>
            <button className="icon-btn" title="交还 Agent" disabled={control !== 'human'} onClick={returnAgent}>
              <IconPlay />
            </button>
          </div>
        </div>

        <div className="bench-body">
          {panel === 'flow' && (
            <div className="flow-panel">
              {!archiveView ? (
                <>
                  <div className="summary">
                    {stats.map((s) => (
                      <button key={s.l} type="button" className="stat" onClick={() => jumpStat(s.l)}>
                        <b>{s.n}</b>
                        <span>{s.l}</span>
                      </button>
                    ))}
                  </div>
                  <div className="row-actions">
                    <input
                      className="search"
                      placeholder="搜索待办 / 系统 / 域"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <div className="filter-row">
                    <button className={`btn ${domainFilter === 'all' ? 'primary' : ''}`} onClick={() => setDomainFilter('all')}>
                      全部域
                    </button>
                    {DOMAINS.map((d) => (
                      <button key={d} className={`btn ${domainFilter === d ? 'primary' : ''}`} onClick={() => setDomainFilter(d)}>
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="row-actions">
                    <button
                      className={`btn ${batchMode ? 'warn' : 'primary'}`}
                      onClick={() => {
                        setBatchMode((v) => !v)
                        setPicked([])
                      }}
                    >
                      {batchMode ? '退出批量' : '批量审批（待我审批）'}
                    </button>
                    <button
                      className="btn"
                      disabled={!agentable}
                      onClick={() => {
                        const t = todos.find((x) => x.relation === 'mine_todo' && x.agent && x.state === 'pending' && x.kind !== 'simple')
                        if (t) runSingleCollab(t)
                      }}
                    >
                      一键推进可代办事项
                    </button>
                    <button className="btn ghost" onClick={() => setArchiveView(true)}>
                      归档查看
                    </button>
                  </div>
                  {batchMode && (
                    <div className="row-actions">
                      <span className="hint">仅「当前负责人 = 我」的待办可勾选。已选 {picked.length} 条。</span>
                      <button className="btn primary" disabled={picked.length < 2} onClick={() => runBatch(picked)}>
                        批量审批（{picked.length}）
                      </button>
                    </div>
                  )}

                  <div className="section-h" id="sec-mine">
                    我的待办
                    <button className="fold" onClick={() => setFoldMine((v) => !v)}>
                      {foldMine ? '展开' : '折叠'}
                    </button>
                  </div>
                  {!foldMine &&
                    DOMAINS.map((d) => {
                      const rows = mine.filter((t) => t.domain === d)
                      if (!rows.length) return null
                      return (
                        <div key={d}>
                          <div className="domain-h">{d} · {rows.length}</div>
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
                    })}

                  <div className="section-h" id="sec-init">
                    我的申请
                    <button className="fold" onClick={() => setFoldInit((v) => !v)}>
                      {foldInit ? '展开' : '折叠'}
                    </button>
                  </div>
                  {!foldInit &&
                    initiated.map((t) => (
                      <TodoCard key={t.id} t={t} onOpen={() => setDetail(t)} onNudge={() => say('agent', `已生成催办提醒给「${t.flow?.nodes.find((n) => n.status === 'current')?.actor}」，不会代为处理该节点。`)} />
                    ))}
                </>
              ) : (
                <>
                  <div className="row-actions">
                    <button className="btn" onClick={() => setArchiveView(false)}>
                      返回待办
                    </button>
                    <div className="filter-row">
                      {(['all', 'agent', 'human', 'mix'] as const).map((k) => (
                        <button key={k} className={`btn ${archiveFilter === k ? 'primary' : ''}`} onClick={() => setArchiveFilter(k)}>
                          {k === 'all' ? '全部' : execLabel(k)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {shownArchive.map((t) => (
                    <div key={t.id} className="card" onClick={() => setDetail(t)}>
                      <h3>{t.title}</h3>
                      <div className="meta">{t.subtitle}</div>
                      <div className="badges">
                        <span className="badge">{execLabel(t.execBy)}</span>
                        <span className="badge">{t.domain}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {panel === 'app' && (
            <div className="browser">
              <div className="tabstrip">
                {tabs.map((t) => (
                  <div key={t.id} className={`btab ${t.id === activeTab ? 'active' : ''}`}>
                    <button
                      className="btab"
                      style={{ padding: 0, border: 0, background: 'none', color: 'inherit' }}
                      onClick={() => {
                        setActiveTab(t.id)
                        setUrlInput(t.url)
                      }}
                    >
                      <span className={`cdot ${t.controlDot}`} />
                      {t.title}
                    </button>
                    {t.id !== 'home' && (
                      <button
                        className="x"
                        onClick={() => {
                          const next = tabs.filter((x) => x.id !== t.id)
                          setTabs(next)
                          if (activeTab === t.id) {
                            setActiveTab(next[0].id)
                            setUrlInput(next[0].url)
                          }
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="icon-btn"
                  title="新标签"
                  onClick={() => {
                    const tab: BrowserTab = { id: uid('tab'), title: '新标签页', url: 'hengtai://apps', kind: 'home', controlDot: 'human' }
                    setTabs((ts) => [...ts, tab])
                    setActiveTab(tab.id)
                    setUrlInput(tab.url)
                    setControl('human')
                  }}
                >
                  <IconPlus />
                </button>
              </div>
              <div className="omnibox">
                <button
                  className="icon-btn"
                  title="上一标签"
                  onClick={() => {
                    const i = tabs.findIndex((t) => t.id === activeTab)
                    const prev = tabs[Math.max(0, i - 1)]
                    setActiveTab(prev.id)
                    setUrlInput(prev.url)
                  }}
                >
                  ←
                </button>
                <button className="icon-btn" onClick={() => {}}>
                  ↻
                </button>
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && goUrl()}
                />
                <button className="btn" onClick={goUrl}>
                  前往
                </button>
                <a className="btn" href={currentTab.url.startsWith('http') ? currentTab.url : 'https://w3.example.com'} target="_blank" rel="noreferrer">
                  <IconExternal /> 外部打开
                </a>
                <button className="btn primary" onClick={runPageCollab} disabled={control === 'agent'}>
                  让 Agent 处理当前页
                </button>
              </div>
              <div className="page">
                {cursor.on && control === 'agent' && (
                  <div className="agent-cursor" style={{ left: cursor.x, top: cursor.y }} />
                )}
                {currentTab.kind === 'home' && (
                  <div className="mock-app">
                    <h2>应用中心</h2>
                    <p className="hint">点选内网应用，或在地址栏输入网址。打开后控制权默认归你。</p>
                    <div className="home-apps">
                      {appShortcuts.map((a) => (
                        <button
                          key={a.id}
                          className="app-tile"
                          onClick={() => {
                            const tab: BrowserTab = {
                              id: uid('tab'),
                              title: a.name,
                              url: a.url,
                              kind: a.id === 'w3' ? 'w3' : a.id === 'ebuy' ? 'ebuy' : 'external',
                              controlDot: 'human',
                            }
                            setTabs((ts) => [...ts, tab])
                            setActiveTab(tab.id)
                            setUrlInput(a.url)
                            setControl('human')
                            pushLog({ actor: 'human', action: `从应用中心打开 ${a.name}`, level: 'info', reversible: true, app: a.url })
                          }}
                        >
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
                    <h3>演示环境占位页</h3>
                    <p>内网或外部站点无法在此 iframe 中加载，已记录地址，避免白屏。</p>
                    <p>
                      <code>{currentTab.url}</code>
                    </p>
                    <a className="btn primary" href={currentTab.url} target="_blank" rel="noreferrer">
                      在外部浏览器打开
                    </a>
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
                {['本次会话', '上次会话'].map((g) => (
                  <div key={g}>
                    <div className="section-h">{g}</div>
                    {artifacts
                      .filter((a) => a.session === g)
                      .map((a) => (
                        <div key={a.id} className={`file-row ${fileId === a.id ? 'active' : ''} ${a.status === 'generating' ? 'gen' : ''}`}>
                          <button type="button" className="file-item" onClick={() => setFileId(a.id)}>
                            <b>
                              {typeLabel(a.type)} · {a.name}
                            </b>
                            <span>
                              {a.sub} {a.status === 'generating' ? '· 生成中' : ''}
                            </span>
                          </button>
                          {a.status !== 'generating' && (
                            <button type="button" className="file-dl" onClick={() => downloadArtifact(a)}>
                              下载
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
              <div className="preview">
                <div className="row-actions">
                  <span className="hint">
                    来源：{file.source === 'agent' ? 'Agent 代办' : file.source === 'flow' ? '流程联动' : file.source === 'dialogue' ? '对话生成' : '本地'} · {file.pages}
                  </span>
                  <button className="btn" disabled={file.status === 'generating'} onClick={() => downloadArtifact(file)}>
                    下载
                  </button>
                  {file.type === 'html' && (
                    <button
                      className="btn primary"
                      onClick={() => {
                        const tab: BrowserTab = {
                          id: uid('tab'),
                          title: file.name,
                          url: 'hengtai://artifact/' + file.id,
                          kind: 'html',
                          html: file.preview,
                          controlDot: 'human',
                        }
                        setTabs((ts) => [...ts, tab])
                        setActiveTab(tab.id)
                        setUrlInput(tab.url)
                        setPanel('app')
                        setControl('human')
                        say('agent', `已在应用面板打开 ${file.name}，控制权归你。`)
                      }}
                    >
                      在应用中打开
                    </button>
                  )}
                </div>
                <div className="preview-paper">{file.preview}</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {railNav === 'skills' && (
        <div className="market-layer">
          <MarketPage
            onUse={(title) => {
              setRailNav('assistant')
              say('user', `启用「${title}」`)
              say(
                'agent',
                `已把「${title}」加入当前任务。专家 / 技能 / 连接器提供可复用能力，不会代替应用中心里的 W3、eBuy 等系统入口。处理待办仍从右侧流程活动或应用进入。`,
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

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row-actions" style={{ justifyContent: 'space-between' }}>
              <div>
                <h2>{detail.title}</h2>
                <div className="hint">{detail.subtitle} · {detail.system}</div>
              </div>
              <button className="btn" onClick={() => setDetail(null)}>
                关闭
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
                  <button className="btn primary" onClick={() => runSingleCollab(detail, true)}>
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
  return (
    <div className={`card ${t.state === 'running' ? 'running' : ''}`} data-agentable={mine && t.agent && t.state === 'pending' && !simple ? '1' : undefined}>
      <div className="card-top">
        {batchMode && mine && !simple && (
          <input className="check" type="checkbox" checked={!!checked} onChange={(e) => onCheck?.(e.target.checked)} onClick={(e) => e.stopPropagation()} />
        )}
        {simple && mine && (
          <input
            className="check"
            type="checkbox"
            checked={t.state === 'done'}
            onChange={() => onToggle?.()}
            onClick={(e) => e.stopPropagation()}
            title="普通任务可手动勾选完成"
          />
        )}
        <div style={{ flex: 1 }} onClick={onOpen}>
          <h3>{t.title}</h3>
          <div className="meta">
            {t.subtitle}
            {t.amount ? ` · ${t.amount}` : ''} · 截止 {t.due}
          </div>
          <div className="badges">
            <span className={`badge ${t.pri}`}>{t.pri === 'high' ? '紧急' : t.pri === 'mid' ? '普通' : '低'}</span>
            <span className="badge">{t.domain}</span>
            <span className="badge">{t.system}</span>
            {simple && <span className="badge">普通任务</span>}
            {mine ? <span className="badge mine">我的待办</span> : <span className="badge track">我的申请 · 处理中</span>}
          </div>
          {t.flow?.nodes && <NodeStrip nodes={t.flow.nodes} />}
          {!t.flow?.nodes && !simple && <div className="hint">未读取到处理历程，已隐藏流程区块。</div>}
        </div>
      </div>
      <div className="card-actions">
        {mine && t.state !== 'done' && !simple && (
          <button className="btn primary" onClick={onCollab}>
            协同处理
          </button>
        )}
        {simple && mine && t.state !== 'done' && (
          <button className="btn" onClick={onToggle}>
            勾选完成
          </button>
        )}
        {!mine && (
          <button className="btn" onClick={onNudge}>
            催办提醒
          </button>
        )}
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
          todo.relation === 'mine_todo' || todo.state === 'done' ? (
            <p className="hint">当前「{nodes?.find((n) => n.status === 'current')?.label}」节点负责人是你，形成待办。</p>
          ) : (
            <p className="hint">该节点由他人处理，只读。</p>
          )
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
