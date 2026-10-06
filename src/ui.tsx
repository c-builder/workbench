import type { Artifact, Control, Todo } from './types'

export function NodeStrip({ nodes }: { nodes: NonNullable<Todo['flow']>['nodes'] }) {
  return (
    <div className="nodes">
      {nodes.map((n) => (
        <div key={n.label} className={`node ${n.status}`}>
          <div className="n-label">
            <span className="dot" />
            {n.label}
          </div>
          <div>{n.actor}</div>
        </div>
      ))}
    </div>
  )
}

export function ControlLabel({ control }: { control: Control }) {
  const map = {
    none: '空闲',
    agent: 'Agent 操作中',
    human: '你在操作',
    paused: '已暂停 · 等待确认',
  }
  return (
    <span className={`ctrl-state ${control}`}>
      <i />
      {map[control]}
    </span>
  )
}

export function execLabel(v?: Todo['execBy']) {
  if (v === 'agent') return 'Agent 执行'
  if (v === 'human') return '人工执行'
  if (v === 'mix') return 'Agent 代办 · 人工确认'
  return ''
}

export function nowStamp() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

export function typeLabel(t: Artifact['type']) {
  return t.toUpperCase()
}
