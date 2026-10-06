import { useMemo, useState } from 'react'

type MarketTab = 'expert' | 'skill' | 'connector'

const scenes = [
  { id: 'approve', title: '积压审批', sub: '待我审批专家团', tone: 'a', cat: '审批' },
  { id: 'expense', title: '差旅报销', sub: '合规顾问', tone: 'b', cat: '报销' },
  { id: 'purchase', title: '供应商引入', sub: '技术评审专家团', tone: 'c', cat: '采购' },
  { id: 'hr', title: '任职资格', sub: '材料审核专家', tone: 'd', cat: 'HR' },
  { id: 'meet', title: '会议协同', sub: '纪要与催办', tone: 'e', cat: '行政' },
]

const categories = ['全部', '审批', '报销', '采购', 'HR', '行政', '法务']

const experts = [
  { name: '差旅合规顾问', who: '林可', cat: '报销', desc: '对照发票、预算与差旅标准，标出需人工复核的差异项。', tags: ['发票比对', '超预算', '建议同意'] },
  { name: '采购技术评委', who: '张衡', cat: '采购', desc: '汇总群聊、评分表与评审会纪要，起草有条件通过结论。', tags: ['评审意见', '评分表', '结论草稿'] },
  { name: '材料规范性专家', who: '赵瑜', cat: 'HR', desc: '按任职资格模板核验材料完整性，给出补件建议。', tags: ['材料包', '模板比对', '补件'] },
  { name: '审批积压助理', who: '周宁', cat: '审批', desc: '拉齐待我审批列表，批量预审后停在提交前交还你。', tags: ['批量预审', '控制权', '停提交'] },
  { name: '法务节点观察员', who: '沈清', cat: '法务', desc: '跟踪我发起、他人处理的节点，只催办不代办。', tags: ['我的申请', '催办', '只读'] },
  { name: '会议纪要整理', who: '韩迟', cat: '行政', desc: '从评审会纪要抽取待补项，回写到结论草稿。', tags: ['纪要', '待补项', '起草'] },
  { name: '报销权签顾问', who: '陈岚', cat: '报销', desc: '主管审批口径：金额一致建议同意，差异强制复核。', tags: ['权签', 'OCR', '复核'] },
  { name: '供应商引入向导', who: '马远', cat: '采购', desc: '按历程节点讲解归属，避免越权代他人处理。', tags: ['节点归属', '历程', '边界'] },
]

const skills = [
  { name: '发票金额比对', desc: '读取报销单与发票 OCR，生成对照表并标记差异。', tags: ['可逆', '报销'] },
  { name: '评审意见汇总', desc: '从群聊抽取评委意见，预填结论草稿，提交仍由你确认。', tags: ['可逆', '采购'] },
  { name: '批量预审', desc: '对勾选的待我审批逐条比对，差异项默认不提交。', tags: ['可逆', '审批'] },
  { name: '催办提醒生成', desc: '对我的申请生成催办文案，不代他人节点操作。', tags: ['只读', '跟踪'] },
  { name: '对照表导出', desc: '把预审结果写成表格产物，归入本次会话。', tags: ['产物', 'xlsx'] },
  { name: '材料清单核验', desc: '对照任职资格模板检查缺件并起草退回意见。', tags: ['HR', '可逆'] },
]

const connectors = [
  { name: '企业邮箱', desc: '按任务范围读取评分表等附件，标注来源后预填。', tags: ['邮件', '附件'] },
  { name: '群聊纪要', desc: '抽取当前任务相关的评委发言，不持久化多余内容。', tags: ['群聊', '抽取'] },
  { name: '会议纪要', desc: '读取评审会结论与待补项，写入结论草稿。', tags: ['会议', '纪要'] },
  { name: '日历空闲', desc: '检索会议室冲突与可改期建议，提交前交还你。', tags: ['行政', '日历'] },
]

export function MarketPage({ onUse }: { onUse: (title: string) => void }) {
  const [tab, setTab] = useState<MarketTab>('expert')
  const [cat, setCat] = useState('全部')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const match = (s: string) => !q.trim() || s.includes(q.trim())
    if (tab === 'skill') return skills.filter((x) => match(x.name + x.desc))
    if (tab === 'connector') return connectors.filter((x) => match(x.name + x.desc))
    return experts.filter((x) => (cat === '全部' || x.cat === cat) && match(x.name + x.who + x.desc))
  }, [tab, cat, q])

  return (
    <section className="market">
      <header className="market-bar">
        <div className="market-tabs">
          {(
            [
              ['expert', '专家'],
              ['skill', '技能'],
              ['connector', '连接器'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <input
          className="market-search"
          placeholder={tab === 'expert' ? '搜索专家或描述' : tab === 'skill' ? '搜索技能' : '搜索连接器'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn">我的{tab === 'expert' ? '专家' : tab === 'skill' ? '技能' : '连接器'}</button>
      </header>

      {tab === 'expert' && (
        <>
          <div className="market-h">精选场景</div>
          <div className="scenes">
            {scenes.map((s) => (
              <button key={s.id} className={`scene ${s.tone}`} onClick={() => setCat(s.cat)}>
                <strong>{s.title}</strong>
                <span>{s.sub}</span>
              </button>
            ))}
          </div>
          <div className="market-h row">
            <span>专家</span>
            <div className="cats">
              {categories.map((c) => (
                <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'skill' && <div className="market-h">可复用技能</div>}
      {tab === 'connector' && (
        <>
          <div className="market-h">连接器</div>
          <p className="market-note">连接器提供邮件、群聊、会议等上下文来源，不是右侧应用中心里的 W3 / eBuy 系统入口。</p>
        </>
      )}

      <div className="market-grid">
        {list.map((x) => (
          <article key={x.name} className="person-card">
            <div className="avatar">{x.name.slice(0, 1)}</div>
            <div>
              <h3>{x.name}</h3>
              {'who' in x && <div className="who">{(x as (typeof experts)[0]).who}</div>}
              <p>{x.desc}</p>
              <div className="tags">
                {x.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <button className="btn primary" onClick={() => onUse(x.name)}>
                用于当前任务
              </button>
            </div>
          </article>
        ))}
        {!list.length && <div className="rail-empty">没有匹配项</div>}
      </div>
    </section>
  )
}
