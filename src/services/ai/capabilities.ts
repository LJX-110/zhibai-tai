/**
 * AI 高层能力 —— summarize / classify / tag / rank / extract / toInspiration /
 * toTask / projectSummary / studyPlan / dailyBrief / overviewBrief / ask /
 * taskDecompose / analyzeCollection / occultExplain / dailySignReading / weeklyReport
 *
 * 每个方法都是「远程优先、本地兜底」：Provider 为远程且可用时走模型生成，
 * 失败或未启用时回退到本地规则实现。Provider 本体见同目录 provider.ts。
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：从 ai-service.ts 原样搬出，
 * ai-service.ts 仍从原路径 re-export，外部调用方无需改动。
 */
import type { IntelligenceItem, Note, Project, Task } from '../../types/entities'
import { createId, toISODate } from '../../utils/id'
import { markAiRemoteDegraded, markAiRemoteReady, reasonOf } from './health'
import type { AIProvider } from './provider'
import { localProvider } from './provider'
import { currentStreamSink } from './stream-sink'

export interface AIService {
  provider: AIProvider
  /** 切换 Provider（本地 / 远程） */
  use(provider: AIProvider): void
  /** 摘要 */
  summarize(item: IntelligenceItem): Promise<string>
  /** 情报中文摘要（可翻译外文 → 中文概括） */
  translateSummary(item: IntelligenceItem): Promise<string>
  /** 情报问答：基于近期情报用中文回答用户问题，附来源标题 */
  queryIntelligence(
    question: string,
    items: IntelligenceItem[],
  ): Promise<{ answer: string; sources: string[] }>
  /** 自动分类 */
  classify(item: IntelligenceItem): Promise<string>
  /** 打标签 */
  tag(item: IntelligenceItem): Promise<string[]>
  /** 重要性 0-1 */
  rank(item: IntelligenceItem): Promise<number>
  /** 提取（实体/关键词/数字） */
  extract(text: string): Promise<{ keywords: string[]; entities: string[]; numbers: number[] }>
  /** 情报 → 灵感草稿 */
  toInspiration(item: IntelligenceItem): Promise<Note>
  /** 情报 → 任务草稿 */
  toTask(item: IntelligenceItem): Promise<Task>
  /** 项目摘要 */
  projectSummary(p: Pick<Project, 'name' | 'description' | 'stack' | 'milestones' | 'status' | 'progress'>): Promise<string>
  /** 学习计划（按课程/作业/考试 + 目标生成） */
  studyPlan(input: { courses: { name: string }[]; undone: number; exams: { title: string; date: string }[]; goal?: string }): Promise<string>
  /** 今日简报 */
  dailyBrief(input: { date: string; tasksDone: number; focusMin: number; waterMl: number; goal: number; sources: { label: string; value: number }[] }): Promise<string>
  /** 首页「今日炁象」一句话简报 */
  overviewBrief(input: {
    tasksToday: number
    classesToday: number
    dueSoon: number
    focusMin: number
  }): Promise<string>
  /** 自由问答（走当前 Provider，远程就绪则用远程） */
  ask(prompt: string): Promise<string>
  /** 任务拆解（目标 → 步骤列表） */
  taskDecompose(goal: string): Promise<string>
  /** 收藏分析（简介/标签/分类/收藏原因） */
  analyzeCollection(item: { title: string; type: string; category?: string; tags: string[] }): Promise<{ description: string; tags: string[]; category: string; reason: string }>
  /** 术数解释（AI 只解释，不决定卦象/盘面；支持占问之事） */
  occultExplain(kind: 'liuyao' | 'qimen' | 'meihua' | 'daily_sign' | 'dayan', data: string, question?: string): Promise<string>
  /** 每日签个性化解读（结合今日数据；远程就绪走模型，否则本地拼装） */
  dailySignReading(sign: { title: string; text: string; tag: string; advice: string }, stats: { tasksDone: number; focusMin: number; waterMl: number }): Promise<string>
  /** 今日炁象周报（一周复盘：亮点 / 短板 / 下周一条可执行建议） */
  weeklyReport(input: { range: string; tasksDone: number; focusMin: number; creations: number; topActivity: string[] }): Promise<string>
}

/**
 * 远程优先、本地兜底：当已启用远程 Provider 时走模型生成，
 * 失败或未启用时回退到本地规则实现（结构化方法）。
 *
 * ⚠️ 兜底本身是**对的**（总比报错强），但失败必须留痕 —— 见 `markAiRemoteDegraded`：
 * `degraded` 是可订阅状态，天机面板据此显示「远程异常」，用户才知道自己看到的是
 * 本地兜底结果而不是模型输出。此前这里只是一个 `.catch(() => local())`，
 * 远程挂了界面上毫无痕迹。
 *
 * 流式：作用域内声明了 sink（见 stream-sink.ts）且 Provider 支持流式时改走
 * `completeStream`，增量转给 sink —— 但**最终返回值仍是完整字符串**，与一次性调用
 * 逐字相同（两者都来自同一个累加器，见 stream-assembly.ts）。
 */
function remoteOr(prompt: string, local: () => string): Promise<string> {
  const p = aiService.provider
  const sink = currentStreamSink()
  if (p.id === 'remote' && p.available()) {
    const run =
      sink && p.completeStream
        ? p.completeStream(prompt, sink.onDelta, sink.signal)
        : p.complete(prompt)
    return run.then(
      (text) => {
        markAiRemoteReady()
        return text
      },
      (err: unknown) => {
        // 用户主动中止不是失败：不标 degraded、**也不降级** ——
        // 中止之后突然冒出一段本地生成的"回答"，比没有回答更糟（tianji-ask 同一条规则）
        if (isAbortError(err)) throw err
        markAiRemoteDegraded(reasonOf(err))
        const text = local()
        // 兜底文本也走一次 sink：本地路径通常瞬间完成，若不喂增量，
        // 预览区会一直停在"推演中"直到结果突然整个出现
        sink?.onDelta(text)
        return text
      },
    )
  }
  const text = local()
  sink?.onDelta(text)
  return Promise.resolve(text)
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

export const aiService: AIService = {
  provider: localProvider,

  // 用箭头函数 + 显式引用对象，而不是「方法简写 + this」：
  // 方法简写依赖调用时的 this —— 解构或透传（const { use } = aiService）会丢绑定。
  use: (provider) => {
    aiService.provider = provider
  },

  summarize: (item) =>
    remoteOr(
      `请用 1-2 句中文为以下情报写摘要（不超过 80 字）：\n标题：${item.title}\n内容：${item.summary ?? ''}`,
      () => {
        const body = item.summary ?? item.title
        return body.length > 120 ? `${body.slice(0, 120)}…` : body
      },
    ),

  translateSummary: (item) =>
    remoteOr(
      `以下情报可能为外文。请先将其标题与摘要译为流畅中文，再用不超过 120 字概括要点：\n标题：${item.title}\n内容：${item.summary ?? ''}`,
      () => {
        const body = item.summary ?? item.title
        return body.length > 140 ? `${body.slice(0, 140)}…` : body
      },
    ),

  queryIntelligence: async (question, items) => {
    const top = items.slice(0, 12)
    const ctx = top
      .map((i, idx) => `${idx + 1}. [${i.source}] ${i.title}${i.summary ? '：' + i.summary.slice(0, 120) : ''}`)
      .join('\n')
    const prompt = `用户问题：${question}\n以下是近期情报（来源 + 标题 + 摘要）：\n${ctx}\n\n请从中挑出与问题最相关的 3-5 条，先用 1-2 句中文给出结论，再分条列出相关情报（每条含来源与一句话要点）。若都不相关，如实说明。`
    const answer = await remoteOr(prompt, () => {
      if (top.length === 0) return '暂无相关情报可参考。'
      return `问题：${question}\n\n从近期 ${top.length} 条情报看，最相关的是：\n${top
        .slice(0, 3)
        .map((i) => `· ${i.title}（${i.source}）`)
        .join('\n')}\n\n（接入远程 AI 后可获得更贴合问题的分析与总结）`
    })
    return { answer, sources: top.slice(0, 5).map((i) => i.title) }
  },

  classify: (item) =>
    remoteOr(
      `为以下情报给一个分类（限一个词，如：AI/开发/GitHub/游戏/动漫/科技/影视/学习/其他）：\n标题：${item.title}\n内容：${(item.summary ?? '').slice(0, 120)}`,
      () => item.category ?? '自定义',
    ),

  tag: async (item) => {
    const set = new Set<string>([
      ...item.tags,
      item.sourceType === 'github' ? 'github' : '',
      item.sourceType === 'game' ? '游戏' : '',
      item.sourceType === 'anime' ? '动漫' : '',
    ].filter(Boolean))
    return [...set].slice(0, 6)
  },

  rank: async (item) => {
    // 本地启发式：关注/未读/带图/来源加权
    let s = 0.3
    if (!item.read) s += 0.2
    if (item.favorite) s += 0.2
    if (item.image) s += 0.15
    if (item.sourceType === 'github' || item.sourceType === 'game') s += 0.15
    return Math.min(1, Math.round(s * 10) / 10)
  },

  extract: async (text) => {
    const seg = text.replace(/[，。；、,.!?！？\s]+/g, ' ')
    const words = seg.split(' ').filter((w) => w.length >= 2 && w.length <= 8)
    const freq = new Map<string, number>()
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)
    const keywords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w)
    const entities = keywords.filter((w) => /[\u4e00-\u9fa5]{2}/.test(w)).slice(0, 5)
    const numbers = (text.match(/\d+(\.\d+)?/g) ?? []).map(Number).slice(0, 6)
    return { keywords, entities, numbers }
  },

  toInspiration: async (item) => {
    const now = new Date().toISOString()
    return {
      id: createId(),
      kind: 'inspiration',
      title: item.title,
      body: item.summary ?? '',
      tags: [...item.tags, item.source],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    }
  },

  toTask: async (item) => {
    const now = new Date().toISOString()
    return {
      id: createId(),
      title: item.title,
      description: item.summary ?? '',
      done: false,
      priority: 'mid',
      dueDate: null,
      tags: item.tags,
      repeat: 'none',
      projectId: null,
      courseId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }
  },

  projectSummary: (p) =>
    remoteOr(
      `请为项目「${p.name}」生成 3-4 句中文简介（含技术栈、里程碑、当前状态）：\n简介：${p.description ?? '无'}\n技术栈：${p.stack.slice(0, 6).join('、') || '无'}\n状态：${p.status} 进度 ${p.progress}%`,
      () => {
        const parts: string[] = []
        parts.push(`「${p.name}」：${p.description || '暂无简介'}`)
        if (p.stack.length > 0) parts.push(`技术栈：${p.stack.slice(0, 6).join('、')}`)
        if (p.milestones.length > 0) parts.push(`里程碑 ${p.milestones.length} 个：${p.milestones.slice(0, 3).map((m) => m.title).join('、')}`)
        parts.push(`状态 ${p.status} · 进度 ${p.progress}%`)
        return parts.join('\n')
      },
    ),

  studyPlan: ({ courses, undone, exams, goal }) => {
    const ctx = `课程 ${courses.length} 门（${courses.slice(0, 6).map((c) => c.name).join('、')}）· 未交作业 ${undone} 项 · 考试 ${exams.length} 场${exams.length > 0 ? `（最近：${[...exams].sort((a, b) => a.date.localeCompare(b.date))[0].title}）` : ''}`
    const prompt = goal
      ? `目标：${goal}。请基于以下情况生成一份可执行的中文学习计划（3-4 步，含每日安排）：${ctx}`
      : `请基于以下情况生成一份可执行的中文学习计划（3-4 步，含每日安排）：${ctx}`
    return remoteOr(prompt, () => {
      const lines: string[] = []
      if (goal) lines.push(`目标：${goal}`)
      lines.push(`课程 ${courses.length} 门 · 未交作业 ${undone} 项 · 考试 ${exams.length} 场`)
      if (exams.length > 0) {
        const sorted = [...exams].sort((a, b) => a.date.localeCompare(b.date))
        lines.push(`最近考试：${sorted[0].title}（${sorted[0].date}）`)
        lines.push('建议：优先复习临近考试科目，每日 1-2 个番茄钟。')
      } else if (undone > 0) {
        lines.push(`尚有 ${undone} 项作业未交，建议先清作业再安排复习。`)
      } else {
        lines.push('本周暂无紧迫安排，可按课程表规律学习。')
      }
      if (goal) lines.push('拆解：把目标按天拆成 3 个小步骤，每天完成 1 步并记录到「行」。')
      return lines.join('\n')
    })
  },

  dailyBrief: ({ date, tasksDone, focusMin, waterMl, goal, sources }) =>
    remoteOr(
      `今天是 ${date}。已完成 ${tasksDone} 项任务，专注 ${focusMin} 分钟，饮水 ${waterMl}/${goal}ml。今日炁象来源：${sources.map((s) => `${s.label}+${s.value}`).join('，')}。请用 2-3 句中文生成今日简报与一句建议。`,
      () => {
        const lines: string[] = []
        lines.push(`${date} · 今日完成 ${tasksDone} 项，专注 ${focusMin} 分钟，饮水 ${waterMl}/${goal}ml`)
        if (sources.length > 0) {
          lines.push(`今日炁象来源：${sources.map((s) => `${s.label}+${s.value}`).join('，')}`)
        }
        if (focusMin >= 100) lines.push('专注充足，注意劳逸结合。')
        else if (focusMin >= 50) lines.push('专注尚可，可再推进一段。')
        else lines.push('今日专注较少，可安排一段整块时间。')
        return lines.join('\n')
      },
    ),

  overviewBrief: ({ tasksToday, classesToday, dueSoon, focusMin }) =>
    remoteOr(
      `今天是 ${toISODate(new Date())}。今日待办 ${tasksToday} 件，课程 ${classesToday} 节，临近到期 ${dueSoon} 件，已专注 ${focusMin} 分钟。请用一句话中文概括今天需要关注的事情。`,
      () => {
        const points: string[] = []
        if (tasksToday > 0) points.push(`${tasksToday} 件今日任务待办`)
        if (classesToday > 0) points.push(`${classesToday} 节课`)
        if (dueSoon > 0) points.push(`${dueSoon} 件临近到期`)
        if (points.length === 0) points.push('今日暂无紧迫安排，可从一件小事开始')
        let head = `今天有 ${points.length} 件需要关注的事情：${points.join('、')}。`
        if (focusMin > 0) head += ` 已专注 ${focusMin} 分钟。`
        else head += ' 尚未开始专注，建议先安排一段整块时间。'
        return head
      },
    ),

  /** 自由问答不兜底：用户主动发问时，「答不上来」比「拿一段模板糊弄」诚实得多 */
  ask: async (prompt) => {
    const p = aiService.provider
    try {
      const text = await p.complete(prompt)
      if (p.id === 'remote') markAiRemoteReady()
      return text
    } catch (err) {
      if (p.id === 'remote') markAiRemoteDegraded(reasonOf(err))
      throw err
    }
  },

  taskDecompose: (goal) =>
    remoteOr(
      `请把目标「${goal}」拆解为 3-4 个可执行的中文小步骤（每步一行，含预计耗时）。`,
      () =>
        [
          `目标：${goal}`,
          '拆解为 3-4 个小步骤：',
          '1. 明确范围与交付物',
          '2. 拆出 3 个里程碑（各 1-2 天）',
          '3. 把第一步记入「行」并开始执行',
          '4. 完成后复盘并更新进度',
        ].join('\n'),
    ),

  analyzeCollection: async (item) => {
    // 本地轻量整理：远程 Provider 就绪后可由模型生成更自然的简介
    const base = item.title
    const tags = [...new Set([...item.tags, item.type])].slice(0, 5)
    return {
      description: `${base}${item.category ? `（${item.category}）` : ''}。`,
      tags,
      category: item.category ?? item.type,
      reason: `收藏「${base}」，按 ${item.type} 归类。`,
    }
  },

  occultExplain(kind: 'liuyao' | 'qimen' | 'meihua' | 'daily_sign' | 'dayan', data: string, question?: string): Promise<string> {
    // AI 只负责解释，不生成卦象/盘面；可结合占问之事给现代解读
    const q = question?.trim()
    const head = q ? `占问之事：${q}。` : ''
    const prompts: Record<typeof kind, string> = {
      liuyao: `${head}以下是一组六爻排盘结果。请先 1-2 句概述卦象与动爻指向，再用现代人话给 3-5 句解读与可执行建议（克制理性，不编造绝对吉凶）。\n${data}`,
      qimen: `${head}以下是一组奇门盘（简化占法）。请先 1-2 句概述盘面（值符值使/宫位指向），再用现代人话给 3-5 句解读与可执行建议（克制理性，不编造绝对吉凶）。\n${data}`,
      meihua: `${head}以下是一组梅花易数排盘（本卦/互卦/变卦与体用生克）。请先 1-2 句概述体用格局与吉凶倾向，再针对占问之事用现代人话给 3-5 句解读与可执行建议（克制理性，不编造绝对吉凶）。\n${data}`,
      dayan: `${head}以下是大衍筮法所得之卦（含动爻）。请先 1-2 句结合卦辞概述卦意，再针对占问之事用现代人话给 3-5 句解读与可执行建议（克制理性，不编造绝对吉凶）。\n${data}`,
      daily_sign: `${head}以下是今日签与用户今日的真实数据。请把签文建议与用户当日实际状态结合起来，用 2-3 句中文给出贴身的个性化解读（不重复签文原文，克制不说教）。\n${data}`,
    }
    return remoteOr(prompts[kind], () => `结构要点：\n${data}${q ? `\n\n（针对「${q}」的现代解读需接入远程 AI）` : ''}`)
  },

  dailySignReading(sign, stats) {
    const data = `签：${sign.title}（${sign.tag}）· ${sign.text} · 建议：${sign.advice}\n今日数据：完成任务 ${stats.tasksDone} 项，专注 ${stats.focusMin} 分钟，饮水 ${stats.waterMl}ml。`
    return remoteOr(data, () => {
      const parts: string[] = []
      if (stats.focusMin >= 50) parts.push('今日专注已经不短，签中「守」字正合收势。')
      else if (stats.tasksDone === 0) parts.push('今日尚未动笔，签意正好用来开局。')
      else parts.push('今日节奏平缓，按签中建议稳步推进即可。')
      return `${sign.advice} ${parts.join(' ')}`
    })
  },

  weeklyReport({ range, tasksDone, focusMin, creations, topActivity }) {
    const data = `${range}：完成待办 ${tasksDone} 项，专注 ${focusMin} 分钟，新增灵感/收藏 ${creations} 条，高频活动：${topActivity.join('、') || '无'}。`
    return remoteOr(
      `${data}请用中文写一份 3-4 句的周报复盘：先肯定一个亮点，再指出一个短板，最后给一条下周可执行的具体建议（务实，不说空话）。`,
      () => {
        const lines: string[] = []
        lines.push(`本周完成待办 ${tasksDone} 项、专注 ${focusMin} 分钟${creations ? `，新增记录 ${creations} 条` : ''}。`)
        if (focusMin >= 200) lines.push('专注状态很好，节奏已经立住了。')
        else lines.push('专注还有空间，下周试着留出两段不受打扰的整块时间。')
        if (topActivity.length > 0) lines.push(`精力主要花在：${topActivity.join('、')}。`)
        return lines.join('\n')
      },
    )
  },
}
