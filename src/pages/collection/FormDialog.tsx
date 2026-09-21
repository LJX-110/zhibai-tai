/**
 * 藏 · 新藏品 / 改藏品表单弹窗
 * 受控表单：状态由页面持有（表单与保存逻辑同源，避免两处各存一份）。
 */
import { Button, Dialog, Input, Select, Textarea } from '../../components/ui'
import type { CollectionItem } from '../../types/entities'
import { typeLabel, type FormState } from './shared'

export function CollectionFormDialog({
  open,
  onClose,
  editing,
  form,
  onForm,
  mediums,
  categories,
  onSave,
}: {
  open: boolean
  onClose: () => void
  editing: CollectionItem | null
  form: FormState
  onForm: (next: FormState) => void
  /** 介质清单（categories 表 collection_medium scope，可增删、跨设备同步） */
  mediums: string[]
  /** 用途分类清单（collection scope） */
  categories: string[]
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? '改藏品' : '新藏品'}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={onSave} disabled={!form.title.trim()}>保存</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input autoFocus placeholder="标题" value={form.title} onChange={(e) => onForm({ ...form, title: e.target.value })} />
        {/* 两个下拉此前没有任何标签，窄屏上分不清哪个是哪个 —— 显式标注「介质 / 用途」。
            介质已数据化：选项来自 categories 表（可在「管理分类」里增删、跨设备同步），
            不再是写死的枚举。两个维度仍互不共用数据 —— 共用了就会出现两个同名下拉。 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-faint">介质</span>
            <Select value={form.type} onChange={(e) => onForm({ ...form, type: e.target.value })}>
              {/* 存量旧记录里可能还是枚举键（novel）或已被删掉的介质名 ——
                  补一个同名选项，免得下拉显示空白、一保存就把原值改没 */}
              {form.type && !mediums.includes(form.type) && (
                <option value={form.type}>{typeLabel(form.type)}（已停用）</option>
              )}
              {mediums.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-faint">用途</span>
            <Select value={form.category} onChange={(e) => onForm({ ...form, category: e.target.value })}>
              <option value="">不分类</option>
              {categories.filter((c) => c !== '其他').map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input placeholder="#标签" value={form.tags} onChange={(e) => onForm({ ...form, tags: e.target.value })} />
          <Input placeholder="评分 0-5" type="number" min={0} max={5} step={0.5} value={form.rating} onChange={(e) => onForm({ ...form, rating: e.target.value })} />
        </div>
        <Input placeholder="状态，如 在读 / 追更" value={form.status} onChange={(e) => onForm({ ...form, status: e.target.value })} />
        <Input placeholder="URL（可选）" value={form.url} onChange={(e) => onForm({ ...form, url: e.target.value })} />
        <Textarea placeholder="简介（可选）" value={form.description} onChange={(e) => onForm({ ...form, description: e.target.value })} />
        <Textarea placeholder="备注（可选）" value={form.notes} onChange={(e) => onForm({ ...form, notes: e.target.value })} />
      </div>
    </Dialog>
  )
}
