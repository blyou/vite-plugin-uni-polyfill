import type { ResolvedOptions } from '../options.type'
import { transform } from './transform'

export function getContext(options: ResolvedOptions) {
  const ctx = {
    root: '',
    options,
    transform(code: string, id: string) {
      return transform(code, id, ctx)
    },
  }

  return ctx
}
