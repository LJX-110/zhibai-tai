/**
 * 情报源 · 单行（桌面显示 5 个操作图标，手机只留「抓取」+「⋯」）
 */
import { Download, MoreHorizontal, Pencil, Power, Trash2, Zap } from 'lucide-react'
import type { IntelligenceSource } from '../../types/entities'
import { Badge, Button } from '../ui'
import { cn } from '../../utils/cn'
import { PROVIDER_LABEL } from './shared'

export function SourceRow({
  s,
  compact,
  testing,
  onFetch,
  onTest,
  onToggle,
  onEdit,
  onRemove,
  onMore,
}: {
  s: IntelligenceSource
  /** 手机端：一行 5 个图标必然挤成一团，只留「抓取」，其余收进 ⋯ */
  compact: boolean
  testing: boolean
  onFetch: () => void
  onTest: () => void
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
  onMore: () => void
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
      {compact ? (
        /* 手机端：一行 5 个图标必然挤成一团，只留「抓取」，其余收进 ⋯ */
        <>
          <Button size="sm" variant="tertiary" onClick={onFetch} disabled={testing} className="!px-2">
            <Download size={13} /> {testing ? '抓取中' : s.lastError ? '重试' : '抓取'}
          </Button>
          <button
            onClick={onMore}
            className="touch-target flex items-center justify-center rounded-control text-ink-muted hover:bg-raised"
            aria-label="更多操作"
          >
            <MoreHorizontal size={16} />
          </button>
        </>
      ) : (
        <>
          <Button size="sm" variant="tertiary" onClick={onFetch} disabled={testing} className="!px-2">
            <Download size={13} /> {testing ? '抓取中' : s.lastError ? '重试' : '抓取'}
          </Button>
          <Button size="sm" variant="tertiary" onClick={onTest} disabled={testing} className="!px-2">
            <Zap size={13} /> 测试
          </Button>
          <button
            onClick={onToggle}
            className={cn('rounded-control p-1.5 transition-colors', s.enabled ? 'text-teal' : 'text-ink-faint hover:text-teal')}
            aria-label={s.enabled ? '停用' : '启用'}
          >
            <Power size={14} />
          </button>
          <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised" onClick={onEdit} aria-label="编辑">
            <Pencil size={14} />
          </button>
          <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={onRemove} aria-label="删除">
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  )
}
