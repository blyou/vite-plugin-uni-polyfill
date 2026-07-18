import { describe, it, expect, afterEach, vi } from 'vitest'
import { transform } from '../src/plugins/uni-polyfill/core/transform'
import { resolveOptions } from '../src/plugins/uni-polyfill/options'
import { getContext } from '../src/plugins/uni-polyfill/core/context'
import type { UserOptions } from '../src/plugins/uni-polyfill/options.type'
import { formatBytes, logGlobalPolyfills } from '../src/plugins/uni-polyfill/core/log'
import { computePolyfillSizes } from '../src/plugins/uni-polyfill/core/size'
import { createGlobMatcher } from '../src/plugins/uni-polyfill/utils/glob'

/** 由用户选项构造 transform 所需的 Context。 */
function mkCtx(options?: UserOptions) {
  return getContext(resolveOptions(options))
}

const defaultCtx = mkCtx()

/** transform 返回 Rollup.TransformResult（新版 Vite 类型为 `string | Partial<SourceDescription>`），
 *  注入成功时实际恒为含 code/map 的对象，这里将其收窄为对象形态以便断言。 */
function runTransform(code: string, id: string, ctx: ReturnType<typeof mkCtx> = defaultCtx) {
  return transform(code, id, ctx) as unknown as { code: string; map: unknown } | undefined
}

/** 一个在 chrome 83 下必然需要 core-js polyfill 的特性（Array.prototype.at 需 chrome 92+）。 */
const NEEDS_POLYFILL = `const last = [1, 2, 3].at(-1)`

afterEach(() => {
  delete process.env.UNI_PLATFORM
})

describe('transform - 文件过滤', () => {
  it('node_modules 下的文件被跳过', () => {
    const result = runTransform('const a = 1', '/app/node_modules/foo/index.js', defaultCtx)
    expect(result).toBeUndefined()
  })

  it('非 js/ts/vue 文件被跳过', () => {
    const result = runTransform('body {}', '/app/src/style.css', defaultCtx)
    expect(result).toBeUndefined()
  })

  it('.ts / .js / .tsx / .mjs 文件会被处理', () => {
    for (const id of ['/app/a.ts', '/app/a.js', '/app/a.tsx', '/app/a.mjs']) {
      const result = runTransform('const a = 1', id, defaultCtx)
      expect(result).toBeDefined()
    }
  })
})

describe('transform - polyfill 注入', () => {
  it('默认目标(chrome 83)下对 .at() 注入 core-js', () => {
    const result = runTransform(NEEDS_POLYFILL, '/app/src/index.ts', defaultCtx)
    expect(result).toBeDefined()
    expect(result!.code).toContain('core-js')
  })

  it('明确使用旧目标(ie 11)时对任意 ES 特性注入 polyfill', () => {
    const result = runTransform(
      'Object.assign({}, { a: 1 })',
      '/app/src/index.js',
      mkCtx({ targets: 'ie 11' }),
    )
    expect(result).toBeDefined()
    expect(result!.code).toContain('core-js')
  })

  it('无需 polyfill 的基础语法不引入 core-js', () => {
    const result = runTransform('const a = 1\n', '/app/src/index.js', defaultCtx)
    expect(result).toBeDefined()
    expect(result!.code).not.toContain('core-js/modules')
  })

  it('导出包含 source map', () => {
    const result = runTransform(NEEDS_POLYFILL, '/app/src/index.ts', defaultCtx)
    expect(result).toBeDefined()
    expect(result!.map).toBeTruthy()
  })
})

describe('transform - include/exclude 支持 glob', () => {
  it('exclude 支持 glob，命中后不再注入对应 polyfill', () => {
    const result = runTransform(
      NEEDS_POLYFILL,
      '/app/src/index.ts',
      mkCtx({ exclude: ['es.array.*'] }),
    )
    expect(result).toBeDefined()
    expect(result!.code).not.toContain('core-js/modules/es.array.at')
  })

  it('include 支持 glob，命中已检测特性时保留注入', () => {
    const result = runTransform(
      NEEDS_POLYFILL,
      '/app/src/index.ts',
      mkCtx({ include: ['es.array.*'] }),
    )
    expect(result).toBeDefined()
    expect(result!.code).toContain('core-js/modules/es.array.at')
  })
})

describe('createGlobMatcher', () => {
  it('`*` 匹配任意字符', () => {
    const match = createGlobMatcher(['es.array.*'])
    expect(match('es.array.at')).toBe(true)
    expect(match('es.array.at.js')).toBe(true)
    expect(match('es.string.foo')).toBe(false)
  })

  it('`?` 匹配单个字符', () => {
    const match = createGlobMatcher(['es.array.a?'])
    expect(match('es.array.at')).toBe(true)
    expect(match('es.array.abc')).toBe(false)
  })

  it('精确匹配（无通配符）', () => {
    const match = createGlobMatcher(['web.url'])
    expect(match('web.url')).toBe(true)
    expect(match('web.url-search-params')).toBe(false)
  })

  it('空/未定义模式始终不匹配', () => {
    expect(createGlobMatcher([])('anything')).toBe(false)
    expect(createGlobMatcher(undefined)('anything')).toBe(false)
  })
})

describe('transform - mp-weixin 的 new URL 替换', () => {
  it('mp-weixin 下将 new URL() 替换为 new globalThis.URL()', () => {
    // platform 在 resolveOptions（配置解析）时从 env 读取并固化进 options.platform，
    // 因此必须在构建 context 之前设置 env，不能用模块级共享的 defaultCtx。
    process.env.UNI_PLATFORM = 'mp-weixin'
    const weixinCtx = mkCtx()
    const code = `const u = new URL('https://example.com')`
    const result = runTransform(code, '/app/src/index.ts', weixinCtx)
    expect(result).toBeDefined()
    expect(result!.code).toContain('globalThis.URL')
  })

  it('非 mp-weixin 平台保留 new URL()', () => {
    delete process.env.UNI_PLATFORM
    const otherCtx = mkCtx()
    const code = `const u = new URL('https://example.com')`
    const result = runTransform(code, '/app/src/index.ts', otherCtx)
    expect(result).toBeDefined()
    expect(result!.code).not.toContain('globalThis.URL')
  })
})

describe('formatBytes', () => {
  it('小于 1KB 显示字节', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('KB / MB 单位换算保留两位小数', () => {
    expect(formatBytes(1024)).toBe('1.00 KB')
    expect(formatBytes(1536)).toBe('1.50 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB')
  })
})

describe('computePolyfillSizes', () => {
  it('空集合返回全 0', async () => {
    const sizes = await computePolyfillSizes([], defaultCtx)
    expect(sizes).toEqual({ size: 0, minified: 0, minifiedGzip: 0 })
  })

  it('读取真实 core-js 模块并打包完整依赖后计算三种体积', async () => {
    const sizes = await computePolyfillSizes(['core-js/modules/es.array.at.js'], defaultCtx)
    expect(sizes.size).toBeGreaterThan(0)
    expect(sizes.minified).toBeGreaterThan(0)
    expect(sizes.minifiedGzip).toBeGreaterThan(0)
    // 压缩后不应大于打包原始体积；gzip 压缩后的 minified 通常最小
    expect(sizes.minified).toBeLessThanOrEqual(sizes.size)
    expect(sizes.minifiedGzip).toBeLessThanOrEqual(sizes.minified)
  })

  it('无法解析的 specifier 被跳过', async () => {
    const sizes = await computePolyfillSizes(['core-js/modules/__not_exist__.js'], defaultCtx)
    expect(sizes).toEqual({ size: 0, minified: 0, minifiedGzip: 0 })
  })
})

describe('logGlobalPolyfills - 体积输出', () => {
  // 源码通过 `node:console` 的 log 写入 stdout，故直接拦截 process.stdout.write。
  function captureStdout() {
    const chunks: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk))
      return true
    })
    return { chunks, spy }
  }

  it('log 关闭时不输出', async () => {
    const { chunks, spy } = captureStdout()
    await logGlobalPolyfills(mkCtx({ log: false }))
    spy.mockRestore()
    expect(chunks.join('')).toBe('')
  })

  it('收集到 polyfill 后输出体积行', async () => {
    // 使用 log=true：logPolyfillsDiff 会更新全局 polyfillCount，globalPolyfillsLog 才有数据
    const ctx = mkCtx({ log: true })
    ctx.transform(NEEDS_POLYFILL, '/app/src/size-a.ts')

    const { chunks, spy } = captureStdout()
    await logGlobalPolyfills(ctx)
    spy.mockRestore()

    const output = chunks.join('')
    expect(output).toContain('bundle size:')
    expect(output).toContain('minified:')
    expect(output).toContain('minified + gzip:')
  })
})
