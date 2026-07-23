# vite-plugin-uni-polyfill

基于 [Vite](https://vite.dev) 的 **uni-app** 运行时垫片（polyfill）注入插件。

它会在构建期根据目标运行环境，按需补全 [core-js](https://github.com/zloirock/core-js) 的 API 垫片，并针对性修复 uni-app 各端（尤其是微信小程序 `mp-weixin`）下常见的兼容性问题：

- `new URL()` 在微信小程序开发者工具环境中报 `URL is not defined`；
- `build --watch` 下 core-js CJS 模块转换报错 `__moduleExports is not exported`；

---

## 安装方式

pnpm

```bash
pnpm add -D @blyou/vite-plugin-uni-polyfill
```

npm

```bash
npm install -D @blyou/vite-plugin-uni-polyfill
```

> **pnpm 用户注意**：本插件在运行期需要解析 `@babel/core`、`@rollup/plugin-commonjs` 等依赖。pnpm 默认的严格（非扁平）`node_modules` 结构可能导致这些依赖无法从插件位置正确解析，从而构建报错。请在项目根目录的 `.npmrc` 中开启扁平提升：
>
> ```ini
> # .npmrc
> shamefully-hoist=true
> ```
>
> 若使用 pnpm workspace，也可在 `pnpm-workspace.yaml` 中配置：
>
> ```yaml
> # pnpm-workspace.yaml
> shamefullyHoist: true
> ```
>
> 配置后重新执行 `pnpm install` 使依赖提升生效。

---

## 配置参数

插件通过 `vite.config.ts` 的 `plugins` 数组使用，默认导出为一个返回 `Plugin[]` 的函数。

### 选项（Options）

| 选项      | 类型                                          | 默认值                                | 说明                                                                                                                                                                        |
| --------- | --------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targets` | `string \| string[] \| Record<string,string>` | `{ chrome: '83' }`                    | 目标运行环境。Android 平台 JS 运行在独立 V8 引擎，版本约等同于 Chrome 83，故默认按 Chrome 83 注入。参见 [browserslist](https://github.com/browserslist/browserslist) 语法。 |
| `include` | `string[]`                                    | `platform==='h5' ? [] : ['web.url*']` | 需要**强制注入**的垫片（支持 glob）。命中后忽略目标环境支持度。                                                                                                             |
| `exclude` | `string[]`                                    | `undefined`                           | 需要**排除**的垫片（支持 glob）。命中后强制跳过，优先级高于 `include` 与目标环境判断。                                                                                      |
| `log`     | `boolean \| 'file' \| 'global'`               | `false`                               | 日志模式：`true` 同时输出文件级与全局级；`'file'` 仅单文件 diff；`'global'` 仅构建结束汇总；`false` 关闭。                                                                  |

> **平台（platform）** 不由选项直接传入，而是由 uni-app 编译时注入的 `UNI_PLATFORM` 环境变量决定。

---

## 示例代码

### 基础用法

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import Polyfill from '@blyou/vite-plugin-uni-polyfill'

export default defineConfig({
  plugins: [Polyfill()],
})
```

### 指定目标环境

```ts
import { defineConfig } from 'vite'
import Polyfill from '@blyou/vite-plugin-uni-polyfill'

export default defineConfig({
  plugins: [
    Polyfill({
      // 兼容到 iOS Safari 14 / Chrome 90
      targets: ['ios >= 14', 'chrome >= 90'],
    }),
  ],
})
```

### 收窄垫片范围（glob）

```ts
import { defineConfig } from 'vite'
import Polyfill from '@blyou/vite-plugin-uni-polyfill'

export default defineConfig({
  plugins: [
    Polyfill({
      // 强制保留数组相关垫片（哪怕目标环境已支持）
      include: ['es.array.*'],
      // 排除 Promise 相关垫片
      exclude: ['es.promise.*', 'web.url*'],
    }),
  ],
})
```

### 开启体积日志

```ts
import { defineConfig } from 'vite'
import Polyfill from '@blyou/vite-plugin-uni-polyfill'

export default defineConfig({
  plugins: [
    Polyfill({
      log: 'global', // 构建结束时打印全部注入的 polyfill 及其体积
    }),
  ],
})
```

构建输出示例：

```
[vite-plugin-uni-polyfill] 项目注入的全部 polyfill 引用:
  es.array.at
  es.array.map
  web.url-search-params
[vite-plugin-uni-polyfill] 正在计算 polyfill 体积...
[vite-plugin-uni-polyfill] polyfill 体积:
  bundle size: 12.34 KB | minified: 5.67 KB | minified + gzip: 2.10 KB
```

---

## 核心功能特性

- **按需注入 core-js 垫片**：基于 `@babel/core` + `babel-plugin-polyfill-corejs3`，采用 `usage-global` 策略，仅注入代码中实际用到、且目标环境不支持的特性。
- **平台感知**：自动读取 `UNI_PLATFORM` 环境变量（uni-app 编译时注入）决定垫片范围与启用哪些修复插件。
  - `h5`：不注入 `web.url*` 系列垫片，且不启用 core-js 的 commonjs 修复插件；
  - 其余平台：默认额外注入 `web.url*`（即 `web.url` 与 `web.url-search-params`）。
- **mp-weixin 的 `new URL` 修复**：`mp-weixin` 平台下，将源码中的 `new URL(...)` 自动改写为 `new globalThis.URL(...)`，避免小程序环境 `URL` 未挂载到全局作用域的问题。
- **core-js CJS 修复（`vite-plugin-corejs-commonjs`）**：非 `h5` 平台自动挂载一个**仅作用于 core-js** 的 `@rollup/plugin-commonjs` 实例（`enforce: 'pre'`），并让 Vite 内置实例跳过 core-js，形成真正的单实例转换，根除 watch 模式的 `__moduleExports` 报错与垫片静默失效。
- **`include` / `exclude` 支持 glob**：以 glob 表达式（`*` 匹配任意字符、`?` 匹配单个字符）精确控制需要强制注入或排除的垫片。
- **体积统计与可视化日志**：构建结束时汇总项目注入的全部 polyfill，并通过 Vite 真实生产打包管线计算其 `bundle size / minified / minified + gzip` 体积，辅助你评估与裁剪垫片。
- **分级日志**：`log` 选项支持 `true` / `'file'` / `'global'` / `false`，可只看单文件 diff、只看全局汇总，或完全关闭。

---

## 工作原理

1. **注入阶段（`transform` 钩子，`enforce: 'post'`）**
   对每个符合条件的源文件（`.js/.ts/.jsx/.tsx/.mjs/.vue`，排除 `node_modules`）运行 Babel：
   - `babel-plugin-polyfill-corejs3`（`usage-global`）按 `targets` 与 `include`/`exclude` 注入所需 core-js 模块；
   - 当 `UNI_PLATFORM === 'mp-weixin'` 时，追加 Babel 插件将 `new URL()` 改写为 `new globalThis.URL()`。

2. **CJS 修复阶段（`vite-plugin-corejs-commonjs`，非 `h5` 自动启用）**
   自带一个 `enforce: 'pre'` 的 `@rollup/plugin-commonjs` 实例，仅处理 core-js 包内文件，并通过 `config` 钩子让 Vite 内置 commonjs 实例将 core-js 加入 `exclude`，确保 core-js 只被转换一次。

3. **汇总阶段（`buildEnd` 钩子）**
   依据 `log` 选项，打印文件级 polyfill diff 与项目级 polyfill 汇总；在 `'global'` / `true` 模式下，通过 Vite 的 `build()` 真实生产管线打包去重后的 polyfill 入口，测量其 `size` / `minified` / `minified + gzip` 体积。

---

## 常见问题（FAQ）

**Q：`mp-weixin` 下运行时代码报 `URL is not defined`？**
A：微信小程序开发者工具环境中 `URL` 未挂载到全局作用域。本插件在 `UNI_PLATFORM === 'mp-weixin'` 时会自动将 `new URL(...)` 改写为 `new globalThis.URL(...)`，无需手动处理。

**Q：`build --watch` 时报 `__moduleExports is not exported by ".../core-js/..."`？**
A：这是 uni-app 差量编译缓存导致 core-js 的 CJS 转换产物未同步合成导出。非 `h5` 平台本插件会自动挂载 `vite-plugin-corejs-commonjs`，以单实例方式独占 core-js 的 commonjs 转换，根除该问题。

**Q：运行时抛出 `getOrInsert is not a function`（或 `URLSearchParams` 相关错误）？**
A：通常是 core-js 被多个 commonjs 实例重复转换、模块图分裂，导致全局垫片静默失效。同上，由 `vite-plugin-corejs-commonjs` 的"单实例"机制修复。

**Q：如何只为特定平台注入？**
A：平台由 `UNI_PLATFORM` 环境变量控制（uni-app 编译时自动注入）。`h5` 默认不注入 `web.url*` 且不启用 CJS 修复插件；其余平台默认包含 `web.url*`。你也可以在任何平台用 `include` / `exclude` 精细控制。

**Q：polyfill 体积太大，如何裁剪？**
A：用 `exclude` 排除已知目标环境已支持的特性，或用 `include` 只保留必要项；并开启 `log: 'global'` 查看实际注入项与体积，逐项优化。

**Q：支持哪些 Vite 版本？**
A：`vite >=5 <8`（已在 Vite 5–7 范围内验证）。`core-js >= 3.30` 为必需 peer 依赖。

---

## 许可证

[MIT](./LICENSE)
