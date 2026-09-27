/**
 * 学 · 学分选课的条目弹窗（新增 / 编辑同体）
 *
 * 从 `CoursePlanTab` 抽出（那一页已顶到 400 行上限）。
 * 只负责"把草稿改好并交回去"，落库由调用方做 —— 弹窗不该知道 store 的存在。
 */
import { Button, Dialog, Input, Select } from '../../components/ui'
import type { CoursePlanKind, CoursePlanStatus } from '../../types/entities'
import { KIND_LABEL, KIND_ORDER, STATUS_LABEL, type PlanDraft } from './plan-shared'

export function PlanDialog({
  draft,
  editing,
  onDraft,
  onClose,
  onSave,
}: {
  /** null = 弹窗关着 */
  draft: PlanDraft | null
  editing: boolean
  onDraft: (d: PlanDraft) => void
  onClose: () => void
  onSave: () => void
}) {
  if (!draft) return null
  const set = (patch: Partial<PlanDraft>) => onDraft({ ...draft, ...patch })
  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? '改条目' : '加一条'}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={onSave}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* ⚠️ 这里收的是**课程名**。只有教师姓名（"蔡军""杜娟"）的内容请写进「选课事项」 */}
        <Input
          autoFocus
          placeholder="课程名"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={draft.kind}
            onChange={(e) => set({ kind: e.target.value as CoursePlanKind })}
            aria-label="方向"
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
          <Select
            value={draft.status}
            onChange={(e) => set({ status: e.target.value as CoursePlanStatus })}
            aria-label="状态"
          >
            {(Object.keys(STATUS_LABEL) as CoursePlanStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            min={0}
            step={0.5}
            placeholder="学分（可留空）"
            value={draft.credit}
            onChange={(e) => set({ credit: e.target.value })}
          />
          <Input
            placeholder="教师（可留空）"
            value={draft.teacher}
            onChange={(e) => set({ teacher: e.target.value })}
          />
        </div>
        {/* 分组只对公选有意义（限选 / 体育没有"官方分类"这个概念） */}
        {draft.kind === 'public' && (
          <Input
            placeholder="分类（如：文化传承与安全教育）"
            value={draft.group}
            onChange={(e) => set({ group: e.target.value })}
          />
        )}
        <Input
          placeholder="备注（可留空）"
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>
    </Dialog>
  )
}
