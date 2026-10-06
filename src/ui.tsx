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

export function sourceLabel(s: Artifact['source']) {
  if (s === 'agent') return 'Agent 代办'
  if (s === 'flow') return '流程联动'
  if (s === 'dialogue') return '对话产物'
  return '本地'
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function stem(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

function toExcelHtml(preview: string) {
  const rows = preview
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(/\t/))
  const body = rows
    .map((cols) => `<tr>${cols.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table>${body}</table></body></html>`
}

function toWordHtml(title: string, preview: string) {
  return `<html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body><pre style="font-family:sans-serif;white-space:pre-wrap">${esc(preview)}</pre></body></html>`
}

export function downloadArtifact(a: Artifact) {
  if (a.status === 'generating') return
  let blob: Blob
  let filename = a.name
  if (a.type === 'html') {
    const html = a.preview.includes('<') ? a.preview : toWordHtml(a.name, a.preview)
    blob = new Blob([html.startsWith('<') ? html : `<html><head><meta charset="utf-8"></head><body>${html}</body></html>`], { type: 'text/html;charset=utf-8' })
    filename = filename.endsWith('.html') ? filename : `${stem(filename)}.html`
  } else if (a.type === 'xls') {
    blob = new Blob([toExcelHtml(a.preview)], { type: 'application/vnd.ms-excel;charset=utf-8' })
    filename = `${stem(filename)}.xls`
  } else if (a.type === 'doc') {
    blob = new Blob([toWordHtml(a.name, a.preview)], { type: 'application/msword;charset=utf-8' })
    filename = `${stem(filename)}.doc`
  } else if (a.type === 'ppt') {
    const slides = a.preview
      .split('\n')
      .filter(Boolean)
      .map((s) => `<section style="page-break-after:always;padding:48px;font-family:sans-serif"><h2>${esc(s)}</h2></section>`)
      .join('')
    blob = new Blob([`<html><head><meta charset="utf-8"><title>${esc(a.name)}</title></head><body>${slides}</body></html>`], { type: 'text/html;charset=utf-8' })
    filename = `${stem(filename)}.html`
  } else {
    blob = new Blob([a.preview], { type: 'text/plain;charset=utf-8' })
    filename = `${stem(filename)}.txt`
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
