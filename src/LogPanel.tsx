import { useEffect, useMemo, useState } from 'react'
import type { LogEntry } from './types'
import { IconChevron, IconRestore } from './icons'

type Block =
  | { kind: 'round'; id: string; items: LogEntry[] }
  | { kind: 'item'; item: LogEntry }

function groupLogs(newestFirst: LogEntry[]): Block[] {
  const chrono = [...newestFirst].reverse()
  const blocks: Block[] = []
  let buf: LogEntry[] = []
  const flush = () => {
    if (!buf.length) return
    if (buf.length === 1) blocks.push({ kind: 'item', item: buf[0] })
    else blocks.push({ kind: 'round', id: buf[0].id, items: buf })
    buf = []
  }
  for (const l of chrono) {
    if (l.actor === 'agent' && l.reversible && l.level === 'info') buf.push(l)
    else {
      flush()
      blocks.push({ kind: 'item', item: l })
    }
  }
  flush()
  return blocks.reverse()
}

function openPin(logs: LogEntry[]) {
  const pauseIdx = logs.findIndex((l) => l.level === 'pause')
  if (pauseIdx < 0) return undefined
  const doneIdx = logs.findIndex((l) => l.level === 'ok' && l.action.includes('提交'))
  if (doneIdx >= 0 && doneIdx < pauseIdx) return undefined
  return logs[pauseIdx]
}

function tag(l: LogEntry, pinId?: string) {
  if (l.level === 'pause') {
    if (pinId && l.id === pinId) return { t: '待确认', c: 'pause' }
    return { t: '历史卡点', c: 'lock' }
  }
  if (!l.reversible && (l.action.includes('提交') || l.level === 'ok')) return { t: '已提交', c: 'done' }
  if (!l.reversible) return { t: '不可逆', c: 'lock' }
  return null
}

function RestoreBtn({
  id,
  dropSelf,
  onRestore,
}: {
  id: string
  dropSelf?: boolean
  onRestore: (id: string, dropSelf?: boolean) => void
}) {
  return (
    <button
      className="log-restore"
      title={dropSelf ? '撤销此步及之后的操作' : '回退到此检查点'}
      onClick={(e) => {
        e.stopPropagation()
        onRestore(id, dropSelf)
      }}
    >
      <IconRestore />
    </button>
  )
}

function Row({
  l,
  canRestore,
  onRestore,
  pinId,
}: {
  l: LogEntry
  canRestore: boolean
  onRestore: (id: string, dropSelf?: boolean) => void
  pinId?: string
}) {
  const chip = tag(l, pinId)
  return (
    <div className={`log-row ${l.level}`}>
      <span className="log-time">{l.time}</span>
      <span className={`who ${l.actor}`}>{l.actor === 'agent' ? 'Agent' : '你'}</span>
      <span className="log-act">{l.action}</span>
      <span className="log-ops">
        {chip && <em className={`log-chip ${chip.c}`}>{chip.t}</em>}
        {canRestore && <RestoreBtn id={l.id} dropSelf onRestore={onRestore} />}
      </span>
    </div>
  )
}

const DOCK = 3

function countSteps(b: Block) {
  return b.kind === 'round' ? b.items.length : 1
}

export function LogPanel({
  logs,
  apps,
  filter,
  onFilter,
  onRestore,
}: {
  logs: LogEntry[]
  apps: string[]
  filter: string
  onFilter: (v: string) => void
  onRestore: (id: string, dropSelf?: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [fold, setFold] = useState<Record<string, boolean>>({})
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  const pin = openPin(logs)
  const head = logs[0]?.id

  useEffect(() => {
    if (!logs.length) {
      setOpen(false)
      setMenu(false)
      setQ('')
    }
  }, [logs.length])

  const filtered = useMemo(() => {
    const t = q.trim()
    if (!t) return logs
    return logs.filter((l) => l.action.includes(t) || l.actor.includes(t) || (l.app || '').includes(t))
  }, [logs, q])

  const blocks = useMemo(() => groupLogs(filtered), [filtered])
  const newestRound = blocks.find((b) => b.kind === 'round')
  const visible = open ? blocks : blocks.slice(0, DOCK)
  const hidden = open ? 0 : blocks.slice(DOCK).reduce((n, b) => n + countSteps(b), 0)

  return (
    <div className={`logs ${open ? 'open' : ''} ${logs.length ? 'has-logs' : 'empty'}`}>
      <div className="log-h">
        <span>操作日志</span>
        <span>
          {!!logs.length && (
            <div className="log-filter">
            <button type="button" className="log-sel" onClick={() => setMenu((v) => !v)}>
              {filter === 'all' ? '全部应用' : filter}
            </button>
            {menu && (
              <div className="log-menu">
                {apps.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={filter === a ? 'on' : ''}
                    onClick={() => {
                      onFilter(a)
                      setMenu(false)
                    }}
                  >
                    {a === 'all' ? '全部应用' : a}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
          {open && (
            <input
              className="log-sel log-q"
              placeholder="筛选步骤"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}
          {!!logs.length && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setMenu(false)
                setOpen((v) => !v)
              }}
            >
              {open ? '收起' : '展开全部'}
            </button>
          )}
          {logs.length ? `${logs.length} 步` : '尚未开始'}
        </span>
      </div>

      {pin && (
        <div className="log-pin">
          <button className="log-pin-main" onClick={() => setOpen(true)}>
            <b>当前卡点</b>
            <span>{pin.action}</span>
            <em className="log-chip pause">待确认</em>
          </button>
        </div>
      )}

      {!!logs.length && (
      <div className="log-body">
        {visible.map((b) => {
          if (b.kind === 'item') {
            if (pin && b.item.id === pin.id) return null
            return <Row key={b.item.id} l={b.item} canRestore={!!b.item.reversible && b.item.id !== head} onRestore={onRestore} pinId={pin?.id} />
          }
          const expanded = fold[b.id] ?? (open ? b.id === newestRound?.id : false)
          const last = b.items[b.items.length - 1]
          return (
            <div key={b.id} className={`log-round ${expanded ? 'on' : ''}`}>
              <div className="log-round-h">
                <button type="button" className="log-round-toggle" onClick={() => setFold((m) => ({ ...m, [b.id]: !expanded }))}>
                  <IconChevron />
                  <span>
                    Agent 本轮 · {b.items.length} 步可逆
                    <small>
                      {b.items[0].time} – {last.time}
                    </small>
                  </span>
                  {!expanded && <em>{last.action}</em>}
                </button>
                {last.id !== head && <RestoreBtn id={last.id} onRestore={onRestore} />}
              </div>
              {expanded &&
                b.items.map((l) => <Row key={l.id} l={l} canRestore={!!l.reversible && l.id !== head} onRestore={onRestore} pinId={pin?.id} />)}
            </div>
          )
        })}
        {hidden > 0 && (
          <button className="log-more" onClick={() => setOpen(true)}>
            更早还有 {hidden} 步，展开后按轮查看
          </button>
        )}
        {!!logs.length && !filtered.length && <div className="log-empty">没有匹配「{q}」的步骤。</div>}
      </div>
      )}
    </div>
  )
}
