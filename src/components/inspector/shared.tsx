/**
 * Inspector · 共用骨架（标题栏 / 状态区 / 操作区 / 空态）
 * 各实体详情都套这几层，保证"标题 → 状态 → 核心信息 → 操作"的结构一致。
 */
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function InspectorShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="eyebrow text-ink-faint">{title}</span>
        <button onClick={onClose} className="touch-target flex items-center justify-center rounded-control p-1 text-ink-muted hover:bg-raised hover:text-ink" aria-label="关闭">
          <X size={15} />
        </button>
      </div>
      {children}
    </div>
  )
}

/** 状态/标签区 */
export function MetaSection({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-1.5">{children}</div>
}

/** 操作区 */
export function ActionSection({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex gap-2 border-t border-line pt-4">{children}</div>
}

export function EmptyInspector({ onClose }: { onClose: () => void }) {
  return (
    <InspectorShell title="详情" onClose={onClose}>
      <p className="py-6 text-center text-sm text-ink-faint">该项已不存在</p>
    </InspectorShell>
  )
}
