import { normalizePath, type Plugin } from 'vite'
import { getContext } from './core/context'
import { resolveOptions } from './options'
import type { UserOptions } from './options.type'
import { logGlobalPolyfills } from './core/log'

export default function VitePlugin(options?: UserOptions): Plugin {
  const resolvedOpts = resolveOptions(options)
  const ctx = getContext(resolvedOpts)

  return {
    name: 'vite-plugin-uni-polyfill',
    enforce: 'post',
    configResolved(config) {
      ctx.root = normalizePath(config.root)
    },
    buildEnd() {
      logGlobalPolyfills(ctx)
    },
    transform: ctx.transform,
  }
}
