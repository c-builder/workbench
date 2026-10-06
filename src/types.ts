export type Domain = '采购' | 'HR' | '报销' | '行政' | '项目协作'
export type Priority = 'high' | 'mid' | 'low'
export type Relation = 'mine_todo' | 'mine_initiated' | 'other'
export type TodoState = 'pending' | 'running' | 'done'
export type ExecBy = 'agent' | 'human' | 'mix'
export type NodeStatus = 'done' | 'current' | 'todo'
export type Control = 'none' | 'agent' | 'human' | 'paused'
export type WorkbenchTab = 'flow' | 'app' | 'files'
export type LogLevel = 'info' | 'pause' | 'ok'
export type ArtifactType = 'doc' | 'ppt' | 'xls' | 'html' | 'img'
export type ArtifactSource = 'dialogue' | 'agent' | 'flow' | 'local'
export type ArtifactKind = 'doc' | 'code' | 'img'
export type ArtifactStatus = 'generating' | 'done'
export type FillMap = Record<string, { v: string; src?: string }>
export type Actor = 'agent' | 'human'

export interface FlowNode {
  label: string
  status: NodeStatus
  actor: string
  date?: string
  note?: string
}

export interface FlowContext {
  chats?: { title: string; excerpt: string; time: string }[]
  mails?: { title: string; from: string; excerpt: string; time: string }[]
  meetings?: { title: string; excerpt: string; time: string }[]
}

export interface Todo {
  id: string
  title: string
  subtitle: string
  domain: Domain
  pri: Priority
  due: string
  agent: boolean
  relation: Relation
  state: TodoState
  execBy?: ExecBy
  amount?: string
  /** 待办所属应用，如 W3、eBuy */
  app: string
  url: string
  flow?: {
    nodes: FlowNode[]
    context?: FlowContext
  }
  reviewFlags?: { needReview?: boolean; reason?: string; suggestAgree?: boolean }
  kind?: 'flow' | 'simple'
}

export interface LogEntry {
  id: string
  time: string
  actor: Actor
  action: string
  level: LogLevel
  reversible: boolean
  app?: string
}

export interface Artifact {
  id: string
  type: ArtifactType
  name: string
  sub: string
  kind: ArtifactKind
  source: ArtifactSource
  status: ArtifactStatus
  session: string
  pages?: string
  preview: string
}

export interface BrowserTab {
  id: string
  title: string
  url: string
  kind: 'home' | 'w3' | 'w3-form' | 'w3-batch' | 'ebuy' | 'external' | 'html'
  html?: string
  controlDot: Control
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  text: string
  time: string
  steps?: string[]
  checkpoint?: string
}

export type SessionStatus = 'confirm' | 'running' | 'idle'

export interface Session {
  id: string
  title: string
  time: string
  unread?: boolean
  status?: SessionStatus
}
