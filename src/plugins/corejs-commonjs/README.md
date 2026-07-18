# vite-plugin-corejs-commonjs

自注册一个**仅作用于 core-js** 的 `@rollup/plugin-commonjs` 实例，解决 watch 模式下 CJS 模块解析错误与 polyfill 静默失效。

---

## 为什么需要这个插件

### 问题一：`__moduleExports is not exported`

core-js 的 polyfill 模块是 **CJS**（`module.exports` / `require`）。Vite 构建链内置的 `@rollup/plugin-commonjs` 会把它们转成 ESM：

```
// 源码 (CJS)
var $ = require('../internals/export')

// 内置 commonjs 转换后
import { __moduleExports as $ } from '../internals/export'
```

`__moduleExports` 是 commonjs 插件**按需合成的命名导出**。在 `build --watch` 动态新增 polyfill 时，若缓存的转换结果未同步该导出，就会触发：

```
"__moduleExports" is not exported by ".../core-js/internals/export.js"
```

这是 uniapp 差量编译缓存问题导致的 bug。

### 问题二：双实例导致 polyfill 静默失效

若两个 commonjs 实例都处理 core-js，core-js 内部模块（如 `internals/internal-state`）会被分别转换、模块图分裂，导致全局挂载（如 `Map.prototype.getOrInsert`、`URLSearchParams`）静默失效，运行时抛出 `getOrInsert is not a function`。

---

## 解决方案

### 1. 自带 commonjs 实例独占 core-js

```
        Vite 内置 commonjs (enforce: normal)
        ├── include: node_modules（默认）
        └── exclude: core-js/*          ← 跳过 core-js

     ↑ 本插件 commonjs (enforce: pre)    ← 先执行，唯一处理 core-js
        └── include: core-js 全部 polyfill 子目录
```

关键设计：

- **`enforce: 'pre'`**：先于内置实例执行。本实例把 core-js 转成 ESM 后，内置实例检测到已非 CJS 会直接跳过，实现**真正的单实例**。
- **`include: /(?:^|[\\/])core-js[\\/]/`**：简单匹配 core-js 包内所有文件。commonjs 插件只会处理真正的 CJS 文件（含 `require()` / `module.exports`），ESM 文件自动跳过，无需细分目录。

### 2. 内置实例排除 core-js

通过 `config` hook 向 `build.commonjsOptions.exclude` 注入 core-js 正则，让 Vite 内置 commonjs 实例跳过 core-js，实现"单实例"。

### 3. 裸 `@rollup/plugin-commonjs` 不产生 proxy 缓存分歧

自定义实例是裸 `commonjs({...})`，不走 `?commonjs-proxy` 包装机制。core-js 被内置实例 exclude 后，内置包装层根本不为它创建 `?commonjs-proxy`，自然没有 `?v=` query 键的缓存分歧问题。

---

## 关键模块

### `index.ts` — 插件入口

- `COREJS_PATTERN`：一行正则 `/(?:^|[\\/])core-js[\\/]/` 匹配 core-js 包内所有模块，commonjs 插件自动跳过 ESM，只处理 CJS。
- `VitePlugin()`：创建 commonjs 实例（`enforce: 'pre'`，`include: COREJS_PATTERN`），通过 `config` hook 向 `build.commonjsOptions.exclude` 注入同一正则，使内置实例跳过 core-js。

---

## 构建产物检验

```
contains __moduleExports : false                          ← 消除 __moduleExports
runtime: {"getOrInsert":"function","spHas":true}         ← polyfill 正确挂载
PASS: __moduleExports eliminated
PASS: getOrInsert mounted
```
