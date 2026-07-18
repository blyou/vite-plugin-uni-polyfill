import picomatch from 'picomatch'

/**
 * 由一组 glob 模式预编译为一个匹配函数（基于 picomatch）。
 * 模式为空或未定义时返回始终为 `false` 的匹配器（即该过滤不生效）。
 */
export function createGlobMatcher(patterns?: string[]) {
  if (!patterns || patterns.length === 0) return () => false
  return picomatch(patterns)
}
