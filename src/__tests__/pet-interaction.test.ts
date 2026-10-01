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
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  exceedsDragThreshold,
  isDragSession,
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

describe('isDragSession：松手之后唯一还要区分的事', () => {
  it('**没超过阈值 → 不算拖拽**（点击：不改变位置、也不抑制 click）', () => {
    expect(isDragSession(false, false)).toBe(false)
  })

  it('被系统取消 → 不算拖拽（原地停下，交还状态机）', () => {
    expect(isDragSession(true, true)).toBe(false)
  })

  it('真拖拽 → 抑制随后那次 click（否则松手会被当成点它一下）', () => {
    expect(isDragSession(true, false)).toBe(true)
  })

  it('Step 4-2 起"松手即停"：模块里不再有速度判定（甩抛已被移除）', async () => {
    // 防回归：若有人把甩抛加回来，会先在这里失败，再要求他同步改本文件的说明
    const mod: Record<string, unknown> = await import('../services/pet/interaction')
    expect('resolveDragEnd' in mod).toBe(false)
    expect('throwVelocity' in mod).toBe(false)
  })
})

describe('长按阈值本身（移动端唤起菜单）', () => {
  it('500ms：短于它不算长按（避免误触菜单）', () => {
    expect(LONG_PRESS_MS).toBe(500)
  })
})
