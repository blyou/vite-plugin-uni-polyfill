import { findStaticImports } from 'mlly'
import { log } from 'node:console'
import pc from 'picocolors'
import type { Context } from './context.type'
import { computePolyfillSizes } from './size'

/**
 * 判断 specifier 是否为 core-js 模块导入。
 * 兼容相对 specifier（如 `core-js/modules/es.array.at.js`）
 * 与 absoluteImports 注入的绝对路径（如 `/abs/node_modules/core-js/modules/es.array.at.js`）。
 */
function isCoreJsModule(specifier: string): boolean {
  return /(^|\/)core-js\/modules\//.test(specifier)
}

/**
 * 将 core-js 的 specifier 转为简短的可读名称（模块名），
 * 兼容相对 specifier 与 absoluteImports 注入的绝对路径，均转为 `es.array.at`：
 * - `core-js/modules/es.array.at.js` → `es.array.at`
 * - `/abs/node_modules/core-js/modules/es.array.at.js` → `es.array.at`
 * 已为模块名（不含路径）时原样返回。
 */
function formatPolyfillName(specifier: string): string {
  const match = specifier.match(/core-js\/modules\/([^/]+?)(?:\.js)?$/)
  return match ? match[1] : specifier
}

/**
 * 将字节数格式化为友好单位，如 `1.23 KB` / `4.56 MB`。
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`
}

// ---------------------------------------------------------------------------
// 日志打印
// ---------------------------------------------------------------------------

/** 打印 polyfill 体积（size / minified / minified+gzip）。 */
export async function logPolyfillSizes(polyfills: Iterable<string>, ctx: Context) {
  log(`${pc.cyan('[vite-plugin-uni-polyfill]')} 正在计算 polyfill 体积...`)
  const sizes = await computePolyfillSizes(polyfills, ctx)
  if (sizes.size === 0) return
  log(`${pc.cyan('[vite-plugin-uni-polyfill]')} polyfill 体积:`)
  log(
    `  bundle size: ${pc.yellow(formatBytes(sizes.size))} | minified: ${pc.yellow(formatBytes(sizes.minified))} | minified + gzip: ${pc.yellow(formatBytes(sizes.minifiedGzip))}`,
  )
}

// ---------------------------------------------------------------------------
// polyfill 引用追踪与汇总日志
// ---------------------------------------------------------------------------

const polyfillMap = new Map<string, Set<string>>()
// 全局 polyfill 引用计数：记录每个 polyfill 被多少个文件引用。
// 用于区分「全局增减」（本文件是唯一引用方）与「仅文件级增减」（其它文件仍引用）。
const polyfillCount = new Map<string, number>()

/**
 * 对比当前与上次注入的 polyfill 集合，结合全局引用计数区分「全局增减」与「文件增减」。
 * - `last` 为 `undefined`：该文件首次注入，无删除项；按引用计数判断绿/白；
 * - `polyfillCount`：全局引用计数，记录每个 polyfill 被多少文件引用（调用前反映上次状态，
 *   已含本文件旧引用）：
 *     - 新增项 `polyfillCount === 0` → 全局首次出现（绿）；`polyfillCount > 0` → 其它文件已引用（白）；
 *     - 删除项 `polyfillCount === 1` → 本文件是唯一引用方，全局减少（红）；
 *       `polyfillCount > 1` → 其它文件仍引用，仅本文件删除（白）。
 *   分类完成后根据差量更新 `polyfillCount` 与 `polyfillMap`。
 */
export function logPolyfillsDiff(code: string, id: string, ctx: Context) {
  const imports = findStaticImports(code)
  const current = new Set(imports.filter(i => isCoreJsModule(i.specifier)).map(i => i.specifier))
  const last = polyfillMap.get(id)

  /** 全局新增（本文件是唯一引入方） → 绿色 + */
  const globalAdded: string[] = []
  /** 全局减少（本文件是唯一引用方） → 红色 - */
  const globalRemoved: string[] = []
  /** 仅本文件新增、其它文件已引用 → 白色 + */
  const fileAdded: string[] = []
  /** 仅本文件删除、其它文件仍引用 → 白色 - */
  const fileRemoved: string[] = []
  /** 与上次一致、未改动的 polyfill → 灰色 无符号 */
  const unchanged: string[] = []

  for (const item of current) {
    if (last?.has(item)) unchanged.push(item)
    else if ((polyfillCount.get(item) ?? 0) > 0) fileAdded.push(item)
    else globalAdded.push(item)
  }

  if (last) {
    for (const item of last) {
      if (current.has(item)) continue
      if ((polyfillCount.get(item) ?? 0) > 1) fileRemoved.push(item)
      else globalRemoved.push(item)
    }
  }

  // 全部无变化（含首次且为空）时跳过输出，避免每次转译重复刷屏；
  // 仅在有任意增/删时才连同灰色「未改动」项一起打印，形成完整 diff 视图。
  if (
    globalAdded.length === 0 &&
    fileAdded.length === 0 &&
    globalRemoved.length === 0 &&
    fileRemoved.length === 0
  )
    return

  // 更新全局引用计数：删除项 -1、新增项 +1，并清理计数为 0 的项
  last?.forEach(i => {
    if (!current.has(i)) polyfillCount.set(i, (polyfillCount.get(i) ?? 0) - 1)
  })
  current.forEach(i => {
    if (!last?.has(i)) polyfillCount.set(i, (polyfillCount.get(i) ?? 0) + 1)
  })
  for (const [k, v] of polyfillCount) if (v <= 0) polyfillCount.delete(k)
  // 记录本文件结果，供下次文件级差量对比
  polyfillMap.set(id, current)

  const needLog = ctx.options.log === true || ctx.options.log === 'file'
  if (!needLog) return

  const file = pc.underline(id.replace(`${ctx.root}/`, '').split('?')[0])
  log(`${pc.cyan('[vite-plugin-uni-polyfill]')} ${file} polyfill 变更:`)
  globalAdded.forEach(i => log(pc.green(`  + ${formatPolyfillName(i)}`)))
  fileAdded.forEach(i => log(pc.white(`  + ${formatPolyfillName(i)}`)))
  globalRemoved.forEach(i => log(pc.red(`  - ${formatPolyfillName(i)}`)))
  fileRemoved.forEach(i => log(pc.white(`  - ${formatPolyfillName(i)}`)))
  unchanged.forEach(i => log(pc.dim(`    ${formatPolyfillName(i)}`)))
}

/**
 * 构建结束后打印「项目注入的全部 polyfill 引用」及其体积信息。
 */
export function logGlobalPolyfills(ctx: Context) {
  const needLog = ctx.options.log === true || ctx.options.log === 'global'
  if (!needLog) return

  const polyfills = [...polyfillCount.keys()]

  log(`${pc.cyan('[vite-plugin-uni-polyfill]')} 项目注入的全部 polyfill 引用:`)
  if (!polyfills.length) return log(pc.gray('  （无）'))

  polyfills.sort().forEach(p => log(`  ${pc.yellow(formatPolyfillName(p))}`))

  return logPolyfillSizes(polyfills, ctx)
}
