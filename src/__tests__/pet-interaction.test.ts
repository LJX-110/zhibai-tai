/**
 * 桌宠 · 指针交互判定（点击 / 长按 / 拖拽的互斥）
 *
 * 这组用例守的是**三种行为不能互相误触**，而这里恰恰出过真问题：
 * 长按的取消判据曾因两处 ref 互相清空而永久失效 —— 判据函数本身是好的，
 * 坏的是调用它的地方拿不到"按下点"。所以判据要有单测，
 * 而"什么时候调它"收口到 `usePetDrag` 一处实现。
 */
import { describe, expect, it } from 'vitest'
import {
  DRAG_THRESHOLD,
  LONG_PRESS_SLOP,
  exceedsDragThreshold,
  resolveDragEnd,
  shouldCancelLongPress,
} from '../services/pet/interaction'

describe('exceedsDragThreshold：算不算一次拖拽', () => {
  it('阈值内不算（那是点击）', () => {
    expect(exceedsDragThreshold({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(false)
    expect(exceedsDragThreshold({ x: 100, y: 100 }, { x: 102, y: 101 })).toBe(false)
    expect(exceedsDragThreshold({ x: 100, y: 100 }, { x: 100 + DRAG_THRESHOLD, y: 100 })).toBe(false)
  })

  it('超过阈值就算（曼哈顿距离，任意方向都计入）', () => {
    expect(exceedsDragThreshold({ x: 100, y: 100 }, { x: 105, y: 100 })).toBe(true)
    expect(exceedsDragThreshold({ x: 100, y: 100 }, { x: 103, y: 103 })).toBe(true)
  })

  it('**用的是累计位移**（按下点 → 当前点）—— 慢慢挪也该算拖拽', () => {
    // 单帧只挪 2px、连挪 3 次：累计 6px > 4px
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(true)
  })
})

describe('shouldCancelLongPress：长按该不该被取消', () => {
  it('没记下按下点时不动（那是"还不知道基准"，不是"要取消"）', () => {
    expect(shouldCancelLongPress(null, { x: 999, y: 999 })).toBe(false)
  })

  it('原地不动 → 不取消（手指按着没动，就是在长按）', () => {
    expect(shouldCancelLongPress({ x: 50, y: 50 }, { x: 50, y: 50 })).toBe(false)
    expect(shouldCancelLongPress({ x: 50, y: 50 }, { x: 56, y: 50 })).toBe(false)
  })

  it('移动超过 slop → 取消（那是在拖它，不是要菜单）', () => {
    expect(shouldCancelLongPress({ x: 50, y: 50 }, { x: 50 + LONG_PRESS_SLOP + 1, y: 50 })).toBe(true)
    expect(shouldCancelLongPress({ x: 50, y: 50 }, { x: 54, y: 56 })).toBe(true)
  })

  it('取消阈值比拖拽阈值宽 —— 先认拖拽、再取消长按，两者不会在边界上打架', () => {
    expect(LONG_PRESS_SLOP).toBeGreaterThan(DRAG_THRESHOLD)
  })
})

describe('resolveDragEnd：松手之后做什么', () => {
  const samples = [
    { t: 0, x: 0, y: 0 },
    { t: 100, x: 100, y: 0 },
  ]
  const base = { moved: true, cancelled: false, samples, now: 100, throwPower: 1 }

  it('**没超过阈值 → 当作点击，绝不产生甩动**（否则轻点一下它就滑走一小段）', () => {
    expect(resolveDragEnd({ ...base, moved: false })).toEqual({ kind: 'click' })
  })

  it('被系统取消 → 原地停下（不甩），且优先于 moved 判定', () => {
    expect(resolveDragEnd({ ...base, cancelled: true })).toEqual({ kind: 'cancel' })
    expect(resolveDragEnd({ ...base, moved: false, cancelled: true })).toEqual({ kind: 'cancel' })
  })

  it('真拖拽松手 → 按最近位移甩出去', () => {
    const r = resolveDragEnd(base)
    expect(r.kind).toBe('throw')
    if (r.kind === 'throw') {
      expect(r.vx).toBeCloseTo(1000, 5)
      expect(r.vy).toBeCloseTo(0, 5)
    }
  })

  it('真拖拽但速度估不出来（单点采样）→ 甩速为 0，不会算出 Infinity', () => {
    expect(resolveDragEnd({ ...base, samples: [{ t: 0, x: 0, y: 0 }] })).toEqual({
      kind: 'throw',
      vx: 0,
      vy: 0,
    })
  })
})
