import type { BuildEnvironmentOptions } from 'vite'
import type { ResolvedOptions } from '../options.type'
import { transform } from './transform'

export function getContext(options: ResolvedOptions) {
  const ctx = {
    root: '',
    minify: 'terser' as NonNullable<BuildEnvironmentOptions['minify']>,
    options,
    transform(code: string, id: string) {
      return transform(code, id, ctx)
    },
  }

  return ctx
}
