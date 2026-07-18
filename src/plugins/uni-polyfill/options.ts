import corejsPackageJson from 'core-js/package.json' with { type: 'json' }
import type { UserOptions } from './options.type'
import { createGlobMatcher } from './utils/glob'

const defaultOptions = {
  targets: { chrome: '83' },
  corejsVersion: corejsPackageJson.version,
}

export function resolveOptions(options?: UserOptions) {
  const platform = process.env.UNI_PLATFORM
  const log = typeof options?.log === 'function' ? options.log() : options?.log
  // h5 平台无需 url polyfill；其余平台默认包含 web.url*（匹配 web.url 及 web.url-search-params）。
  const include = options?.include ?? (platform === 'h5' ? [] : ['web.url*'])
  // 将 include / exclude 的 glob 模式预编译为匹配器，避免 transform 热路径上重复编译。
  const includeMatcher = createGlobMatcher(include)
  const excludeMatcher = createGlobMatcher(options?.exclude)

  return {
    ...defaultOptions,
    ...options,
    log,
    platform,
    include,
    exclude: options?.exclude,
    includeMatcher,
    excludeMatcher,
  }
}
