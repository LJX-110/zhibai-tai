/**
 * 桌宠素材 · **首屏加载护栏**（Step 4-3 · 九）
 *
 * ## 要防的是什么
 * `public/pet/` 有 107 个动图、约 63MB。最坏的做法是在首屏（或构建产物里）
 * 把所有素材都登记成"要加载的"——那会让打开 App 变成下载 63MB。
 *
 * 实际链路是**按需**的：`PetHost.resolveAsset(name)` 一次只解析一个名字，
 * 渲染层把它给一个 `<img src>`，浏览器只拉当前那张；再额外预热待机池、点击池与拖动池。
 *
 * ## 这组用例怎么防
 *  · **结构性**：把桌宠相关源码当文本读进来，禁止出现"把素材目录整个 glob 进来"
 *    或"在 service 层批量 new Image"这种写法（这种代码一旦出现，就是全量加载的入口）；
 *  · **数量级**：首屏可能触及的素材数量必须远小于素材总数（不是精确数字，
 *    而是"不随素材增长"的关系）；
 *  · **可解析**：`petAssetUrl` 是纯函数、一次一个名字。
 *
 * 真实字节数由 `scripts/pet-assets-audit.mjs` 现算（测试里读不到文件大小）。
 */
import { describe, expect, it } from 'vitest'
import { warmupAnims } from '../services/pet/animation-policy'
import { petAssetUrl, validatePetConfig } from '../services/pet/config'
import rawConfig from '../../public/pet/config.json?raw'

/** 桌宠全部素材（数量口径与 `pet-config.test.ts` 一致，用 Vite 的 glob 而不是 node:fs） */
const assetModules = import.meta.glob('../../public/pet/*.webp')
const assetNames = Object.keys(assetModules).map((p) => p.split('/').pop()!.replace(/\.webp$/, ''))

/** 桌宠相关源码（当文本读，用于结构断言） */
const sources: Record<string, string> = {
  ...(import.meta.glob('../components/pet/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  ...(import.meta.glob('../services/pet/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  ...(import.meta.glob('../hooks/usePet*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
}

const real = validatePetConfig(JSON.parse(rawConfig) as unknown)

describe('结构性护栏：不存在"全量加载"的入口', () => {
  it('桌宠源码里没有把素材目录整个 glob 进来的写法', () => {
    for (const [file, text] of Object.entries(sources)) {
      // 允许注释里提到 glob；真实代码里出现 `import.meta.glob` 才是问题
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, file).not.toContain('import.meta.glob')
      expect(code, file).not.toMatch(/pet\/\*|\*\.webp/)
    }
  })

  it('批量 `new Image()` 只允许出现在渲染层的预热里（且名单有上限）', () => {
    for (const [file, text] of Object.entries(sources)) {
      if (text.includes('new Image(')) {
        expect(file, '批量预热只应出现在渲染层').toContain('PetStage')
      }
    }
  })

  it('service 层不认素材目录，只认"名字 → URL"这一件事', () => {
    const cfgSrc = sources['../services/pet/config.ts'] ?? ''
    expect(cfgSrc).toContain('petAssetUrl')
    // 只有一个 URL 模板；出现第二个就是"另开了一条加载路径"
    expect(cfgSrc.match(/pet\/\$\{/g)?.length ?? 0).toBeLessThanOrEqual(1)
  })
})

describe('数量级：首屏可触及的素材远小于总数', () => {
  it('素材总数 > 100，首屏名单 ≤ 8', () => {
    expect(assetNames.length).toBeGreaterThan(100)
    expect(warmupAnims(real).length).toBeLessThanOrEqual(8)
  })

  it('首屏名单占比不到一成（"不全量"是可度量的，不是口号）', () => {
    expect(warmupAnims(real).length).toBeLessThan(assetNames.length / 10)
  })

  it('首屏名单里的每个名字都真有素材（改名 / 漏转会当场红）', () => {
    for (const n of warmupAnims(real)) expect(assetNames).toContain(n)
  })

  it('按需状态（thinking / working / waiting / success / error / sleep）的素材**不在首屏名单里**', () => {
    const warm = new Set(warmupAnims(real))
    const lazy = [
      ...real.animations.states.thinking,
      ...real.animations.states.working,
      ...real.animations.states.waiting,
      ...real.animations.states.success,
      ...real.animations.states.error,
      ...real.animations.states.sleep,
    ]
    expect(lazy.length).toBeGreaterThan(0)
    for (const n of lazy) expect(warm.has(n)).toBe(false)
  })
})

describe('解析层：一次只解析一个名字', () => {
  it('resolveAsset 的底层就是 petAssetUrl：纯函数、单个 URL', () => {
    const one = petAssetUrl('原地小憩沉眠')
    expect(one).toContain(encodeURIComponent('原地小憩沉眠'))
    expect(petAssetUrl('原地小憩沉眠')).toBe(one)
  })
})

describe('层级：桌宠不许遮挡系统界面（Step 4-3 · 十）', () => {
  /**
   * ⚠️ 这里断言的是"**各处都用层级令牌**"，不是"令牌的数值大小" ——
   * 数值的单一事实源是 `styles/tokens.css`，而 vitest 读不到 CSS 文件内容
   * （`?raw` / `?inline` 都返回空串）。所以顺序写在 tokens.css 的注释里
   * （header 30 < sidebar 40 < nav 50 < **pet 55** < overlay 60 < …），
   * 测试保证的是"改层级时不会绕开令牌、也不会把某个界面漏在桌宠下面"。
   */
  const overlayUsers: Record<string, string> = {
    ...(import.meta.glob('../components/ui/{Dialog,Sheet}.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
    ...(import.meta.glob('../components/ai/AiChatPanel.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  }

  it('桌宠自己走 --z-pet 令牌（不写魔法数字）', () => {
    const sprite = sources['../components/pet/PetSprite.tsx'] ?? ''
    expect(sprite).toContain('var(--z-pet)')
    expect(sprite).not.toMatch(/zIndex:\s*\d/)
  })

  it('弹层（Dialog / Sheet / 天机面板）都用 --z-overlay —— 它们必须高于桌宠', () => {
    const keys = Object.keys(overlayUsers)
    expect(keys.length).toBeGreaterThanOrEqual(3)
    for (const [file, text] of Object.entries(overlayUsers)) {
      expect(text, file).toContain('var(--z-overlay)')
    }
  })

  it('**PWA 安装提示不得低于桌宠**（曾用 --z-nav，右下角的宠物会压住「立即安装」按钮）', () => {
    const install = (
      import.meta.glob('../components/pwa/InstallPrompt.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    )
    const text = Object.values(install)[0] ?? ''
    expect(text).toContain('var(--z-overlay)')
    expect(text).not.toContain('z-[var(--z-nav)]')
  })
})
