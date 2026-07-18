import { type Plugin } from 'vite'
import type { UserOptions } from './plugins/uni-polyfill/options.type'
import corejsCommonjs from './plugins/corejs-commonjs'
import uniPolyfill from './plugins/uni-polyfill'

export default function VitePlugin(options?: UserOptions): Plugin[] {
  const platform = process.env.UNI_PLATFORM

  const plugins: Plugin[] = [uniPolyfill(options)]

  if (platform !== 'h5') plugins.push(corejsCommonjs())

  return plugins
}
