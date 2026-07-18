import { type Plugin } from 'vite'
import commonjs from '@rollup/plugin-commonjs'

/** 匹配 core-js 包内的所有模块（目录/文件），commonjs 插件会自动跳过 ESM 文件。 */
const COREJS_PATTERN = /(?:^|[\\/])core-js[\\/]/

/**
 * 创建仅作用于 core-js 的 `@rollup/plugin-commonjs` 实例（`enforce: 'pre'`），
 * 先于 Vite 内置实例将 core-js CJS 转为干净 ESM。详见 README.md。
 */
export default function VitePlugin(): Plugin {
  const plugin = commonjs({ include: COREJS_PATTERN }) as Plugin

  plugin.name = 'vite-plugin-corejs-commonjs'
  plugin.enforce = 'pre'
  // 向 `build.commonjsOptions.exclude` 注入 core-js 正则，
  // 使 Vite 内置 commonjs 跳过 core-js，避免两个实例重复转换。
  plugin.config = config => {
    config.build ??= {}
    config.build.commonjsOptions ??= {}
    const opts = config.build.commonjsOptions

    const excludeList: (string | RegExp)[] = Array.isArray(opts.exclude)
      ? opts.exclude
      : opts.exclude
        ? [opts.exclude]
        : []
    const alreadyExcluded = excludeList.some(
      e => e instanceof RegExp && e.source.includes('core-js'),
    )
    if (!alreadyExcluded) excludeList.push(COREJS_PATTERN)

    opts.exclude = excludeList
  }

  return plugin
}
