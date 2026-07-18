import { build, type Rollup } from 'vite'
import { minify } from 'terser'
import { gzipSync } from 'node:zlib'
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { log } from 'node:console'
import pc from 'picocolors'
import type { Context } from './context.type'

/** polyfill 依赖打包失败时的告警。 */
function logBundleFailed(): void {
  log(pc.red('[vite-plugin-uni-polyfill] polyfill 依赖打包失败'))
}

/**
 * 使用 vite 的 `build()`（与项目生产构建一致的打包管线）对 polyfill 入口打包，返回各 chunk 代码。
 */
async function bundlePolyfillsWithVite(entryFile: string): Promise<string[]> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      emptyOutDir: false,
      minify: false, // 只打包不压缩，压缩交由 terser 处理
      lib: { entry: entryFile, formats: ['es'], fileName: 'polyfill' },
      rollupOptions: { input: entryFile },
    },
  })

  // build() 返回 RollupOutput | RollupOutput[] | RollupWatcher；归并为 chunk 代码数组，
  // 排除 watch 模式（无 output 字段）的情况。
  const outputs = Array.isArray(result) ? result : 'output' in result ? [result] : []
  return outputs
    .flatMap(o => o.output)
    .filter((c): c is Rollup.OutputChunk => c.type === 'chunk')
    .map(c => c.code)
}

/**
 * 计算 polyfill 部分的体积：
 * 使用 **vite 的 `build()`**（与 vite 生产构建完全一致的打包管线）
 * 构建**完整依赖图**（解析并去重所有传递子导入），产出各 chunk 后逐一测量：
 * - `size`：vite 生产打包（未压缩）后的体积（各 chunk 累加）
 * - `minified`：各 chunk 经 terser（与 vite 内置 terser 默认配置一致）压缩后的体积累加
 * - `minifiedGzip`：压缩产物再分别经 gzip 后的体积累加
 */
export async function computePolyfillSizes(specifiers: Iterable<string>, ctx: Context) {
  const entries = [...specifiers]
  if (entries.length === 0) return { size: 0, minified: 0, minifiedGzip: 0 }

  // 落盘一个入口文件导入全部 polyfill，交由 vite 走真实生产打包管线。
  // 遵循 npm 包缓存文件规范，写入项目根的 node_modules/.cache/<pkg>/ 目录。
  const cacheDir = path.join(ctx.root, 'node_modules', '.cache', 'vite-plugin-uni-polyfill')
  mkdirSync(cacheDir, { recursive: true })
  const entryFile = path.join(cacheDir, `uni-polyfill-entry-${process.pid}-${Date.now()}.mjs`)
  writeFileSync(entryFile, entries.map(p => `import ${JSON.stringify(p)}`).join('\n'))

  let size = 0
  let minified = 0
  let minifiedGzip = 0
  try {
    // 逐个 chunk 测量：未压缩体积累加 → size；再用 terser 压缩后分别统计 minified / gzip。
    const codes = await bundlePolyfillsWithVite(entryFile)
    for (const code of codes) {
      const unmin = Buffer.byteLength(code, 'utf8')
      if (unmin === 0) continue
      size += unmin
      // 压缩：采用与 vite(minify:'terser')一致的内置默认配置（safari10 + module(es) + toplevel:false）
      const minifiedCode =
        (await minify(code, { safari10: true, module: true, toplevel: false })).code ?? ''
      minified += Buffer.byteLength(minifiedCode, 'utf8')
      minifiedGzip += gzipSync(Buffer.from(minifiedCode, 'utf8')).byteLength
    }
    if (size === 0) return { size: 0, minified: 0, minifiedGzip: 0 }
  } catch {
    logBundleFailed()
    return { size: 0, minified: 0, minifiedGzip: 0 }
  } finally {
    unlinkSync(entryFile)
  }

  return { size, minified, minifiedGzip }
}
