import { describe, it, expect } from 'vitest'
import corejsCommonjs from '../src/plugins/corejs-commonjs'

describe('corejs-commonjs 插件', () => {
  it('返回 enforce: pre 且命名正确的插件', () => {
    const plugin = corejsCommonjs()
    expect(plugin.name).toBe('vite-plugin-corejs-commonjs')
    expect(plugin.enforce).toBe('pre')
  })

  it('config 钩子向 build.commonjsOptions.exclude 注入 core-js 正则', () => {
    const plugin = corejsCommonjs()
    const config: any = {}
    ;(plugin.config as any)?.(config)

    expect(config.build).toBeDefined()
    expect(config.build.commonjsOptions).toBeDefined()

    const exclude = config.build.commonjsOptions.exclude
    expect(Array.isArray(exclude)).toBe(true)
    expect(exclude.some((e: unknown) => e instanceof RegExp && e.source.includes('core-js'))).toBe(
      true,
    )
  })

  it('config 钩子不覆盖已有 exclude 中的 core-js 规则', () => {
    const plugin = corejsCommonjs()
    const existing = /core-js[\\/]/
    const config: any = { build: { commonjsOptions: { exclude: [existing] } } }
    ;(plugin.config as any)?.(config)

    const exclude = config.build.commonjsOptions.exclude as RegExp[]
    const corejsRules = exclude.filter(
      (e: unknown) => e instanceof RegExp && e.source.includes('core-js'),
    )
    expect(corejsRules.length).toBe(1)
    expect(corejsRules[0]).toBe(existing)
  })

  it('config 钩子支持字符串形式的已有 exclude', () => {
    const plugin = corejsCommonjs()
    const config: any = { build: { commonjsOptions: { exclude: 'node_modules' } } }
    ;(plugin.config as any)?.(config)

    const exclude = config.build.commonjsOptions.exclude
    expect(Array.isArray(exclude)).toBe(true)
    expect(exclude[0]).toBe('node_modules')
    expect(exclude.some((e: unknown) => e instanceof RegExp && e.source.includes('core-js'))).toBe(
      true,
    )
  })
})
