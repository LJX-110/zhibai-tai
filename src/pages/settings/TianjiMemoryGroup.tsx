/**
 * 设置 · 天机记忆（Step 4-2 · C9/C10；2026-10-01 独立成「AI 记忆」段）
 *
 * ## 界面要回答的问题
 * 「**天机记住了什么**」——每条记忆可**查看 / 编辑 / 删除 / 停用**（规格 §C9）。
 * 停用只影响"是否注入上下文"，数据保留；删除走墓碑（随快照传播）。
 *
 * ## 两条纪律
 *  · **不偷偷写入**：这里只有你自己加的内容；天机不会把聊天自动存成记忆
 *    （所以没有"自动记录"开关 —— 那正是要避免的默认行为）；
 *  · **就地编辑**：文本与标签都是输入框，改完失焦即落库（无"编辑模式"，少一层操作）。
 *
 * ## 形制（2026-10-02 版式统一）
 * 新增行收入 `SettingsPanel`（与 AI 页其它段同一套行式）；记忆条目本身是"可操作的
 * 列表行"，保持既有 `.row` 形制不变。
 */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Input, Section, Switch, useToast } from '../../components/ui'
import { SettingsPanel, SettingsRow } from './SettingsRow'
import { makeMemory, useMemoryStore } from '../../stores/useMemoryStore'
import { nowISO } from '../../utils/id'

export function TianjiMemoryGroup() {
  const items = useMemoryStore((s) => s.items)
  const save = useMemoryStore((s) => s.save)
  const update = useMemoryStore((s) => s.update)
  const remove = useMemoryStore((s) => s.remove)
  const toast = useToast().toast
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')

  const add = async () => {
    const t = text.trim()
    if (!t) return
    const ok = await save(makeMemory(t, tags))
    if (!ok) return
    setText('')
    setTags('')
    toast('已记住这条', 'success')
  }

  const enabled = items.filter((m) => m.enabled).length

  return (
    <Section title="AI 记忆" hint={items.length > 0 ? `${enabled}/${items.length} 条生效` : undefined}>
      <SettingsPanel>
        <SettingsRow label="新增">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
            placeholder="要让它长期记住的一句话（如：不吃香菜）"
            className="min-w-0 flex-1 basis-full sm:basis-0"
          />
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="标签（可选）"
            className="max-w-[9rem]"
            aria-label="记忆标签"
          />
          <Button size="sm" variant="secondary" onClick={() => void add()} disabled={!text.trim()}>
            <Plus size={13} /> 记住
          </Button>
        </SettingsRow>

        <div className="px-2.5 pb-2.5">
          {items.length === 0 ? (
            <p className="text-xs text-ink-faint">还没有长期记忆 —— 聊天不会被自动记下，只收手动添加的条目。</p>
          ) : (
            <div className="space-y-2">
              {items.map((m) => (
                <div key={m.id} className="row group flex-wrap">
                  <Switch
                    size="md"
                    checked={m.enabled}
                    label={`${m.text.slice(0, 8)} 记忆开关`}
                    onChange={() => void update(m.id, { enabled: !m.enabled, updatedAt: nowISO() })}
                  />
                  <Input
                    defaultValue={m.text}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (!v || v === m.text) return
                      void update(m.id, { text: v, updatedAt: nowISO() })
                    }}
                    className="min-w-0 flex-1 basis-full sm:basis-0"
                    aria-label="记忆内容"
                  />
                  <Input
                    defaultValue={m.tags.join(' ')}
                    onBlur={(e) => {
                      const next = e.target.value.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean)
                      if (next.join('|') === m.tags.join('|')) return
                      void update(m.id, { tags: next, updatedAt: nowISO() })
                    }}
                    placeholder="标签"
                    className="max-w-[9rem]"
                    aria-label="记忆标签"
                  />
                  <button
                    className="hover-reveal touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar"
                    onClick={() => {
                      void remove(m.id)
                      toast('已删除这条记忆')
                    }}
                    aria-label="删除这条记忆"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsPanel>
    </Section>
  )
}