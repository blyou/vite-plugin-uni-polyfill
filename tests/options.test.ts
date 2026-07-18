import { describe, it, expect } from 'vitest'
import { resolveOptions } from '../src/plugins/uni-polyfill/options'

describe('resolveOptions', () => {
  it('uses chrome 83 as default target', () => {
    const resolved = resolveOptions()
    expect(resolved.targets).toEqual({ chrome: '83' })
  })

  it('reads corejs version from core-js/package.json', () => {
    const resolved = resolveOptions()
    // core-js 3.49.0 已安装在 workspace 中
    expect(resolved.corejsVersion).toMatch(/^3\./)
  })

  it('merges user-provided targets over defaults', () => {
    const resolved = resolveOptions({ targets: { ios: '14' } })
    expect(resolved.targets).toEqual({ ios: '14' })
  })

  it('accepts string / array targets', () => {
    expect(resolveOptions({ targets: 'defaults' }).targets).toBe('defaults')
    expect(resolveOptions({ targets: ['chrome 83', 'ios 14'] }).targets).toEqual([
      'chrome 83',
      'ios 14',
    ])
  })

  it('keeps corejsVersion when only targets provided', () => {
    const resolved = resolveOptions({ targets: { chrome: '100' } })
    expect(resolved.corejsVersion).toMatch(/^3\./)
  })
})
