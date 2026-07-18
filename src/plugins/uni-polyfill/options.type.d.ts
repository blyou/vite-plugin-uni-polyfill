import { resolveOptions } from './options'

export interface UserOptions {
  /**
   * https://uniapp.dcloud.net.cn/tutorial/syntax-js.html#android%E5%B9%B3%E5%8F%B0
   *
   * Android平台，JS脚本运行在独立Google V8引擎中，版本与Chrome83一致
   * @default { chrome: '83' }
   */
  targets?: string | string[] | Record<string, string>
  /**
   * 需要包含的polyfill（支持 glob 语法，`*` 匹配任意字符、`?` 匹配单个字符）。
   * 命中后强制注入，忽略目标浏览器支持度。
   * @default `if (platform !== h5) ['web.url*']`
   */
  include?: string[]
  /**
   * 需要排除的polyfill（支持 glob 语法，`*` 匹配任意字符、`?` 匹配单个字符）。
   * 命中后强制跳过，优先级高于 include 与目标浏览器判断。
   */
  exclude?: string[]
  /**
   * 是否打印日志
   *
   * true: 打印'file'和'global'
   *
   * 'file': transform钩子中，打印每个文件的polyfill引用diff
   *
   * 'global': buildEnd钩子中，打印项目中所有的polyfill引用
   * @default false
   */
  log?: Log | (() => Log | void)
}

export type Log = boolean | 'file' | 'global'

export type ResolvedOptions = ReturnType<typeof resolveOptions>
