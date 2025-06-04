import {Options, Logger} from '../types'
import {migrate080} from './lte0.8.0'

export const migrateLegacyCode =
  (from: NonNullable<Options['migrate']>) => async (params: {files: string[]; logger: Logger}) => {
    const handlers: Record<typeof from, (p: typeof params) => unknown> = {
      '<=0.8.0': migrate080,
    }

    return handlers[from](params)
  }
