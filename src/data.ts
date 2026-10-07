import type { Artifact, Session, Todo } from './types'

/** 当前登录人（与控制台会话归属一致） */
export const ME = '陈华明'

export const sessions: Session[] = [
  { id: 's1', title: '积压差旅报销过一遍', time: '今天 14:12', status: 'idle' },
  { id: 's2', title: '凌云智算·技术评审', time: '今天 11:03', status: 'idle' },
  { id: 's3', title: '周四评审会会议室确认', time: '昨天 18:40', status: 'idle' },
]

export const initialTodos: Todo[] = [
  {
    id: 't1',
    title: '差旅费报销 · 主管审批',
    subtitle: '张伟 · 上海客户驻场 · 发票 3 张',
    domain: '报销',
    pri: 'high',
    due: '今天 18:00',
    agent: true,
    relation: 'mine_todo',
    state: 'pending',
    amount: '¥4,860.00',
    app: 'W3',
    url: 'https://w3.internal/approve/EXP-20261006-1042',
    flow: {
      nodes: [
        { label: '提单', status: 'done', actor: '张伟', date: '10-03' },
        { label: '主管审批', status: 'current', actor: '我', date: '10-07' },
        { label: '财务复核', status: 'todo', actor: '财务共享中心' },
        { label: '出纳支付', status: 'todo', actor: '出纳组' },
      ],
    },
    reviewFlags: { suggestAgree: true },
  },
  {
    id: 't2',
    title: '差旅费报销 · 主管审批',
    subtitle: '李思远 · 深圳大客户拜访',
    domain: '报销',
    pri: 'mid',
    due: '明天 12:00',
    agent: true,
    relation: 'mine_todo',
    state: 'pending',
    amount: '¥12,400.00',
    app: 'W3',
    url: 'https://w3.internal/approve/EXP-20261006-1108',
    flow: {
      nodes: [
        { label: '提单', status: 'done', actor: '李思远', date: '10-05' },
        { label: '主管审批', status: 'current', actor: '我' },
        { label: '财务复核', status: 'todo', actor: '财务共享中心' },
      ],
    },
    reviewFlags: {
      needReview: true,
      reason: '超部门差旅预算 ¥2,400；发票 OCR 合计 ¥12,220，单据金额 ¥12,400，差额 ¥180',
    },
  },
  {
    id: 't3',
    title: '差旅费报销 · 主管审批',
    subtitle: '王俊杰 · 北京产品培训',
    domain: '报销',
    pri: 'low',
    due: '10-08',
    agent: true,
    relation: 'mine_todo',
    state: 'pending',
    amount: '¥2,160.00',
    app: 'W3',
    url: 'https://w3.internal/approve/EXP-20261006-1115',
    flow: {
      nodes: [
        { label: '提单', status: 'done', actor: '王俊杰', date: '10-06' },
        { label: '主管审批', status: 'current', actor: '我' },
        { label: '财务复核', status: 'todo', actor: '财务共享中心' },
      ],
    },
    reviewFlags: { suggestAgree: true },
  },
  {
    id: 't4',
    title: '供应商引入采购 · 技术评审',
    subtitle: '凌云智算科技 · GPU 服务器配件包',
    domain: '采购',
    pri: 'high',
    due: '今天 17:30',
    agent: true,
    relation: 'mine_todo',
    state: 'pending',
    app: 'W3',
    url: 'https://w3.internal/flow/PO-INTRO-2026-8821',
    flow: {
      nodes: [
        { label: '立项申请', status: 'done', actor: '赵敏', date: '09-18', note: '预算号 CAPEX-2026-0918 已批' },
        { label: '商务谈判', status: 'done', actor: '周晓东', date: '09-26' },
        { label: '技术评审', status: 'current', actor: '我', date: '10-07' },
        { label: '法务审核', status: 'todo', actor: '法务部' },
        { label: '归档', status: 'todo', actor: '采购部' },
      ],
      context: {
        chats: [
          {
            title: '供应商引入-技术评审组',
            excerpt: '张伟：PCIe 协议与现网 H100 集群兼容，建议有条件通过。',
            time: '昨天 16:21',
          },
          {
            title: '供应商引入-技术评审组',
            excerpt: '赵磊：交付周期 18 天偏紧，需补充备件清单与备机方案。',
            time: '昨天 17:04',
          },
        ],
        mails: [
          {
            title: '评分表-凌云智算-PO8821.xlsx',
            from: '采购助理 · 周敏',
            excerpt: '三位评委评分已汇总，平均 82.6 分，附原始评分表。',
            time: '今天 09:12',
          },
        ],
        meetings: [
          {
            title: '技术评审会纪要 · PO-INTRO-2026-8821',
            excerpt: '结论倾向：有条件通过；待补安全扫描报告与备件清单。',
            time: '10-05 14:00',
          },
        ],
      },
    },
  },
  {
    id: 't5',
    title: '任职资格答辩 · 材料规范性审核',
    subtitle: 'P6 晋升 · 刘洋（研发中心）',
    domain: 'HR',
    pri: 'mid',
    due: '10-09',
    agent: true,
    relation: 'mine_todo',
    state: 'pending',
    app: 'W3',
    url: 'https://w3.internal/hr/qualify/HT-LY-2026-Q4',
    flow: {
      nodes: [
        { label: '材料提交', status: 'done', actor: '刘洋', date: '10-01' },
        { label: '材料规范性审核', status: 'current', actor: '我' },
        { label: '答辩安排', status: 'todo', actor: '何静' },
      ],
    },
  },
  {
    id: 't6',
    title: '会议室确认 · 行政确认',
    subtitle: 'A3-12 · 周四 14:00 凌云智算技术评审会',
    domain: '行政',
    pri: 'low',
    due: '明天 10:00',
    agent: true,
    relation: 'mine_todo',
    state: 'pending',
    app: '行政门户',
    url: 'https://office.internal/room/A3-12?date=2026-10-09&slot=1400',
  },
  {
    id: 't9',
    title: '整理本周周报要点',
    subtitle: '研发中心周报 · 可手动勾选完成',
    domain: '项目协作',
    pri: 'low',
    due: '周五 18:00',
    agent: true,
    relation: 'mine_todo',
    state: 'pending',
    app: '工作台',
    url: '',
    kind: 'simple',
  },
  {
    id: 't7',
    title: '供应商引入采购 · 法务审核',
    subtitle: '我发起 · 当前处理人：法务部 · 合同草稿 V3',
    domain: '采购',
    pri: 'mid',
    due: '跟踪中',
    agent: false,
    relation: 'mine_initiated',
    state: 'pending',
    app: 'eBuy',
    url: 'https://ebuy.internal/po/INTRO-2026-7710',
    flow: {
      nodes: [
        { label: '立项申请', status: 'done', actor: '赵敏', date: '09-12' },
        { label: '商务谈判', status: 'done', actor: '周晓东', date: '09-20' },
        { label: '技术评审', status: 'done', actor: '我', date: '09-29' },
        { label: '法务审核', status: 'current', actor: '法务部' },
        { label: '归档', status: 'todo', actor: '采购部' },
      ],
    },
  },
  {
    id: 't8',
    title: '差旅费报销 · 财务复核',
    subtitle: '我发起 · 杭州客户驻场 · EXP-20260922-0831',
    domain: '报销',
    pri: 'low',
    due: '跟踪中',
    agent: false,
    relation: 'mine_initiated',
    state: 'pending',
    amount: '¥3,280.00',
    app: '费控',
    url: 'https://fee.internal/expense/EXP-20260922-0831',
    flow: {
      nodes: [
        { label: '提单', status: 'done', actor: '我', date: '09-22' },
        { label: '主管审批', status: 'done', actor: '林海', date: '09-23' },
        { label: '财务复核', status: 'current', actor: '财务共享中心' },
      ],
    },
  },
]

export const initialArchived: Todo[] = [
  {
    id: 'a1',
    title: '加班餐补 · 主管审批',
    subtitle: '2026-09 批次 · 研发中心 12 人',
    domain: '报销',
    pri: 'low',
    due: '已完成',
    agent: true,
    relation: 'mine_todo',
    state: 'done',
    execBy: 'mix',
    amount: '¥1,680.00',
    app: 'W3',
    url: 'https://w3.internal/approve/MEAL-202609-RND',
  },
  {
    id: 'a2',
    title: '培训报名 · 部门确认',
    subtitle: 'AI 产品工作坊 · 陈华明',
    domain: 'HR',
    pri: 'mid',
    due: '已完成',
    agent: false,
    relation: 'mine_todo',
    state: 'done',
    execBy: 'human',
    app: 'W3',
    url: 'https://w3.internal/hr/train/AI-WS-2026-09',
  },
  {
    id: 'a3',
    title: '合同续签提醒',
    subtitle: '凌云智算框架协议到期催办邮件已起草',
    domain: '行政',
    pri: 'low',
    due: '已完成',
    agent: true,
    relation: 'mine_todo',
    state: 'done',
    execBy: 'agent',
    app: '工作台',
    url: '',
  },
]

export const initialArtifacts: Artifact[] = [
  {
    id: 'f1',
    type: 'xls',
    name: '差旅报销对照表-20261007.xlsx',
    sub: '今天 14:18 · 3 条比对',
    kind: 'doc',
    source: 'agent',
    status: 'done',
    session: '积压差旅报销过一遍',
    pages: '1 页',
    preview:
      '单号\t提单人\t发票合计\t单据金额\t结论\nEXP-20261006-1042\t张伟\t4860.00\t4860.00\t建议同意\nEXP-20261006-1108\t李思远\t12220.00\t12400.00\t需人工复核\nEXP-20261006-1115\t王俊杰\t2160.00\t2160.00\t建议同意',
  },
  {
    id: 'f2',
    type: 'doc',
    name: '技术评审意见草稿-PO8821.docx',
    sub: '今天 11:20',
    kind: 'doc',
    source: 'dialogue',
    status: 'done',
    session: '凌云智算·技术评审',
    pages: '2 页',
    preview:
      '评审结论（草稿）· PO-INTRO-2026-8821\n\n综合三位评委意见，建议「有条件通过」。\n1. PCIe 协议与现网 H100 集群兼容（张伟）\n2. 交付周期 18 天偏紧，需补充备件清单与备机方案（赵磊）\n3. 安全扫描报告待补（评审会纪要 10-05）\n\n平均分 82.6。提交前请人工确认。',
  },
  {
    id: 'f3',
    type: 'html',
    name: '评审节点进度-PO8821.html',
    sub: '今天 11:22',
    kind: 'code',
    source: 'flow',
    status: 'done',
    session: '凌云智算·技术评审',
    pages: '网页',
    preview:
      '<h2>供应商引入采购 · PO-INTRO-2026-8821</h2><p>供应商：凌云智算科技有限公司</p><p>当前节点：技术评审（陈华明）</p><p>下一节点：法务审核</p>',
  },
  {
    id: 'f4',
    type: 'ppt',
    name: '本周待办积压简报-W40.pptx',
    sub: '昨天',
    kind: 'doc',
    source: 'dialogue',
    status: 'done',
    session: '积压差旅报销过一遍',
    pages: '6 页',
    preview:
      '封面：衡台科技 · 本周待办积压简报（第 40 周）\nP2 报销积压 3 条待主管审批\nP3 采购技术评审 1 条今日截止\nP4 建议批量预审差旅后人工确认差异项',
  },
  {
    id: 'f5',
    type: 'img',
    name: '发票-李思远-深圳差旅.png',
    sub: '今天 14:05 · 1280×720',
    kind: 'img',
    source: 'local',
    status: 'done',
    session: '积压差旅报销过一遍',
    pages: '1280×720',
    preview:
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <rect width="640" height="400" fill="#f7f4ee"/>
  <rect x="48" y="36" width="544" height="328" rx="12" fill="#fff" stroke="#d8d2c6"/>
  <text x="72" y="78" font-family="sans-serif" font-size="20" fill="#1a2e24" font-weight="700">增值税电子普通发票</text>
  <text x="72" y="112" font-family="sans-serif" font-size="13" fill="#6b7a72">销方：深圳云途商旅有限公司 · 购方：衡台科技有限公司</text>
  <line x1="72" y1="132" x2="568" y2="132" stroke="#ebe4d6"/>
  <text x="72" y="168" font-family="sans-serif" font-size="14" fill="#3d5348">项目：差旅 · 深圳大客户拜访</text>
  <text x="72" y="198" font-family="sans-serif" font-size="14" fill="#3d5348">价税合计：¥12,220.00</text>
  <text x="72" y="228" font-family="sans-serif" font-size="14" fill="#3d5348">开票日期：2026-10-02 · 发票代码 04403260××××</text>
  <text x="72" y="258" font-family="sans-serif" font-size="13" fill="#6b7a72">关联单据：EXP-20261006-1108 · 提单人李思远</text>
  <rect x="72" y="288" width="160" height="48" rx="8" fill="#e8f6ee"/>
  <text x="92" y="318" font-family="sans-serif" font-size="13" fill="#1f6b4a">OCR 已识别</text>
</svg>`),
  },
]

export const appShortcuts = [
  { id: 'w3', name: 'W3 审批', url: 'https://w3.internal/todo', desc: '待我审批 / 我的申请' },
  { id: 'ebuy', name: 'eBuy 采购', url: 'https://ebuy.internal', desc: '供应商与订单' },
  { id: 'fee', name: '费控报销', url: 'https://fee.internal', desc: '发票与单据' },
  { id: 'oa', name: '行政门户', url: 'https://office.internal', desc: '会议室 / 资源' },
]

export const suggestions = [
  '帮我把积压的差旅报销都过一遍',
  '协同处理凌云智算的技术评审',
  '看看我发起的流程卡在哪',
  '把这个页面里待审批的条目核对一下',
  '刚刚核对出的差异有哪些',
]

export const sessionSeeds: Record<string, { role: 'user' | 'agent' | 'system'; text: string; time: string }[]> = {
  s1: [],
  s2: [
    {
      role: 'user',
      text: '帮我看一下凌云智算 PO-INTRO-2026-8821 的技术评审卡在哪',
      time: '11:03:12',
    },
    {
      role: 'agent',
      text: '当前节点是技术评审，负责人是你（陈华明）。点协同处理后我会抽取群聊与评分表，停在提交结论前。',
      time: '11:03:20',
    },
  ],
  s3: [
    { role: 'user', text: '周四 14:00 评审会和另一个会冲突了', time: '昨天 18:40' },
    {
      role: 'agent',
      text: '行政确认待办在流程活动里（A3-12）。会议室确认是你的待办，可协同处理；改期需你确认，我只能起草提醒。',
      time: '昨天 18:41',
    },
  ],
}
