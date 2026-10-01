/**
 * 情报源 · 单行（桌面显示 5 个操作图标，手机只留「抓取」+「⋯」）
 */
import { RowActions } from '../ui/RowActions'
import { Download, Pencil, Power, Trash2, Zap } from 'lucide-react'
import type { IntelligenceSource } from '../../types/entities'
import { Badge, Button } from '../ui'
import { cn } from '../../utils/cn'
import { PROVIDER_LABEL } from './shared'

export function SourceRow({
  s,
  testing,
  onFetch,
  onTest,
  onToggle,
  onEdit,
  onRemove,
}: {
  s: IntelligenceSource
  testing: boolean
  onFetch: () => void
  onTest: () => void
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <div className="row group">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-tile text-xs',
          s.enabled ? 'bg-teal/10 text-teal' : 'bg-nested/60 text-ink-faint',
        )}
      >
        {PROVIDER_LABEL[s.provider]?.slice(0, 2) ?? s.provider}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 状态点：一眼分辨哪些源正常、哪些坏了。文字说明在下方，不重复占宽度 */}
          {s.enabled && (
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                s.lastError ? 'bg-cinnabar' : s.lastSuccessAt ? 'bg-teal' : 'bg-nested',
              )}
              aria-hidden
            />
          )}
          <span className={cn('text-sm font-medium', s.enabled ? 'text-ink' : 'text-ink-faint')}>
            {s.name}
          </span>
          <Badge tone="plain">{PROVIDER_LABEL[s.provider] ?? s.provider}</Badge>
          <Badge tone="teal">{s.category}</Badge>
          {!s.enabled && <Badge tone="plain">停用</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-faint">
          {s.url && <span className="hidden truncate md:inline">{s.url}</span>}
          {/* 失败时优先说失败：此时「上次成功是什么时候」才是用户用来判断
              「这源是不是已经废了」的关键信息，而不是「刚才试过了」 */}
          {s.lastError ? (
            <>
              <span className="text-cinnabar" title={s.lastError}>
                连续失败 {s.failCount ?? 1} 次 · {s.lastError.slice(0, 40)}
              </span>
              {s.lastSuccessAt && (
                <span className="tabular">上次成功 {s.lastSuccessAt.slice(0, 16).replace('T', ' ')}</span>
              )}
            </>
          ) : s.lastSuccessAt ? (
            <span className="tabular text-teal/80">
              正常 · 上次成功 {s.lastSuccessAt.slice(0, 16).replace('T', ' ')}
            </span>
          ) : (
            <span>尚未抓取</span>
          )}
        </div>
      </div>
      {/* 「抓取」是这一行最高频的动作，**始终直接可见**（主操作不进菜单）；
          其余四个（测试 / 启停 / 编辑 / 删除）走共用 `RowActions`：
          窄屏收进一个「更多」，宽屏直显。
          改前这里分两套写法各写一遍（窄屏 = 抓取 + ⋯，宽屏 = 5 个图标一排），
          而另一处（财的流水行）又写了第三套 —— 现统一为同一个组件。 */}
      <Button size="sm" variant="tertiary" onClick={onFetch} disabled={testing} className="!px-2">
        <Download size={13} /> {testing ? '抓取中' : s.lastError ? '重试' : '抓取'}
      </Button>
      <RowActions
        moreTitle={s.name}
        actions={[
          { key: 'test', label: '测试连接', icon: Zap, onClick: onTest },
          { key: 'toggle', label: s.enabled ? '停用该源' : '启用该源', icon: Power, onClick: onToggle },
          { key: 'edit', label: '编辑配置', icon: Pencil, onClick: onEdit },
          { key: 'remove', label: '删除该源', icon: Trash2, onClick: onRemove, danger: true },
        ]}
      />
    </div>
  )
}
