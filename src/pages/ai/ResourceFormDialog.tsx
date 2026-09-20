/**
 * 术 · 登记 / 编辑 AI 能力表单弹窗
 */
import { Button, Dialog, Input, Select, Textarea } from '../../components/ui'
import type { AiFormState } from './shared'

export function ResourceFormDialog({
  open,
  onClose,
  editing,
  form,
  onForm,
  types,
  onSave,
}: {
  open: boolean
  onClose: () => void
  editing: boolean
  form: AiFormState
  onForm: (next: AiFormState) => void
  types: string[]
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? '改 AI 能力' : '登记 AI 能力'}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={onSave} disabled={!form.name.trim()}>保存</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input autoFocus placeholder="名称" value={form.name} onChange={(e) => onForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Select value={form.type} onChange={(e) => onForm({ ...form, type: e.target.value })}>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Input placeholder="提供方（可选）" value={form.provider} onChange={(e) => onForm({ ...form, provider: e.target.value })} />
        </div>
        <Textarea placeholder="描述（可选）" value={form.description} onChange={(e) => onForm({ ...form, description: e.target.value })} />
        <Input placeholder="#标签" value={form.tags} onChange={(e) => onForm({ ...form, tags: e.target.value })} />
        <Textarea
          placeholder="配置 JSON（可选）"
          value={form.config}
          onChange={(e) => onForm({ ...form, config: e.target.value })}
          className="font-mono !text-xs"
        />
      </div>
    </Dialog>
  )
}
