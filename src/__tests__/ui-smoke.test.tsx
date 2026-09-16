// @vitest-environment jsdom
/**
 * UI 冒烟测试 —— 全部板块页面在空数据下渲染不抛错
 * 目的：跨页面改动的回归网。此前改一个组件悄悄弄坏另一个页面只能靠手工点。
 * 朴素策略：每个 section 用空 store 渲染一次，任何未捕获异常都会让本用例失败。
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { PageRouter } from '../app/PageRouter'
import type { SectionId } from '../app/navigation'
import { ALL_SECTIONS } from '../app/navigation'

// jsdom 缺 matchMedia：布局解析用（useResolvedLayout）
function mockMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  mockMatchMedia()
})

afterEach(() => {
  cleanup()
})

it.each(ALL_SECTIONS.map((s) => [s.id, s.index]))(
  '渲染板块 %s（%s）不抛错',
  (id) => {
    expect(() => render(<PageRouter section={id as SectionId} />)).not.toThrow()
  },
)