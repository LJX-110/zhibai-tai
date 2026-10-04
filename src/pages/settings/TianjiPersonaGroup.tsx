/**
 * 设置 · 天机人设（Step 4-2 · C1/C10；2026-10-01 独立成「AI 人设」段）
 *
 * ## 界面要回答的问题
 * 「**天机是谁**」——所以这里不是"一串配置项"，而是：选一个人设、看懂它长什么样、
 * 不满意就改/换/恢复默认。人设是**用户资产**（`personas` 业务表，随快照跨设备同步）。
 *
 * ## 为什么编辑区折叠
 * 人设有 20 个字段（自称 / 性格 / 口癖 / 禁区 / UNKNOWN…）。常驻展开会把
 * 「AI 人设」段撑爆 —— 默认只看"当前是谁"，要改再展开。
 *
 * ⚠️ 草稿只在**编辑区打开时**从当前人设取一次：直接与 store 双向绑定会让每次
 * 输入都写库（人设是长文本，逐字落库既慢又脏同步标记）。
 */
import { useState } from 'react'
import { Button, Collapse, Input, Section, Select, Textarea, useToast } from '../../components/ui'
import { SettingsPanel, SettingsRow } from './SettingsRow'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { emptyPersona, resetDefaultPersona, usePersonaStore } from '../../stores/usePersonaStore'
import { PERSONA_FIELD_LABELS } from '../../services/persona/defaults'
import type { Persona } from '../../types/entities'
import { nowISO } from '../../utils/id'

export function TianjiPersonaGroup() {
  const personas = usePersonaStore((s) => s.items)
  const save = usePersonaStore((s) => s.save)
  const remove = usePersonaStore((s) => s.remove)
  const activeId = useSettingsStore((s) => s.activePersonaId)
  const set = useSettingsStore((s) => s.set)
  const toast = useToast().toast
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Persona | null>(null)
  /**
   * 草稿的来源键：`null` = 编辑区关着；`'new'` = 正在新建；其它 = 正在编辑某条人设。
   *
   * 用**渲染期守卫**同步草稿（而不是 effect 里 setState）：后者会多一轮级联渲染，
   * 也是 oxlint `set-state-in-effect` 所指的问题（项目既有同类写法）。
   * 键里带 `updatedAt`：保存后草稿自动对齐落库值，不会留着"改了没保存"的残影。
   */
  const [draftKey, setDraftKey] = useState<string | null>(null)

  const active = personas.find((p) => p.id === activeId) ?? null
  const wantKey = open ? (active ? `${active.id}:${active.updatedAt}` : 'new') : null
  if (wantKey !== draftKey) {
    setDraftKey(wantKey)
    setDraft(open ? (active ? { ...active } : emptyPersona()) : null)
  }

  const commit = async () => {
    if (!draft) return
    const name = draft.name.trim() || '未命名人设'
    const ok = await save({ ...draft, name, updatedAt: nowISO() })
    if (!ok) return
    // 新建后自动切到它 —— 否则用户改了半天的是一份"没在用"的人设
    if (draft.id !== activeId) set({ activePersonaId: draft.id })
    toast('人设已保存', 'success')
  }

  return (
    <Section title="AI 人设">
      {/* 当前人设·一行三件（2026-10-01 收口）：选择 / 新建 / 恢复默认。
          原来前面还压着一行"人设 + 恢复默认"的表头，与这行重复（用户嫌乱）。
          2026-10-02：收入面板卡，与 AI 页其它段同一套行式 */}
      <SettingsPanel>
        <SettingsRow label="当前人设">
          <Select
            value={activeId ?? ''}
            onChange={(e) => set({ activePersonaId: e.target.value || undefined })}
            className="!w-auto max-w-[200px]"
            aria-label="选择人设"
          >
            <option value="">（不使用人设）</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.builtin ? ' · 内置' : ''}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => {
              setOpen(true)
              setDraft(emptyPersona())
            }}
          >
            新建
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => void resetDefaultPersona().then(() => toast('已恢复默认人设', 'success'))}
          >
            恢复默认
          </Button>
          <span className="flex-1 text-xs text-ink-faint">
            {active ? `自称「${active.selfClaim.replace(/^[A-Z_]+_/, '').slice(0, 12)}」` : '未选择：天机用中性语气'}
          </span>
        </SettingsRow>
      </SettingsPanel>

      <Collapse title={draft && draft.id !== active?.id ? '新建人设' : '编辑人设'} open={open} onOpenChange={setOpen}>
        {draft ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="人设名"
                className="max-w-[200px]"
                aria-label="人设名"
              />
              <Button size="sm" variant="primary" onClick={() => void commit()}>
                保存
              </Button>
              {!draft.builtin && personas.some((p) => p.id === draft.id) && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    const ok = await remove(draft.id)
                    if (!ok) return
                    if (activeId === draft.id) set({ activePersonaId: undefined })
                    setOpen(false)
                    toast('人设已删除', 'success')
                  }}
                >
                  删除
                </Button>
              )}
            </div>
            <div className="grid max-w-3xl gap-3 min-[520px]:grid-cols-2">
              {PERSONA_FIELD_LABELS.map((f) => (
                <label key={String(f.key)} className="block">
                  <span className="mb-1 block text-xs text-ink-muted">{f.label}</span>
                  <Textarea
                    value={String(draft[f.key] ?? '')}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    rows={3}
                    placeholder={f.hint}
                  />
                </label>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-ink-faint">
              「未知资料」会原样交给天机，并附一条规矩：不许当成事实、不许自行补全。
            </p>
          </div>
        ) : null}
      </Collapse>
    </Section>
  )
}