/**
 * 全局故障记录 —— 描述、滤噪、去重、全局处理器
 *
 * 这个模块的价值全在"出错的时候还靠得住"，所以测试重点不在正常路径，而在三件容易被
 * 顺手改坏、且坏了就彻底失效的事：
 *   ① 它自己**绝不能抛**（它跑在错误处理器里，抛了就是死循环）；
 *   ② 同一故障不能刷屏（既不刷记录也不刷提醒）；
 *   ③ 已知无意义的噪声不能进流水（否则真信号被埋掉）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetErrorLogStateForTest,
  clearErrors,
  describeThrown,
  installGlobalErrorHandlers,
  isIgnorableError,
  listErrors,
  recordError,
} from '../services/error-log'

type Listener = (event: unknown) => void

/** 假 window：只记录监听器，便于在 node 环境里手动触发（无需构造 ErrorEvent） */
function fakeWindow() {
  const map: Record<string, Listener[]> = {}
  const target = {
    addEventListener: (type: string, fn: Listener) => {
      ;(map[type] ??= []).push(fn)
    },
    removeEventListener: (type: string, fn: Listener) => {
      map[type] = (map[type] ?? []).filter((f) => f !== fn)
    },
  } as unknown as Window
  return {
    target,
    countOf: (type: string) => (map[type] ?? []).length,
    fire: (type: string, event: unknown) => (map[type] ?? []).forEach((fn) => fn(event)),
  }
}

beforeEach(() => {
  localStorage.clear()
  __resetErrorLogStateForTest()
})

describe('describeThrown —— 把任意 thrown 值说成一句人话', () => {
  it('Error 取 message', () => {
    expect(describeThrown(new Error('接口超时'))).toBe('接口超时')
  })

  it('Error 无 message 时退回 name', () => {
    expect(describeThrown(new TypeError())).toBe('TypeError')
  })

  it('字符串原样返回', () => {
    expect(describeThrown('直接抛字符串')).toBe('直接抛字符串')
  })

  it('null / undefined / 数字 / 布尔都能描述', () => {
    expect(describeThrown(null)).toBe('null')
    expect(describeThrown(undefined)).toBe('undefined')
    expect(describeThrown(404)).toBe('404')
    expect(describeThrown(false)).toBe('false')
  })

  it('普通对象走 JSON，不返回 "[object Object]"', () => {
    expect(describeThrown({ status: 401, msg: '未授权' })).toBe('{"status":401,"msg":"未授权"}')
  })

  it('空对象与循环引用都不抛错', () => {
    expect(describeThrown({})).toBe('[object Object]')
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => describeThrown(cyclic)).not.toThrow()
  })
})

describe('isIgnorableError —— 已知噪声不进流水', () => {
  it('我们自己 abort 掉的请求不算故障', () => {
    expect(isIgnorableError('AbortError: The operation was aborted.')).toBe(true)
    expect(isIgnorableError('The user aborted a request.')).toBe(true)
  })

  it('ResizeObserver 的良性告警不算故障', () => {
    expect(isIgnorableError('ResizeObserver loop completed with undelivered notifications.')).toBe(true)
  })

  it('真正的故障不会被误滤', () => {
    expect(isIgnorableError('HTTP 401')).toBe(false)
    expect(isIgnorableError('Cannot read properties of undefined (reading id)')).toBe(false)
  })
})

describe('recordError —— 写入、去重、上限', () => {
  it('写入一条并返回记录，最新的在最前', () => {
    const first = recordError({ kind: 'error', message: '第一件' })
    recordError({ kind: 'rejection', message: '第二件' })
    expect(first?.kind).toBe('error')
    expect(listErrors().map((r) => r.message)).toEqual(['第二件', '第一件'])
    expect(listErrors()[0].at).toBeTruthy()
  })

  it('窗口期内同一故障只记一次（返回 null 提示调用方别提醒）', () => {
    expect(recordError({ kind: 'error', message: '同一件' })).not.toBeNull()
    expect(recordError({ kind: 'error', message: '同一件' })).toBeNull()
    expect(listErrors()).toHaveLength(1)
  })

  it('同一条消息但来源类别不同，视为两条', () => {
    recordError({ kind: 'error', message: '同类' })
    expect(recordError({ kind: 'render', message: '同类' })).not.toBeNull()
    expect(listErrors()).toHaveLength(2)
  })

  it('最多留 50 条', () => {
    for (let i = 0; i < 60; i++) recordError({ kind: 'error', message: `第 ${i} 件` })
    expect(listErrors()).toHaveLength(50)
    expect(listErrors()[0].message).toBe('第 59 件')
    expect(listErrors()[49].message).toBe('第 10 件')
  })

  it('超长堆栈被截断，不至于把 localStorage 撑满', () => {
    recordError({ kind: 'error', message: '带堆栈', detail: 'x'.repeat(2000) })
    const detail = listErrors()[0].detail!
    expect(detail.length).toBeLessThan(700)
    expect(detail.endsWith('…')).toBe(true)
  })

  it('clearErrors 后读回空数组', () => {
    recordError({ kind: 'error', message: '待清' })
    clearErrors()
    expect(listErrors()).toEqual([])
  })

  it('存档损坏时按空流水处理', () => {
    localStorage.setItem('zbt:error-log:v1', '坏数据')
    expect(listErrors()).toEqual([])
    // 且还能继续正常写
    expect(recordError({ kind: 'error', message: '恢复' })).not.toBeNull()
  })
})

describe('installGlobalErrorHandlers', () => {
  it('注册 error 与 unhandledrejection 两个监听', () => {
    const w = fakeWindow()
    installGlobalErrorHandlers({ target: w.target })
    expect(w.countOf('error')).toBe(1)
    expect(w.countOf('unhandledrejection')).toBe(1)
  })

  it('重复安装是幂等的，不会重复登记', () => {
    const w = fakeWindow()
    installGlobalErrorHandlers({ target: w.target })
    const dispose = installGlobalErrorHandlers({ target: w.target })
    expect(w.countOf('error')).toBe(1)
    expect(() => dispose()).not.toThrow()
  })

  it('脚本错误：记入流水并提醒一次，位置为 文件:行:列', () => {
    const w = fakeWindow()
    const notified: string[] = []
    installGlobalErrorHandlers({ target: w.target, notify: (r) => notified.push(r.message) })

    w.fire('error', { error: new Error('炸了'), message: '炸了', filename: 'app.js', lineno: 3, colno: 7 })

    const records = listErrors()
    expect(records).toHaveLength(1)
    expect(records[0].kind).toBe('error')
    expect(records[0].where).toBe('app.js:3:7')
    expect(notified).toEqual(['炸了'])
  })

  it('跨域脚本（error 为 null）用 message，而不是记成字符串 "null"', () => {
    const w = fakeWindow()
    installGlobalErrorHandlers({ target: w.target })
    w.fire('error', { error: null, message: 'Script error.', filename: '', lineno: 0, colno: 0 })
    expect(listErrors()[0].message).toBe('Script error.')
  })

  it('未处理的 Promise 拒绝：记下 reason', () => {
    const w = fakeWindow()
    installGlobalErrorHandlers({ target: w.target })
    w.fire('unhandledrejection', { reason: new Error('fetch 失败') })
    expect(listErrors()[0].kind).toBe('rejection')
    expect(listErrors()[0].message).toBe('fetch 失败')
  })

  it('同一故障重复抛出：只提醒一次', () => {
    const w = fakeWindow()
    const notified: string[] = []
    installGlobalErrorHandlers({ target: w.target, notify: (r) => notified.push(r.message) })
    for (let i = 0; i < 10; i++) w.fire('error', { error: new Error('反复'), message: '反复' })
    expect(notified).toHaveLength(1)
    expect(listErrors()).toHaveLength(1)
  })

  it('噪声既不进流水也不提醒', () => {
    const w = fakeWindow()
    const notified: string[] = []
    installGlobalErrorHandlers({ target: w.target, notify: (r) => notified.push(r.message) })
    w.fire('error', { error: new Error('AbortError: aborted'), message: 'AbortError: aborted' })
    expect(listErrors()).toEqual([])
    expect(notified).toEqual([])
  })

  it('提醒回调自己抛错不会影响记录（也就不会形成死循环）', () => {
    const w = fakeWindow()
    installGlobalErrorHandlers({
      target: w.target,
      notify: () => {
        throw new Error('toast 也炸了')
      },
    })
    expect(() =>
      w.fire('error', { error: new Error('原始故障'), message: '原始故障' }),
    ).not.toThrow()
    expect(listErrors()[0].message).toBe('原始故障')
  })

  it('卸载后不再响应', () => {
    const w = fakeWindow()
    const dispose = installGlobalErrorHandlers({ target: w.target })
    dispose()
    expect(w.countOf('error')).toBe(0)
    w.fire('error', { error: new Error('卸载后'), message: '卸载后' })
    expect(listErrors()).toEqual([])
  })

  it('提醒次数有上限，避免故障刷屏', () => {
    const w = fakeWindow()
    const notified: string[] = []
    installGlobalErrorHandlers({ target: w.target, notify: (r) => notified.push(r.message) })
    for (let i = 0; i < 20; i++) w.fire('error', { error: new Error(`第 ${i} 件`), message: `第 ${i} 件` })
    // 记录照记，但最多打扰 5 次
    expect(listErrors().length).toBeGreaterThan(5)
    expect(notified).toHaveLength(5)
  })
})
