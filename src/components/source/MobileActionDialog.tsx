/**
 * 情报源 · 手机端单源操作弹层（整行按钮摊不开，改为弹层集中承载）
 */
import { Pencil, Power, Trash2, Zap } from 'lucide-react'
import type { IntelligenceSource } from '../../types/entities'
import { Button, Dialog } from '../ui'

export function MobileActionDialog({
  source,
  onClose,
  onTest,
  onToggle,
  onEdit,
  onRemove,
}: {
  source: IntelligenceSource | null
  onClose: () => void
  onTest: (s: IntelligenceSource) => void
  onToggle: (s: IntelligenceSource) => void
  onEdit: (s: IntelligenceSource) => void
  onRemove: (s: IntelligenceSource) => void
}) {
  return (
    <Dialog open={source != null} onClose={onClose} title={source?.name}>
      {source && (
        <div className="space-y-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              const s = source
              onClose()
              onTest(s)
            }}
          >
            <Zap size={14} /> 测试连接
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              const s = source
              onClose()
              onToggle(s)
            }}
          >
            <Power size={14} /> {source.enabled ? '停用该源' : '启用该源'}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              const s = source
              onClose()
              onEdit(s)
            }}
          >
            <Pencil size={14} /> 编辑配置
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              const s = source
              onClose()
              onRemove(s)
            }}
          >
            <Trash2 size={14} /> 删除该源
          </Button>
        </div>
      )}
    </Dialog>
  )
}
