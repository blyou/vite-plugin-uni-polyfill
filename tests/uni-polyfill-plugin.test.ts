import { describe, it, expect } from 'vitest'
import type { Plugin } from 'vite'
import uniPolyfill from '../src/plugins/uni-polyfill'

/**
 * Vite 的 `ObjectHook` 既可以是函数，也可以是 `{ handler, order? }` 对象。
 * 统一取出真正可调用 handler，避免「此表达式不可调用」的类型错误。
 */
function getHookHandler<T extends (...args: any[]) => any>(
  hook: NonNullable<Plugin['transform']> | undefined,
): T | undefined {
  if (!hook) return undefined
  return (typeof hook === 'function' ? hook : hook.handler) as T | undefined
}

describe('uni-polyfill 插件', () => {
  it('返回具有正确 name / enforce 的插件对象', () => {
    const plugin = uniPolyfill()
    expect(plugin.name).toBe('vite-plugin-uni-polyfill')
    expect(plugin.enforce).toBe('post')
    expect(typeof plugin.transform).toBe('function')
  })

  it('transform 钩子能注入 polyfill', async () => {
    const plugin = uniPolyfill()
    const handler = getHookHandler(plugin.transform as NonNullable<Plugin['transform']>)
    const result = await handler!('const x = [1,2,3].at(-1)', '/app/src/a.ts')
    expect(result).toBeDefined()
    const code = typeof result === 'string' ? result : (result as { code: string }).code
    expect(code).toContain('core-js')
  })

  it('ctx.transform 绑定与插件 transform 行为一致', () => {
    const plugin = uniPolyfill()
    expect(typeof plugin.transform).toBe('function')
    expect(typeof getHookHandler(plugin.transform as NonNullable<Plugin['transform']>)).toBe(
      'function',
    )
  })
})
