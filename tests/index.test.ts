import { describe, it, expect, afterEach } from 'vitest'
import VitePlugin from '../src'

afterEach(() => {
  delete process.env.UNI_PLATFORM
})

describe('VitePlugin (入口)', () => {
  it('返回一个插件数组', () => {
    const plugins = VitePlugin()
    expect(Array.isArray(plugins)).toBe(true)
    expect(plugins.length).toBeGreaterThan(0)
  })

  it('非 h5 平台包含 corejs-commonjs 插件', () => {
    delete process.env.UNI_PLATFORM
    const plugins = VitePlugin()
    expect(plugins.some(p => p.name === 'vite-plugin-corejs-commonjs')).toBe(true)
    expect(plugins.some(p => p.name === 'vite-plugin-uni-polyfill')).toBe(true)
  })

  it('h5 平台跳过 corejs-commonjs 插件', () => {
    process.env.UNI_PLATFORM = 'h5'
    const plugins = VitePlugin()
    expect(plugins.every(p => p.name !== 'vite-plugin-corejs-commonjs')).toBe(true)
    expect(plugins.some(p => p.name === 'vite-plugin-uni-polyfill')).toBe(true)
  })
})
