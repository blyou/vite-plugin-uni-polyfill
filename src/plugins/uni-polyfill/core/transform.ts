import { createFilter, type Rollup } from 'vite'
import { transformSync, type PluginItem, type PluginTarget } from '@babel/core'
import type { Context } from './context.type'
import { logPolyfillsDiff } from './log'

const fileFilter = createFilter([/\.[cm]?[jt]sx?$/, /.vue$/], /node_modules/)

/**
 * Babel 插件：将 `new URL()` 替换为 `new globalThis.URL()`
 * 适用于 URL 未挂在全局作用域的运行时（如微信小程序开发者工具环境）
 */
const replace_new_URL: PluginTarget = ({ types: t }) => ({
  name: 'replace-url-callee',
  visitor: {
    NewExpression(path) {
      if (t.isIdentifier(path.node.callee, { name: 'URL' })) {
        path.node.callee = t.memberExpression(t.identifier('globalThis'), t.identifier('URL'))
      }
    },
  },
})

function injectPolyfill(code: string, id: string, { options }: Context) {
  const plugins: PluginItem[] = [
    // polyfill-corejs3 会自动注入 core-js 的 polyfill
    // https://github.com/babel/babel-polyfills/blob/main/docs/usage.md
    [
      'polyfill-corejs3',
      {
        targets: options.targets,
        method: 'usage-global',
        version: options.corejsVersion,
        absoluteImports: true,
        shouldInjectPolyfill: (name: string, defaultShouldInject: boolean) => {
          if (options.excludeMatcher(name)) return false
          if (options.includeMatcher(name)) return true
          return defaultShouldInject
        },
      },
    ],
  ]

  if (options.platform === 'mp-weixin') plugins.push(replace_new_URL)

  return transformSync(code, {
    cwd: import.meta.dirname,
    sourceMaps: true,
    sourceFileName: id,
    plugins,
  })
}

export function transform(code: string, id: string, ctx: Context): Rollup.TransformResult {
  if (!fileFilter(id)) return

  const polyfilled = injectPolyfill(code, id, ctx)
  if (!polyfilled?.code) return

  logPolyfillsDiff(polyfilled.code, id, ctx)

  return {
    code: polyfilled.code,
    map: polyfilled.map as Rollup.SourceMapInput,
  }
}
