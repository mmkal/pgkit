import {GdescriberParams, Logger} from '../types'
import {checkClean} from '../util'
import {migrate080} from './lte0.8.0'

export const migrateLegacyCode = ({from, skipGitCheck}: NonNullable<GdescriberParams['migrate']>) => (params: {
  files: string[]
  logger: Logger
}) => {
  if (!skipGitCheck) {
    checkClean()
  }

  const handlers: Record<typeof from, (p: typeof params) => void> = {
    '<=0.8.0': migrate080,
  }

  return handlers[from](params)
}
