/**
 * 情报源 · 新增 / 编辑表单弹窗
 */
import type { IntelligenceProviderId } from '../../types/entities'
import { Button, Dialog, Input, Select } from '../ui'
import { CONFIG_HINT, NEEDS_URL, PROVIDER_LABEL, PROVIDER_ORDER, type FormState } from './shared'

export function SourceFormDialog({
  open,
  onClose,
  editing,
  form,
  onForm,
  categories,
  onSave,
}: {
  open: boolean
  onClose: () => void
  editing: boolean
  form: FormState
  onForm: (next: FormState) => void
  categories: string[]
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? '改情报源' : '新增情报源'}
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
          <Select value={form.provider} onChange={(e) => onForm({ ...form, provider: e.target.value as IntelligenceProviderId })}>
            {PROVIDER_ORDER.map((p) => (
              <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
            ))}
          </Select>
          <Select value={form.category} onChange={(e) => onForm({ ...form, category: e.target.value })} aria-label="分类">
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
        {/* 只有这几个 Provider 靠 url 工作。json/rest/web 此前没有地址输入框 ——
            建出来的源必然空跑（永远「成功但 0 条」），用户却以为是网络问题 */}
        {NEEDS_URL.includes(form.provider) && (
          <Input placeholder="抓取地址 URL" value={form.url} onChange={(e) => onForm({ ...form, url: e.target.value })} />
        )}
        {CONFIG_HINT[form.provider] && (
          <Input
            placeholder={CONFIG_HINT[form.provider]}
            value={form.config}
            onChange={(e) => onForm({ ...form, config: e.target.value })}
            className="font-mono !text-xs"
          />
        )}
        <p className="text-xs text-ink-faint">
          Steam/Jikan 无需 Key（Steam 需 App ID）；RAWG 需在配置填 key（绝不写源码）。GitHub 用公共搜索 API；B 站须先配置上方「自建代理」。
        </p>
      </div>
    </Dialog>
  )
}
